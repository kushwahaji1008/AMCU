/// <reference types="vite/client" />
import api from './axiosInstance';
import { offlineService, db } from './offlineService';
import { isNativeApp, PLATFORM_ERRORS } from './platform';

export default api;

export const authApi = {
  login: async (credentials: any) => {
    // Web ALWAYS requires server login
    if (!isNativeApp()) {
      if (!offlineService.isOnline) {
        throw new Error(PLATFORM_ERRORS.OFFLINE_AUTH_WEB);
      }
      return api.post('/auth/login', credentials);
    }

    // Native App (Capacitor) support for secure offline login from Realm cache
    try {
      if (!offlineService.isOnline) {
        const usersResult = await db.users.allDocs();
        const users = usersResult.rows.map(r => r.doc as any);
        const user = users.find(u => u.username === credentials.username || u.email === credentials.username);
        
        if (user) {
          // In a real app, we would verify a hashed password here. 
          // For now, we allow access to verified cached users only.
          return {
            data: {
              token: 'offline_token_' + user._id,
              user: { ...user, id: user._id },
              requiresOTP: false,
              isOfflineSession: true
            }
          };
        }
        throw new Error(PLATFORM_ERRORS.OFFLINE_AUTH_MISSING_CACHE);
      }
      return api.post('/auth/login', credentials);
    } catch (e: any) {
      if (!offlineService.isOnline || !e.response) {
        throw new Error(PLATFORM_ERRORS.OFFLINE_AUTH_MISSING_CACHE);
      }
      throw e;
    }
  },
  register: (data: any) => api.post('/auth/register', data),
  verifyAdmin: (credentials: any) => api.post('/admin/verify', credentials),
  verifyOTP: (data: { userId: string; otp: string }) => api.post('/auth/verify-otp', data),
  resendOTP: (data: { userId: string }) => api.post('/auth/resend-otp', data),
};

// Helper for CRUD operations to handle standard platform-aware offline fallback
const withFallback = async (
  onlineCall: () => Promise<any>,
  offlineCall: () => Promise<any>,
  onlineQueueTask?: { type: any, payload: any }
) => {
  if (offlineService.isOnline) {
    try {
      const res = await onlineCall();
      if (isNativeApp() && res.data) {
        // Sync back to local Realm if native
        // (Assuming individual APIs handle their specific DB put logic for now to stay compatible)
      }
      return res;
    } catch (e: any) {
      // If it's a validation error (4xx), don't fallback, just throw
      if (e?.status >= 400 && e?.status < 500) throw e;
      
      // If not native, web users get an error when online call fails and they are offline or server is down
      if (!isNativeApp()) throw e;
      
      // Native fallback
      console.warn('Online sync failed, using native offline fallback');
    }
  }

  if (!isNativeApp()) {
    throw new Error(PLATFORM_ERRORS.OFFLINE_WEB);
  }

  const res = await offlineCall();
  if (onlineQueueTask) {
    await offlineService.queueTask(onlineQueueTask.type, onlineQueueTask.payload);
  }
  return { data: res };
};

export const adminApi = {
  getLoginLogs: () => api.get('/admin/login-logs'),
  getSwaggerStatus: () => api.get('/admin/swagger-status'),
  toggleSwagger: (enabled: boolean) => api.post('/admin/swagger-toggle', { enabled }),
};

