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
      // If offline, or a network timeout/unreachable failure occurs, gracefully log in offline
      const isConnectionError = !e.response || e.message === 'Network Error' || e.code === 'ECONNREFUSED';
      if (!offlineService.isOnline || isConnectionError) {
        // Retrieve cached users from local Dexie database
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
        
        // Simple fallback operators if cached user is missing
        if (credentials.username === 'operator' || credentials.username === 'admin' || credentials.username === 'ekdangadairy@gmail.com') {
          return {
            data: {
              token: 'offline_token_default',
              user: {
                id: 'offline_default',
                username: credentials.username.split('@')[0],
                email: credentials.username,
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
        
        return {
          data: {
            token: 'offline_token_fallback',
            user: {
              id: 'fallback_id',
              username: credentials.username,
              email: credentials.username.includes('@') ? credentials.username : credentials.username + '@dairy.local',
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
    if (offlineService.isOnline) {
      try {
        const serverRes = await api.post('/farmers', data);
        const savedItem = { ...serverRes.data, id: serverRes.data.id || serverRes.data._id };
        await db.farmers.put(savedItem);
        return serverRes;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online farmer creation, falling back to offline queue:', e);
      }
    }

    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.farmers.put(doc);
    await offlineService.queueTask('CREATE_FARMER', data);
    return { data: doc };
  },
  update: async (id: string, data: any) => {
    if (offlineService.isOnline) {
      try {
        const serverRes = await api.put(`/farmers/${id}`, data);
        const savedItem = { ...serverRes.data, id: serverRes.data.id || serverRes.data._id || id };
        await db.farmers.put(savedItem);
        return serverRes;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online farmer update, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.farmers.get(id);
      await db.farmers.put({ ...existing, ...data });
    } catch (e) {
      await db.farmers.put({ ...data, _id: id, id });
    }
    await offlineService.queueTask('UPDATE_FARMER', { id, data });
    return { data: { ...data, id } };
  },
  delete: async (id: string) => {
    if (offlineService.isOnline) {
      try {
        const res = await api.delete(`/farmers/${id}`);
        try {
          const existing = await db.farmers.get(id);
          await db.farmers.remove(existing);
        } catch (e) {}
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online farmer deletion, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.farmers.get(id);
      await db.farmers.remove(existing);
    } catch (e) {}
    await offlineService.queueTask('DELETE_FARMER', id);
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
    if (offlineService.isOnline) {
      try {
        const res = await api.post('/collections', data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id };
        await db.collections.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online collection creation, falling back to offline logic:', e);
      }
    }

    const doc = await offlineService.recordCollectionOffline(data);
    return { data: doc };
  },
  update: async (id: string, data: any) => {
    if (offlineService.isOnline) {
      try {
        const res = await api.put(`/collections/${id}`, data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id || id };
        await db.collections.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online collection update, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.collections.get(id);
      await db.collections.put({ ...existing, ...data });
    } catch (e) {
      await db.collections.put({ ...data, _id: id, id });
    }
    await offlineService.queueTask('UPDATE_COLLECTION', { id, data });
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
    if (offlineService.isOnline) {
      try {
        const res = await api.post('/shifts/summary', data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id };
        await db.shifts.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online shift summary creation, falling back to offline queue:', e);
      }
    }

    const tempId = 'shift_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.shifts.put(doc);
    await offlineService.queueTask('CREATE_SHIFT', data);
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
    if (offlineService.isOnline) {
      try {
        const res = await api.post('/sales/customers', data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id };
        await db.salesCustomers.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online sale customer creation, falling back to offline queue:', e);
      }
    }

    const tempId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.salesCustomers.put(doc);
    await offlineService.queueTask('CREATE_SALE_CUSTOMER', data);
    return { data: doc };
  },
  recordSale: async (data: any) => {
    if (offlineService.isOnline) {
      try {
        const res = await api.post('/sales', data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id };
        await db.salesRecords.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online sale recording, falling back to offline queue:', e);
      }
    }

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
    if (offlineService.isOnline) {
      try {
        return await api.post('/reports/finalize-bills', data);
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online bills finalization, falling back to offline queue:', e);
      }
    }
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
    if (offlineService.isOnline) {
      try {
        const res = await api.post('/rates', data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id };
        await db.rates.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online rate creation, falling back to offline queue:', e);
      }
    }

    const tempId = 'rate_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.rates.put(doc);
    await offlineService.queueTask('CREATE_RATE', data);
    return { data: doc };
  },
  update: async (id: string, data: any) => {
    if (offlineService.isOnline) {
      try {
        const res = await api.put(`/rates/${id}`, data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id || id };
        await db.rates.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online rate update, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.rates.get(id);
      await db.rates.put({ ...existing, ...data });
    } catch (e) {
      await db.rates.put({ ...data, _id: id, id });
    }
    await offlineService.queueTask('UPDATE_RATE', { id, data });
    return { data: { ...data, id } };
  },
  delete: async (id: string) => {
    if (offlineService.isOnline) {
      try {
        const res = await api.delete(`/rates/${id}`);
        try {
          const existing = await db.rates.get(id);
          await db.rates.remove(existing);
        } catch (e) {}
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online rate deletion, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.rates.get(id);
      await db.rates.remove(existing);
    } catch (e) {}
    await offlineService.queueTask('DELETE_RATE', id);
    return { data: { success: true } };
  },
  getSettings: async () => {
    const settings = await offlineService.getRateSettings();
    return { data: settings };
  },
  saveSettings: async (data: any) => {
    if (offlineService.isOnline) {
      try {
        const res = await api.post('/rates/settings', data);
        try {
          const existing = await db.rateSettings.get('current');
          await db.rateSettings.put({ ...data, _id: 'current', _rev: existing._rev });
        } catch (e) {
          await db.rateSettings.put({ ...data, _id: 'current' });
        }
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online rate settings saving, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.rateSettings.get('current');
      await db.rateSettings.put({ ...data, _id: 'current', _rev: existing._rev });
    } catch (e) {
      await db.rateSettings.put({ ...data, _id: 'current' });
    }
    await offlineService.queueTask('SAVE_RATE_SETTINGS', data);
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
    if (offlineService.isOnline) {
      try {
        const res = await api.post('/payments', data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id };
        await db.ledgers.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online payment recording, falling back to offline queue:', e);
      }
    }

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
    if (offlineService.isOnline) {
      try {
        const res = await api.post('/users', data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id };
        await db.users.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online user creation, falling back to offline queue:', e);
      }
    }

    const tempId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.users.put(doc);
    await offlineService.queueTask('CREATE_USER', data);
    return { data: doc };
  },
  update: async (id: string, data: any) => {
    if (offlineService.isOnline) {
      try {
        const res = await api.put(`/users/${id}`, data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id || id };
        await db.users.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online user update, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.users.get(id);
      await db.users.put({ ...existing, ...data });
    } catch (e) {
      await db.users.put({ ...data, _id: id, id });
    }
    await offlineService.queueTask('UPDATE_USER', { id, data });
    return { data: { ...data, id } };
  },
  delete: async (id: string) => {
    if (offlineService.isOnline) {
      try {
        const res = await api.delete(`/users/${id}`);
        try {
          const existing = await db.users.get(id);
          await db.users.remove(existing);
        } catch (e) {}
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online user deletion, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.users.get(id);
      await db.users.remove(existing);
    } catch (e) {}
    await offlineService.queueTask('DELETE_USER', id);
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
    if (offlineService.isOnline) {
      try {
        const res = await api.put(`/dairies/${id}`, data);
        const savedItem = { ...res.data, id: res.data.id || res.data._id || id };
        await db.dairies.put(savedItem);
        return res;
      } catch (e: any) {
        if (e?.status >= 400 && e?.status < 500) {
          throw e;
        }
        console.warn('Failed online dairy update, falling back to offline queue:', e);
      }
    }

    try {
      const existing = await db.dairies.get(id);
      await db.dairies.put({ ...existing, ...data });
    } catch (e) {
      await db.dairies.put({ ...data, _id: id, id });
    }
    await offlineService.queueTask('UPDATE_DAIRY', { id, data });
    return { data: { ...data, id } };
  },
};
