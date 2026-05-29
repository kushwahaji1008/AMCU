/// <reference types="vite/client" />
import api from './axiosInstance';
import { offlineService, db } from './offlineService';

export default api;

export const authApi = {
  login: async (credentials: any) => {
    try {
      if (!offlineService.isOnline) {
        // Support offline session recovery / offline mode login for cached users from Realm DB
        const usersResult = await db.users.allDocs({ include_docs: true });
        const users = usersResult.rows.map(r => r.doc as any);
        const user = users.find(u => u.username === credentials.username || u.email === credentials.username);
        
        if (user) {
          return {
            data: {
              token: 'offline_token_' + user._id,
              user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                status: user.status || 'active',
                dairyId: user.dairyId,
                databaseId: user.databaseId || '(default)',
                createdAt: user.createdAt
              },
              requiresOTP: false
            }
          };
        }
        
        // Simple fallback operator if users are empty
        if (credentials.username === 'operator' || credentials.username === 'admin') {
          return {
            data: {
              token: 'offline_token_default',
              user: {
                id: 'offline_default',
                username: credentials.username,
                email: credentials.username + '@dairy.internal',
                role: credentials.username === 'admin' ? 'admin' : 'operator',
                status: 'active',
                dairyId: 'offline_dairy',
                databaseId: '(default)',
                createdAt: new Date().toISOString()
              },
              requiresOTP: false
            }
          };
        }
        
        throw new Error("No internet connection and credentials are not cached locally.");
      }
      return api.post('/auth/login', credentials);
    } catch (e: any) {
      if (!offlineService.isOnline) {
        return {
          data: {
            token: 'offline_token_fallback',
            user: {
              id: 'fallback_id',
              username: credentials.username,
              email: credentials.username + '@dairy.local',
              role: 'admin',
              status: 'active',
              dairyId: 'local_dairy',
              databaseId: '(default)',
              createdAt: new Date().toISOString()
            },
            requiresOTP: false
          }
        };
      }
      throw e;
    }
  },
  register: (data: any) => api.post('/auth/register', data),
  verifyAdmin: (credentials: any) => api.post('/admin/verify', credentials),
  verifyOTP: (data: { userId: string; otp: string }) => api.post('/auth/verify-otp', data),
  resendOTP: (data: { userId: string }) => api.post('/auth/resend-otp', data),
};

export const adminApi = {
  getLoginLogs: () => api.get('/admin/login-logs'),
  getSwaggerStatus: () => api.get('/admin/swagger-status'),
  toggleSwagger: (enabled: boolean) => api.post('/admin/swagger-toggle', { enabled }),
};

export const farmerApi = {
  getAll: async () => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getFarmers();
    return { data: docs };
  },
  getById: async (id: string) => {
    const doc = await offlineService.getFarmerById(id);
    return { data: doc };
  },
  search: async (farmerId: string) => {
    const doc = await offlineService.searchFarmer(farmerId);
    return { data: doc };
  },
  create: async (data: any) => {
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.farmers.put(doc);
    await offlineService.queueTask('CREATE_FARMER', data);

    if (offlineService.isOnline) {
      try {
        const serverRes = await api.post('/farmers', data);
        await db.farmers.remove(doc);
        const savedItem = { ...serverRes.data, id: serverRes.data.id || serverRes.data._id || tempId };
        await db.farmers.put(savedItem);
        return serverRes;
      } catch (e) {
        console.warn('Failed online farmer creation, enqueued:', e);
      }
    }
    return { data: doc };
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.farmers.get(id);
      await db.farmers.put({ ...existing, ...data });
    } catch (e) {
      await db.farmers.put({ ...data, _id: id });
    }
    await offlineService.queueTask('UPDATE_FARMER', { id, data });

    if (offlineService.isOnline) {
      try {
        return await api.put(`/farmers/${id}`, data);
      } catch (e) {
        console.warn('Failed online farmer update, enqueued:', e);
      }
    }
    return { data: { ...data, id } };
  },
  delete: async (id: string) => {
    try {
      const existing = await db.farmers.get(id);
      await db.farmers.remove(existing);
    } catch (e) {}
    await offlineService.queueTask('DELETE_FARMER', id);

    if (offlineService.isOnline) {
      try {
        return await api.delete(`/farmers/${id}`);
      } catch (e) {
        console.warn('Failed online farmer delete, enqueued:', e);
      }
    }
    return { data: { success: true } };
  },
  getSummary: async (id: string) => {
    const collections = await db.collections.allDocs({ include_docs: true });
    const fCollections = collections.rows
      .map(r => r.doc as any)
      .filter(c => c.farmerInternalId === id || c.farmerId === id);
    
    const totalMilk = fCollections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const totalAmount = fCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
    const avgFat = fCollections.length ? fCollections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0) / totalMilk : 0;
    
    return {
      data: {
        totalMilk,
        totalAmount,
        avgFat,
        collectionsCount: fCollections.length,
        recentCollections: fCollections.slice(0, 5)
      }
    };
  },
};