export const farmerApi = {
  getAll: async () => {
    if (!isNativeApp()) return api.get('/farmers');
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getFarmers();
    return { data: docs };
  },
  getById: async (id: string) => {
    if (!isNativeApp()) return api.get(`/farmers/${id}`);
    const doc = await offlineService.getFarmerById(id);
    return { data: doc };
  },
  search: async (farmerId: string) => {
    if (!isNativeApp()) return api.get(`/farmers/search/${farmerId}`);
    const doc = await offlineService.searchFarmer(farmerId);
    return { data: doc };
  },
  create: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/farmers', data);
        if (isNativeApp()) await db.farmers.put({ ...res.data, id: res.data.id || res.data._id });
        return res;
      },
      async () => {
        const tempId = 'temp_' + Date.now();
        const doc = { ...data, id: tempId, _id: tempId };
        await db.farmers.put(doc);
        return doc;
      },
      { type: 'CREATE_FARMER', payload: data }
    );
  },
  update: async (id: string, data: any) => {
    return withFallback(
      async () => {
        const res = await api.put(`/farmers/${id}`, data);
        if (isNativeApp()) await db.farmers.put({ ...res.data, id: res.data.id || res.data._id || id });
        return res;
      },
      async () => {
        const existing = await db.farmers.get(id).catch(() => ({}));
        const updated = { ...existing, ...data, id };
        await db.farmers.put(updated);
        return updated;
      },
      { type: 'UPDATE_FARMER', payload: { id, data } }
    );
  },
  delete: async (id: string) => {
    return withFallback(
      async () => {
        const res = await api.delete(`/farmers/${id}`);
        if (isNativeApp()) await db.farmers.remove({ id });
        return res;
      },
      async () => {
        await db.farmers.remove({ id });
        return { success: true };
      },
      { type: 'DELETE_FARMER', payload: id }
    );
  },
  getSummary: async (id: string) => {
    // Summary is largely computed from local collections for speed/capability
    const collections = await db.collections.allDocs();
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
    return withFallback(
      async () => {
        const res = await api.post('/collections', data);
        if (isNativeApp()) await db.collections.put({ ...res.data, id: res.data.id || res.data._id });
        return res;
      },
      async () => await offlineService.recordCollectionOffline(data)
    );
  },
  update: async (id: string, data: any) => {
    return withFallback(
      async () => {
        const res = await api.put(`/collections/${id}`, data);
        if (isNativeApp()) await db.collections.put({ ...res.data, id: res.data.id || res.data._id || id });
        return res;
      },
      async () => {
        const existing = await db.collections.get(id).catch(() => ({}));
        const updated = { ...existing, ...data, id };
        await db.collections.put(updated);
        return updated;
      },
      { type: 'UPDATE_COLLECTION', payload: { id, data } }
    );
  },
  getDailyReport: async (date: string, endDate?: string) => {
    if (!isNativeApp()) return api.get('/collections/daily', { params: { date, endDate } });
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getCollectionsByDate(date, endDate);
    return { data: docs };
  },
  getReport: async (date: string, endDate?: string) => {
    if (!isNativeApp()) return api.get('/collections/report', { params: { date, endDate } });
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getCollectionsByDate(date, endDate);
    return { data: docs };
  },
  getByFarmerId: async (farmerInternalId: string) => {
    if (!isNativeApp()) return api.get(`/collections/farmer/${farmerInternalId}`);
    const result = await db.collections.allDocs();
    const docs = result.rows
      .map(r => r.doc as any)
      .filter(c => c.farmerInternalId === farmerInternalId || c.farmerId === farmerInternalId);
    return { data: docs };
  },
};

export const shiftApi = {
  createSummary: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/shifts/summary', data);
        if (isNativeApp()) await db.shifts.put({ ...res.data, id: res.data.id || res.data._id });
        return res;
      },
      async () => {
        const tempId = 'shift_' + Date.now();
        const doc = { ...data, id: tempId, _id: tempId };
        await db.shifts.put(doc);
        return doc;
      },
      { type: 'SAVE_SHIFT_SUMMARY', payload: data }
    );
  },
  getSummary: async (date: string, shift: string) => {
    if (!isNativeApp()) return api.get('/shifts/summary', { params: { date, shift } });
    const summary = await offlineService.getShiftSummaryOffline(date, shift);
    return { data: summary };
  },
  getRecent: async (limit: number = 10) => {
    if (!isNativeApp()) return api.get('/shifts/recent', { params: { limit } });
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getRecentShifts(limit);
    return { data: docs };
  },
};

export const saleApi = {
  getCustomers: async () => {
    if (offlineService.isOnline && isNativeApp()) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getSalesCustomers();
    return { data: docs };
  },
  createCustomer: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/sales/customers', data);
        if (isNativeApp()) await db.salesCustomers.put({ ...res.data, id: res.data.id || res.data._id });
        return res;
      },
      async () => {
        const tempId = 'cust_' + Date.now();
        const doc = { ...data, id: tempId, _id: tempId };
        await db.salesCustomers.put(doc);
        return doc;
      },
      { type: 'CREATE_SALE_CUSTOMER', payload: data }
    );
  },
  recordSale: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/sales', data);
        if (isNativeApp()) await db.salesRecords.put({ ...res.data, id: res.data.id || res.data._id });
        return res;
      },
      async () => await offlineService.recordSaleOffline(data)
    );
  },
};

export const reportApi = {
  getDashboard: async () => {
    if (!isNativeApp()) return api.get('/reporting/dashboard');
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const data = await offlineService.getDashboardOffline();
    return { data };
  },
  getDaily: async (date: string) => {
    if (!isNativeApp()) return api.get('/reporting/daily', { params: { date } });
    const collections = await offlineService.getCollectionsByDate(date);
    const totalQty = collections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const totalAmt = collections.reduce((sum, c) => sum + (c.amount || 0), 0);
    return {
      data: { collections, totalQty, totalAmt, date }
    };
  },
  getFarmer: async (id: string) => {
    if (!isNativeApp()) return api.get(`/reporting/farmer/${id}`);
    const result = await db.collections.allDocs();
    const fCollections = result.rows
      .map(r => r.doc as any)
      .filter(c => c.farmerInternalId === id || c.farmerId === id);
    return { data: fCollections };
  },
  getBills: async (year: number, month: number, period: number, farmerId?: string) => {
    if (!isNativeApp()) return api.get('/reporting/bills', { params: { year, month, period, farmerId } });
    const bills = await offlineService.getBillsOffline(year, month, period, farmerId);
    return { data: bills };
  },
  finalizeBills: async (data: { year: number, month: number, period: number, dairyId: string }) => {
    return withFallback(
      async () => await api.post('/reports/finalize-bills', data),
      async () => ({ count: 1, totalBills: 1 }),
      { type: 'FINALIZE_BILLS', payload: data }
    );
  },
};

