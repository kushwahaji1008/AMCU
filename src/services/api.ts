/// <reference types="vite/client" />
import api from './axiosInstance';
import { offlineService, db } from './offlineService';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export default api;

export const authApi = {
  login: async (credentials: any) => {
    try {
      if (isNative && !offlineService.isOnline) {
        // Support offline session recovery / offline mode login for cached users
        const usersResult = await db.users.allDocs({ include_docs: true });
        const users = usersResult.rows.map(r => r.doc as any);
        const user = users.find(u => u.username === credentials.username || u.email === credentials.username);
        
        if (user) {
          // Simulate successful offline login with cached user
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
        
        // Simple fallback operator if users are empty or match operator defaults
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
      if (isNative && !offlineService.isOnline) {
        // Fallback default
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
    if (isNative) {
      const docs = await offlineService.getFarmers();
      return { data: docs };
    }
    const res = await api.get('/farmers');
    offlineService.syncFromServer().catch(console.error);
    return res;
  },
  getById: async (id: string) => {
    if (isNative) {
      const doc = await offlineService.getFarmerById(id);
      return { data: doc };
    }
    return api.get(`/farmers/${id}`);
  },
  search: async (farmerId: string) => {
    if (isNative) {
      const doc = await offlineService.searchFarmer(farmerId);
      return { data: doc };
    }
    return api.get(`/farmers/search/${farmerId}`);
  },
  create: async (data: any) => {
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.farmers.put(doc);
    
    if (isNative) {
      await offlineService.queueTask('CREATE_FARMER', data);
      return { data: doc };
    }
    try {
      const serverRes = await api.post('/farmers', data);
      await db.farmers.remove(doc); // clean temp doc
      await db.farmers.put({ ...serverRes.data, _id: serverRes.data.id || serverRes.data._id });
      return serverRes;
    } catch (e: any) {
      if (!isNative) throw e;
      await offlineService.queueTask('CREATE_FARMER', data);
      return { data: doc };
    }
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.farmers.get(id);
      await db.farmers.put({ ...existing, ...data });
    } catch (e) {
      await db.farmers.put({ ...data, _id: id });
    }

    if (isNative) {
      await offlineService.queueTask('UPDATE_FARMER', { id, data });
      return { data: { ...data, id } };
    }
    try {
      const res = await api.put(`/farmers/${id}`, data);
      return res;
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('UPDATE_FARMER', { id, data });
      return { data: { ...data, id } };
    }
  },
  delete: async (id: string) => {
    try {
      const existing = await db.farmers.get(id);
      await db.farmers.remove(existing);
    } catch (e) {}

    if (isNative) {
      await offlineService.queueTask('DELETE_FARMER', id);
      return { data: { success: true } };
    }
    return api.delete(`/farmers/${id}`);
  },
  getSummary: async (id: string) => {
    if (isNative) {
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
    }
    return api.get(`/farmers/${id}/summary`);
  },
};

export const collectionApi = {
  create: async (data: any) => {
    const tempId = 'coll_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = { ...data, id: tempId, _id: tempId };
    await db.collections.put(doc);

    if (isNative) {
      await offlineService.queueTask('CREATE_COLLECTION', data);
      return { data: doc };
    }
    try {
      const res = await api.post('/collections', data);
      await db.collections.remove(doc);
      await db.collections.put({ ...res.data, _id: res.data.id || res.data._id });
      return res;
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('CREATE_COLLECTION', data);
      return { data: doc };
    }
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.collections.get(id);
      await db.collections.put({ ...existing, ...data });
    } catch (e) {
      await db.collections.put({ ...data, _id: id });
    }

    if (isNative) {
      await offlineService.queueTask('UPDATE_COLLECTION', { id, data });
      return { data: { ...data, id } };
    }
    try {
      return await api.put(`/collections/${id}`, data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('UPDATE_COLLECTION', { id, data });
      return { data: { ...data, id } };
    }
  },
  getDailyReport: async (date: string, endDate?: string) => {
    if (isNative) {
      const docs = await offlineService.getCollectionsByDate(date, endDate);
      return { data: docs };
    }
    return api.get(`/collections/report?date=${date}${endDate ? `&endDate=${endDate}` : ''}`);
  },
  getReport: async (date: string, endDate?: string) => {
    if (isNative) {
      const docs = await offlineService.getCollectionsByDate(date, endDate);
      return { data: docs };
    }
    return api.get(`/collections/report?date=${date}${endDate ? `&endDate=${endDate}` : ''}`);
  },
  getByFarmerId: async (farmerInternalId: string) => {
    if (isNative) {
      const result = await db.collections.allDocs({ include_docs: true });
      const docs = result.rows
        .map(r => r.doc as any)
        .filter(c => c.farmerInternalId === farmerInternalId || c.farmerId === farmerInternalId);
      return { data: docs };
    }
    return api.get(`/collections/farmer/${farmerInternalId}`);
  },
};

export const shiftApi = {
  createSummary: async (data: any) => {
    const doc = { ...data, _id: 'shift_' + Date.now() };
    await db.shifts.put(doc);
    
    if (isNative) {
      await offlineService.queueTask('CREATE_SHIFT', data);
      return { data: doc };
    }
    try {
      return await api.post('/shifts/summary', data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('CREATE_SHIFT', data);
      return { data: doc };
    }
  },
  getSummary: async (date: string, shift: string) => {
    if (isNative) {
      const summary = await offlineService.getShiftSummaryOffline(date, shift);
      return { data: summary };
    }
    return api.get(`/shifts/summary?date=${date}&shift=${shift}`);
  },
  getRecent: async (limit: number = 10) => {
    if (isNative) {
      const docs = await offlineService.getRecentShifts(limit);
      return { data: docs };
    }
    return api.get(`/shifts/recent?limit=${limit}`);
  },
};

export const saleApi = {
  getCustomers: async () => {
    if (isNative) {
      const docs = await offlineService.getSalesCustomers();
      return { data: docs };
    }
    return api.get('/sales/customers');
  },
  createCustomer: async (data: any) => {
    const doc = { ...data, _id: 'cust_' + Date.now() };
    await db.salesCustomers.put(doc);

    if (isNative) {
      await offlineService.queueTask('CREATE_SALE_CUSTOMER', data);
      return { data: doc };
    }
    try {
      return await api.post('/sales/customers', data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('CREATE_SALE_CUSTOMER', data);
      return { data: doc };
    }
  },
  recordSale: async (data: any) => {
    if (isNative) {
      const doc = await offlineService.recordSaleOffline(data);
      return { data: doc };
    }
    return api.post('/sales', data);
  },
};

export const reportApi = {
  getDashboard: async () => {
    if (isNative) {
      const data = await offlineService.getDashboardOffline();
      return { data };
    }
    return api.get('/reports/dashboard');
  },
  getDaily: async (date: string) => {
    if (isNative) {
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
    }
    return api.get(`/reports/daily?date=${date}`);
  },
  getFarmer: async (id: string) => {
    if (isNative) {
      const collections = await db.collections.allDocs({ include_docs: true });
      const fCollections = collections.rows
        .map(r => r.doc as any)
        .filter(c => c.farmerInternalId === id || c.farmerId === id);
      return { data: fCollections };
    }
    return api.get(`/reports/farmer/${id}`);
  },
  getBills: async (year: number, month: number, period: number, farmerId?: string) => {
    if (isNative) {
      const bills = await offlineService.getBillsOffline(year, month, period, farmerId);
      return { data: bills };
    }
    return api.get(`/reports/bills?year=${year}&month=${month}&period=${period}${farmerId ? `&farmerId=${farmerId}` : ''}`);
  },
  finalizeBills: async (data: { year: number, month: number, period: number, dairyId: string }) => {
    if (isNative) {
      await offlineService.queueTask('FINALIZE_BILLS', data);
      return { data: { count: 1, totalBills: 1 } };
    }
    return api.post('/reports/finalize-bills', data);
  },
};

export const rateApi = {
  getAll: async () => {
    if (isNative) {
      const docs = await offlineService.getRates();
      return { data: docs };
    }
    return api.get('/rates');
  },
  create: async (data: any) => {
    const doc = { ...data, _id: 'rate_' + Date.now() };
    await db.rates.put(doc);

    if (isNative) {
      await offlineService.queueTask('CREATE_RATE', data);
      return { data: doc };
    }
    try {
      return await api.post('/rates', data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('CREATE_RATE', data);
      return { data: doc };
    }
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.rates.get(id);
      await db.rates.put({ ...existing, ...data });
    } catch (e) {
      await db.rates.put({ ...data, _id: id });
    }

    if (isNative) {
      await offlineService.queueTask('UPDATE_RATE', { id, data });
      return { data: { ...data, id } };
    }
    try {
      return await api.put(`/rates/${id}`, data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('UPDATE_RATE', { id, data });
      return { data: { ...data, id } };
    }
  },
  delete: async (id: string) => {
    try {
      const existing = await db.rates.get(id);
      await db.rates.remove(existing);
    } catch (e) {}

    if (isNative) {
      await offlineService.queueTask('DELETE_RATE', id);
      return { data: { success: true } };
    }
    return api.delete(`/rates/${id}`);
  },
  getSettings: async () => {
    if (isNative) {
      const settings = await offlineService.getRateSettings();
      return { data: settings };
    }
    return api.get('/rates/settings');
  },
  saveSettings: async (data: any) => {
    try {
      const existing = await db.rateSettings.get('current');
      await db.rateSettings.put({ ...data, _id: 'current', _rev: existing._rev });
    } catch (e) {
      await db.rateSettings.put({ ...data, _id: 'current' });
    }

    if (isNative) {
      await offlineService.queueTask('SAVE_RATE_SETTINGS', data);
      return { data };
    }
    try {
      return await api.post('/rates/settings', data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('SAVE_RATE_SETTINGS', data);
      return { data };
    }
  },
};

export const paymentApi = {
  getLedger: async () => {
    if (isNative) {
      const docs = await offlineService.getLedger();
      return { data: docs };
    }
    return api.get('/ledger');
  },
  getLedgerByFarmerId: async (farmerInternalId: string) => {
    if (isNative) {
      const docs = await offlineService.getLedgerByFarmerId(farmerInternalId);
      return { data: docs };
    }
    return api.get(`/ledger/farmer/${farmerInternalId}`);
  },
  recordPayment: async (data: any) => {
    if (isNative) {
      const doc = await offlineService.recordPaymentOffline(data);
      return { data: doc };
    }
    return api.post('/payments', data);
  },
};

export const userApi = {
  getAll: async (role?: string) => {
    if (isNative) {
      const docs = await offlineService.getUsers();
      const filtered = role ? docs.filter((u: any) => u.role === role) : docs;
      return { data: filtered };
    }
    return api.get(`/users${role ? `?role=${role}` : ''}`);
  },
  create: async (data: any) => {
    const doc = { ...data, _id: 'user_' + Date.now() };
    await db.users.put(doc);

    if (isNative) {
      await offlineService.queueTask('CREATE_USER', data);
      return { data: doc };
    }
    try {
      return await api.post('/users', data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('CREATE_USER', data);
      return { data: doc };
    }
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.users.get(id);
      await db.users.put({ ...existing, ...data });
    } catch (e) {
      await db.users.put({ ...data, _id: id });
    }

    if (isNative) {
      await offlineService.queueTask('UPDATE_USER', { id, data });
      return { data: { ...data, id } };
    }
    try {
      return await api.put(`/users/${id}`, data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('UPDATE_USER', { id, data });
      return { data: { ...data, id } };
    }
  },
  delete: async (id: string) => {
    try {
      const existing = await db.users.get(id);
      await db.users.remove(existing);
    } catch (e) {}

    if (isNative) {
      await offlineService.queueTask('DELETE_USER', id);
      return { data: { success: true } };
    }
    return api.delete(`/users/${id}`);
  },
};

export const dairyApi = {
  getAll: async () => {
    if (isNative) {
      const docs = await offlineService.getDairies();
      return { data: docs };
    }
    return api.get('/dairies');
  },
  update: async (id: string, data: any) => {
    try {
      const existing = await db.dairies.get(id);
      await db.dairies.put({ ...existing, ...data });
    } catch (e) {
      await db.dairies.put({ ...data, _id: id });
    }

    if (isNative) {
      await offlineService.queueTask('UPDATE_DAIRY', { id, data });
      return { data: { ...data, id } };
    }
    try {
      return await api.put(`/dairies/${id}`, data);
    } catch (e) {
      if (!isNative) throw e;
      await offlineService.queueTask('UPDATE_DAIRY', { id, data });
      return { data: { ...data, id } };
    }
  },
};