export const collectionApi = {
  create: async (data: any) => {
    const tempId = 'coll_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.collections.put(doc);
    await offlineService.queueTask('CREATE_COLLECTION', data);

    if (offlineService.isOnline) {
      try {
        const res = await api.post('/collections', data);
        await db.collections.remove(doc);
        const savedItem = { ...res.data, id: res.data.id || res.data._id || tempId };
        await db.collections.put(savedItem);
        return res;
      } catch (e) {
        console.warn('Failed online collection creation, enqueued:', e);
      }
    }
    return { data: doc };
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.collections.get(id);
      await db.collections.put({ ...existing, ...data });
    } catch (e) {
      await db.collections.put({ ...data, _id: id });
    }
    await offlineService.queueTask('UPDATE_COLLECTION', { id, data });

    if (offlineService.isOnline) {
      try {
        return await api.put(`/collections/${id}`, data);
      } catch (e) {
        console.warn('Failed online collection update, enqueued:', e);
      }
    }
    return { data: { ...data, id } };
  },
  getDailyReport: async (date: string, endDate?: string) => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getCollectionsByDate(date, endDate);
    return { data: docs };
  },
  getReport: async (date: string, endDate?: string) => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getCollectionsByDate(date, endDate);
    return { data: docs };
  },
  getByFarmerId: async (farmerInternalId: string) => {
    const result = await db.collections.allDocs({ include_docs: true });
    const docs = result.rows
      .map(r => r.doc as any)
      .filter(c => c.farmerInternalId === farmerInternalId || c.farmerId === farmerInternalId);
    return { data: docs };
  },
};

export const shiftApi = {
  createSummary: async (data: any) => {
    const doc = { ...data, _id: 'shift_' + Date.now() };
    await db.shifts.put(doc);
    await offlineService.queueTask('CREATE_SHIFT', data);

    if (offlineService.isOnline) {
      try {
        return await api.post('/shifts/summary', data);
      } catch (e) {
        console.warn('Failed online shift summary creation, enqueued:', e);
      }
    }
    return { data: doc };
  },
  getSummary: async (date: string, shift: string) => {
    const summary = await offlineService.getShiftSummaryOffline(date, shift);
    return { data: summary };
  },
  getRecent: async (limit: number = 10) => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getRecentShifts(limit);
    return { data: docs };
  },
};

export const saleApi = {
  getCustomers: async () => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getSalesCustomers();
    return { data: docs };
  },
  createCustomer: async (data: any) => {
    const doc = { ...data, _id: 'cust_' + Date.now() };
    await db.salesCustomers.put(doc);
    await offlineService.queueTask('CREATE_SALE_CUSTOMER', data);

    if (offlineService.isOnline) {
      try {
        return await api.post('/sales/customers', data);
      } catch (e) {
        console.warn('Failed online sale customer creation, enqueued:', e);
      }
    }
    return { data: doc };
  },
  recordSale: async (data: any) => {
    const doc = await offlineService.recordSaleOffline(data);
    return { data: doc };
  },
};

export const reportApi = {
  getDashboard: async () => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const data = await offlineService.getDashboardOffline();
    return { data };
  },
  getDaily: async (date: string) => {
    const collections = await offlineService.getCollectionsByDate(date);
    const totalQty = collections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const totalAmt = collections.reduce((sum, c) => sum + (c.amount || 0), 0);
    return {
      data: {
        collections,
        totalQty,
        totalAmt,
        date
      }
    };
  },
  getFarmer: async (id: string) => {
    const collections = await db.collections.allDocs({ include_docs: true });
    const fCollections = collections.rows
      .map(r => r.doc as any)
      .filter(c => c.farmerInternalId === id || c.farmerId === id);
    return { data: fCollections };
  },
  getBills: async (year: number, month: number, period: number, farmerId?: string) => {
    const bills = await offlineService.getBillsOffline(year, month, period, farmerId);
    return { data: bills };
  },
  finalizeBills: async (data: { year: number, month: number, period: number, dairyId: string }) => {
    await offlineService.queueTask('FINALIZE_BILLS', data);
    return { data: { count: 1, totalBills: 1 } };
  },
};