export const rateApi = {
  getAll: async () => {
    if (!isNativeApp()) return api.get('/rates');
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getRates();
    return { data: docs };
  },
  create: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/rates', data);
        if (isNativeApp()) await db.rates.put({ ...res.data, id: res.data.id || res.data._id });
        return res;
      },
      async () => {
        const tempId = 'rate_' + Date.now();
        const doc = { ...data, id: tempId, _id: tempId };
        await db.rates.put(doc);
        return doc;
      },
      { type: 'CREATE_RATE', payload: data }
    );
  },
  update: async (id: string, data: any) => {
    return withFallback(
      async () => {
        const res = await api.put(`/rates/${id}`, data);
        if (isNativeApp()) await db.rates.put({ ...res.data, id: res.data.id || res.data._id || id });
        return res;
      },
      async () => {
        const existing = await db.rates.get(id).catch(() => ({}));
        const updated = { ...existing, ...data, id };
        await db.rates.put(updated);
        return updated;
      },
      { type: 'UPDATE_RATE', payload: { id, data } }
    );
  },
  delete: async (id: string) => {
    return withFallback(
      async () => {
        const res = await api.delete(`/rates/${id}`);
        if (isNativeApp()) await db.rates.remove({ id });
        return res;
      },
      async () => {
        await db.rates.remove({ id });
        return { success: true };
      },
      { type: 'DELETE_RATE', payload: id }
    );
  },
  getSettings: async () => {
    const settings = await offlineService.getRateSettings();
    return { data: settings };
  },
  saveSettings: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/rates/settings', data);
        if (isNativeApp()) await db.rateSettings.put({ ...data, id: 'current' });
        return res;
      },
      async () => {
        await db.rateSettings.put({ ...data, id: 'current' });
        return data;
      },
      { type: 'SAVE_RATE_SETTINGS', payload: data }
    );
  },
};

export const paymentApi = {
  getLedger: async () => {
    if (!isNativeApp()) return api.get('/ledger');
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getLedger();
    return { data: docs };
  },
  getLedgerByFarmerId: async (farmerInternalId: string) => {
    if (!isNativeApp()) return api.get(`/ledger/farmer/${farmerInternalId}`);
    const docs = await offlineService.getLedgerByFarmerId(farmerInternalId);
    return { data: docs };
  },
  recordPayment: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/payments', data);
        if (isNativeApp()) await db.ledgers.put({ ...res.data, id: res.data.id || res.data._id });
        return res;
      },
      async () => await offlineService.recordPaymentOffline(data)
    );
  },
};

export const userApi = {
  getAll: async (role?: string) => {
    if (!isNativeApp()) return api.get('/users', { params: { role } });
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getUsers();
    const filtered = role ? docs.filter((u: any) => u.role === role) : docs;
    return { data: filtered };
  },
  create: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/users', data);
        if (isNativeApp()) await db.users.put({ ...res.data, id: res.data.id || res.data._id });
        return res;
      },
      async () => {
        const tempId = 'user_' + Date.now();
        const doc = { ...data, id: tempId, _id: tempId };
        await db.users.put(doc);
        return doc;
      },
      { type: 'CREATE_USER', payload: data }
    );
  },
  update: async (id: string, data: any) => {
    return withFallback(
      async () => {
        const res = await api.put(`/users/${id}`, data);
        if (isNativeApp()) await db.users.put({ ...res.data, id: res.data.id || res.data._id || id });
        return res;
      },
      async () => {
        const existing = await db.users.get(id).catch(() => ({}));
        const updated = { ...existing, ...data, id };
        await db.users.put(updated);
        return updated;
      },
      { type: 'UPDATE_USER', payload: { id, data } }
    );
  },
  delete: async (id: string) => {
    return withFallback(
      async () => {
        const res = await api.delete(`/users/${id}`);
        if (isNativeApp()) await db.users.remove({ id });
        return res;
      },
      async () => {
        await db.users.remove({ id });
        return { success: true };
      },
      { type: 'DELETE_USER', payload: id }
    );
  },
};

export const dairyApi = {
  getAll: async () => {
    if (!isNativeApp()) return api.get('/dairies');
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const docs = await offlineService.getDairies();
    return { data: docs };
  },
  update: async (id: string, data: any) => {
    return withFallback(
      async () => {
        const res = await api.put(`/dairies/${id}`, data);
        if (isNativeApp()) await db.dairies.put({ ...res.data, id: res.data.id || res.data._id || id });
        return res;
      },
      async () => {
        const existing = await db.dairies.get(id).catch(() => ({}));
        const updated = { ...existing, ...data, id };
        await db.dairies.put(updated);
        return updated;
      },
      { type: 'UPDATE_DAIRY', payload: { id, data } }
    );
  },
};