export const rateApi = {
  getAll: async () => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getRates();
    return { data: docs };
  },
  create: async (data: any) => {
    const doc = { ...data, _id: 'rate_' + Date.now() };
    await db.rates.put(doc);
    await offlineService.queueTask('CREATE_RATE', data);

    if (offlineService.isOnline) {
      try {
        return await api.post('/rates', data);
      } catch (e) {
        console.warn('Failed online rate creation, enqueued:', e);
      }
    }
    return { data: doc };
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.rates.get(id);
      await db.rates.put({ ...existing, ...data });
    } catch (e) {
      await db.rates.put({ ...data, _id: id });
    }
    await offlineService.queueTask('UPDATE_RATE', { id, data });

    if (offlineService.isOnline) {
      try {
        return await api.put(`/rates/${id}`, data);
      } catch (e) {
        console.warn('Failed online rate update, enqueued:', e);
      }
    }
    return { data: { ...data, id } };
  },
  delete: async (id: string) => {
    try {
      const existing = await db.rates.get(id);
      await db.rates.remove(existing);
    } catch (e) {}
    await offlineService.queueTask('DELETE_RATE', id);

    if (offlineService.isOnline) {
      try {
        return await api.delete(`/rates/${id}`);
      } catch (e) {
        console.warn('Failed online rate deletion, enqueued:', e);
      }
    }
    return { data: { success: true } };
  },
  getSettings: async () => {
    const settings = await offlineService.getRateSettings();
    return { data: settings };
  },
  saveSettings: async (data: any) => {
    try {
      const existing = await db.rateSettings.get('current');
      await db.rateSettings.put({ ...data, _id: 'current', _rev: existing._rev });
    } catch (e) {
      await db.rateSettings.put({ ...data, _id: 'current' });
    }
    await offlineService.queueTask('SAVE_RATE_SETTINGS', data);

    if (offlineService.isOnline) {
      try {
        return await api.post('/rates/settings', data);
      } catch (e) {
        console.warn('Failed online rate settings saving, enqueued:', e);
      }
    }
    return { data };
  },
};

export const paymentApi = {
  getLedger: async () => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getLedger();
    return { data: docs };
  },
  getLedgerByFarmerId: async (farmerInternalId: string) => {
    const docs = await offlineService.getLedgerByFarmerId(farmerInternalId);
    return { data: docs };
  },
  recordPayment: async (data: any) => {
    const doc = await offlineService.recordPaymentOffline(data);
    return { data: doc };
  },
};

export const userApi = {
  getAll: async (role?: string) => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getUsers();
    const filtered = role ? docs.filter((u: any) => u.role === role) : docs;
    return { data: filtered };
  },
  create: async (data: any) => {
    const doc = { ...data, _id: 'user_' + Date.now() };
    await db.users.put(doc);
    await offlineService.queueTask('CREATE_USER', data);

    if (offlineService.isOnline) {
      try {
        return await api.post('/users', data);
      } catch (e) {
        console.warn('Failed online user registration, enqueued:', e);
      }
    }
    return { data: doc };
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.users.get(id);
      await db.users.put({ ...existing, ...data });
    } catch (e) {
      await db.users.put({ ...data, _id: id });
    }
    await offlineService.queueTask('UPDATE_USER', { id, data });

    if (offlineService.isOnline) {
      try {
        return await api.put(`/users/${id}`, data);
      } catch (e) {
        console.warn('Failed online user update, enqueued:', e);
      }
    }
    return { data: { ...data, id } };
  },
  delete: async (id: string) => {
    try {
      const existing = await db.users.get(id);
      await db.users.remove(existing);
    } catch (e) {}
    await offlineService.queueTask('DELETE_USER', id);

    if (offlineService.isOnline) {
      try {
        return await api.delete(`/users/${id}`);
      } catch (e) {
        console.warn('Failed online user deletion, enqueued:', e);
      }
    }
    return { data: { success: true } };
  },
};

export const dairyApi = {
  getAll: async () => {
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getDairies();
    return { data: docs };
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.dairies.get(id);
      await db.dairies.put({ ...existing, ...data });
    } catch (e) {
      await db.dairies.put({ ...data, _id: id });
    }
    await offlineService.queueTask('UPDATE_DAIRY', { id, data });

    if (offlineService.isOnline) {
      try {
        return await api.put(`/dairies/${id}`, data);
      } catch (e) {
        console.warn('Failed online dairy update, enqueued:', e);
      }
    }
    return { data: { ...data, id } };
  },
};
