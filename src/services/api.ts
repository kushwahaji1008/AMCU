/// <reference types="vite/client" />
import api from './axiosInstance';
import { offlineService, db } from './offlineService';
import { isNativeApp, PLATFORM_ERRORS } from './platform';
import { sqliteDb } from './sqliteDatabase';

export default api;

// Lightweight client-side cache to reduce network latency for frequent reads
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

const getCachedData = (key: string) => {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
};

const setCachedData = (key: string, data: any) => {
  apiCache.set(key, { data, timestamp: Date.now() });
};

export const clearApiCache = () => {
  apiCache.clear();
};

export const invalidateApiCache = (...prefixes: string[]) => {
  for (const key of Array.from(apiCache.keys())) {
    if (prefixes.some((p) => key.startsWith(p))) {
      apiCache.delete(key);
    }
  }
};

async function computeOfflineCredentialHash(username: string, password: string): Promise<string | null> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(`${username.trim().toLowerCase()}:${password}`);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback if subtle crypto unavailable in insecure context
  }
  return null;
}

export interface AuditLogQueryParams {
  search?: string;
  userId?: string;
  action?: string;
  targetType?: string;
  status?: string;
  syncStatus?: string;
  databaseId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  paginated?: boolean;
}

export const authApi = {
  login: async (credentials: any) => {
    if (!isNativeApp()) {
      if (!offlineService.isOnline) {
        throw new Error(PLATFORM_ERRORS.OFFLINE_AUTH_WEB);
      }
      return api.post('/auth/login', credentials);
    }

    await sqliteDb.init();
    const normalized = String(credentials.username || '').trim().toLowerCase();

    if (!offlineService.isOnline) {
      const usersResult = await db.users.allDocs();
      const users = (usersResult?.rows || []).map((r) => r.doc as any);
      const user = users.find(
        (u) =>
          u &&
          (String(u.username || '').toLowerCase() === normalized ||
            String(u.email || '').toLowerCase() === normalized)
      );

      const cachedHash = localStorage.getItem(`offline_auth_${normalized}`);
      const enteredHash = await computeOfflineCredentialHash(normalized, credentials.password || '');

      if (!user || !cachedHash) {
        await offlineService.recordAuditEvent({
          action: 'OFFLINE_LOGIN_FAILED',
          targetType: 'AUTH',
          details: { username: normalized, reason: 'No cached offline session' },
          operationStatus: 'failure',
          errorDetails: PLATFORM_ERRORS.OFFLINE_AUTH_MISSING_CACHE,
          syncStatus: 'queued_offline',
        });
        throw new Error(PLATFORM_ERRORS.OFFLINE_AUTH_MISSING_CACHE);
      }

      if (!enteredHash || cachedHash !== enteredHash) {
        await offlineService.recordAuditEvent({
          action: 'OFFLINE_LOGIN_FAILED',
          targetId: user.id || user._id,
          targetType: 'AUTH',
          details: { username: normalized, reason: 'Invalid offline password' },
          operationStatus: 'failure',
          errorDetails: 'Invalid username or password.',
          syncStatus: 'queued_offline',
        });
        throw new Error('Invalid username or password.');
      }

      await offlineService.recordAuditEvent({
        action: 'OFFLINE_LOGIN_SUCCESS',
        targetId: user.id || user._id,
        targetType: 'AUTH',
        details: { username: normalized, role: user.role },
        operationStatus: 'success',
        syncStatus: 'queued_offline',
      });

      return {
        data: {
          token: 'offline_token_' + (user.id || user._id),
          user: { ...user, id: user.id || user._id },
          requiresOTP: false,
          isOfflineSession: true,
        },
      };
    }

    const res = await api.post('/auth/login', credentials);
    const hash = await computeOfflineCredentialHash(normalized, credentials.password || '');
    if (hash) {
      localStorage.setItem(`offline_auth_${normalized}`, hash);
    }
    if (res.data?.user?.id) {
      await db.users.put({ ...res.data.user, id: res.data.user.id }).catch(() => {});
    }
    return res;
  },
  logout: () => api.post('/auth/logout'),
  register: (data: any) => api.post('/auth/register', data),
  verifyAdmin: (credentials: any) => api.post('/admin/verify', credentials),
  verifyOTP: (data: { userId: string; otp: string }) => api.post('/auth/verify-otp', data),
  resendOTP: (data: { userId: string }) => api.post('/auth/resend-otp', data),
};

const withFallback = async (
  onlineCall: () => Promise<any>,
  offlineCall: () => Promise<any>,
  onlineQueueTask?: { type: any; payload: any; baseVersion?: number; entityId?: string }
) => {
  // Strictly Website = Direct online-only server communication (no offline SQLite/queue)
  if (!isNativeApp()) {
    return await onlineCall();
  }

  await sqliteDb.init();
  const res = await offlineCall();
  if (onlineQueueTask) {
    const tempId = onlineQueueTask.entityId || res?.id || res?._id || res?.data?.id || res?.data?._id;
    const enrichedPayload =
      tempId && onlineQueueTask.payload && typeof onlineQueueTask.payload === 'object' && !Array.isArray(onlineQueueTask.payload)
        ? { ...onlineQueueTask.payload, id: onlineQueueTask.payload.id || tempId }
        : onlineQueueTask.payload;
    await offlineService.queueTask(onlineQueueTask.type, enrichedPayload, {
      baseVersion: onlineQueueTask.baseVersion,
      entityId: tempId ? String(tempId) : undefined,
    });
  }
  return { data: res, isOffline: true };
};

export const adminApi = {
  getLoginLogs: (params?: AuditLogQueryParams) => api.get('/admin/login-logs', { params }),
  getActivityLogs: (params?: AuditLogQueryParams) => api.get('/admin/activity-logs', { params }),
  getActivityLogById: (id: string) => api.get(`/admin/activity-logs/${encodeURIComponent(id)}`),
  syncOfflineAuditLogs: (logs: any[]) => api.post('/audit/sync', { logs }),
  getSwaggerStatus: () => api.get('/admin/swagger-status'),
  toggleSwagger: (enabled: boolean) => api.post('/admin/swagger-toggle', { enabled }),
};

export const syncApi = {
  getConflicts: (status?: string) => api.get('/sync/conflicts', { params: status ? { status } : undefined }),
  resolveConflict: (
    id: string,
    payload: { resolution: 'keep_server' | 'apply_local' | 'merged'; mergedData?: Record<string, any> }
  ) => api.post(`/sync/conflicts/${encodeURIComponent(id)}/resolve`, payload),
};

export const smsLogApi = {
  getLogs: (params?: { status?: string; recipientType?: string; recipientId?: string; limit?: number }) =>
    api.get('/sms/logs', { params }),
  recordLog: (payload: any) => api.post('/sms/logs', payload),
};

export const farmerApi = {
  getAll: async () => {
    if (!isNativeApp()) {
      const cached = getCachedData('farmers_all');
      if (cached) return { data: cached, fromCache: true };
      const res = await api.get('/farmers');
      setCachedData('farmers_all', res.data);
      return res;
    }
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
    if (!isNativeApp()) return api.get(`/farmers/search/${encodeURIComponent(farmerId)}`);
    const doc = await offlineService.searchFarmer(farmerId);
    return { data: doc };
  },
  create: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/farmers', data);
        invalidateApiCache('farmers_', 'dashboard_');
        return res;
      },
      async () => {
        const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const doc = { ...data, id: tempId, _id: tempId, version: 1, balance: 0, _syncStatus: 'pending' };
        await db.farmers.put(doc);
        return doc;
      },
      { type: 'CREATE_FARMER', payload: data }
    );
  },
  update: async (id: string, data: any) => {
    const existing = isNativeApp() ? await db.farmers.get(id).catch(() => null) : null;
    const baseVersion = data?.expectedVersion ?? existing?.version;

    return withFallback(
      async () => {
        const res = await api.put(`/farmers/${id}`, data);
        invalidateApiCache('farmers_', 'dashboard_');
        return res;
      },
      async () => {
        const updated = { ...(existing || {}), ...data, id, _syncStatus: 'pending' };
        await db.farmers.put(updated);
        return updated;
      },
      { type: 'UPDATE_FARMER', payload: { id, data }, baseVersion, entityId: id }
    );
  },
  delete: async (id: string) => {
    return withFallback(
      async () => {
        const res = await api.delete(`/farmers/${id}`);
        invalidateApiCache('farmers_', 'dashboard_');
        return res;
      },
      async () => {
        await db.farmers.remove({ id });
        return { success: true };
      },
      { type: 'DELETE_FARMER', payload: id, entityId: id }
    );
  },
  getSummary: async (id: string) => {
    if (!isNativeApp()) {
      const summaryRes = await api.get(`/reports/farmer/${id}`);
      const collectionsRes = await api.get(`/collections/farmer/${id}`).catch(() => ({ data: [] }));
      const fCollections = collectionsRes.data || [];
      const totalMilk = summaryRes.data?.totalMilkSupplied || 0;
      const totalAmount = summaryRes.data?.totalEarnings || 0;
      const avgFat = fCollections.length
        ? fCollections.reduce((sum: number, c: any) => sum + (c.fat || 0) * (c.quantity || 0), 0) / (totalMilk || 1)
        : 0;
      return {
        data: {
          totalMilk,
          totalAmount,
          avgFat,
          collectionsCount: fCollections.length,
          recentCollections: fCollections.slice(0, 5),
        },
      };
    }
    const collections = await db.collections.allDocs();
    const fCollections = collections.rows
      .map((r) => r.doc as any)
      .filter((c) => c.farmerInternalId === id || c.farmerId === id);

    const totalMilk = fCollections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const totalAmount = fCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
    const avgFat = totalMilk > 0
      ? fCollections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0) / totalMilk
      : 0;

    return {
      data: {
        totalMilk,
        totalAmount,
        avgFat,
        collectionsCount: fCollections.length,
        recentCollections: fCollections.slice(0, 5),
      },
    };
  },
};

export const collectionApi = {
  create: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/collections', data);
        invalidateApiCache('collections_report_', 'dashboard_');
        return res;
      },
      async () => await offlineService.recordCollectionOffline(data)
    );
  },
  update: async (id: string, data: any) => {
    const existing = isNativeApp() ? await db.collections.get(id).catch(() => null) : null;
    const baseVersion = data?.expectedVersion ?? existing?.version;

    return withFallback(
      async () => {
        const res = await api.put(`/collections/${id}`, data);
        invalidateApiCache('collections_report_', 'dashboard_');
        return res;
      },
      async () => {
        const updated = { ...(existing || {}), ...data, id, _syncStatus: 'pending' };
        await db.collections.put(updated);
        return updated;
      },
      { type: 'UPDATE_COLLECTION', payload: { id, data }, baseVersion, entityId: id }
    );
  },
  getDailyReport: async (date: string, endDate?: string) => {
    if (!isNativeApp()) {
      const cacheKey = `collections_report_${date}_${endDate || ''}`;
      const cached = getCachedData(cacheKey);
      if (cached) return { data: cached, fromCache: true };
      const res = await api.get('/collections/report', { params: { date, endDate } });
      setCachedData(cacheKey, res.data);
      return res;
    }
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
      .map((r) => r.doc as any)
      .filter((c) => c.farmerInternalId === farmerInternalId || c.farmerId === farmerInternalId);
    return { data: docs };
  },
};

export const shiftApi = {
  createSummary: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/shifts/summary', data);
        return res;
      },
      async () => {
        const tempId = 'shift_' + Date.now();
        const doc = { ...data, id: tempId, _id: tempId, _syncStatus: 'pending' };
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
    if (!isNativeApp()) return api.get('/customers');
    await sqliteDb.init();
    const isOnline = await offlineService.checkLiveNetworkStatus();
    if (isOnline) {
      const syncResult = await offlineService.syncCollection('sales_customers', '/customers');
      const localDocs = await offlineService.getSalesCustomers();
      if (localDocs.length > 0) {
        return { data: localDocs };
      }
      if (syncResult.items.length > 0) {
        // Fallback if local SQLite persistence hit an unexpected error after live API succeeded
        return {
          data: syncResult.items.map((item: any) => ({ ...item, id: item.id || item._id })),
        };
      }
    }
    const docs = await offlineService.getSalesCustomers();
    return { data: docs };
  },
  createCustomer: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/customers', data);
        return res;
      },
      async () => {
        const tempId = 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const doc = { ...data, id: tempId, _id: tempId, balance: 0, version: 1, _syncStatus: 'pending' };
        await db.salesCustomers.put(doc);
        return doc;
      },
      { type: 'CREATE_SALE_CUSTOMER', payload: data }
    );
  },
  updateCustomer: async (id: string, data: any) => {
    const existing = isNativeApp() ? await db.salesCustomers.get(id).catch(() => null) : null;
    const baseVersion = data?.expectedVersion ?? existing?.version;

    return withFallback(
      async () => {
        const res = await api.put(`/customers/${id}`, data);
        return res;
      },
      async () => {
        const updated = { ...(existing || {}), ...data, id, _syncStatus: 'pending' };
        await db.salesCustomers.put(updated);
        return updated;
      },
      { type: 'UPDATE_CUSTOMER', payload: { id, data }, baseVersion, entityId: id }
    );
  },
  deleteCustomer: async (id: string) => {
    return withFallback(
      async () => {
        const res = await api.delete(`/customers/${id}`);
        return res;
      },
      async () => {
        await db.salesCustomers.remove({ id });
        return { success: true };
      },
      { type: 'DELETE_CUSTOMER', payload: id, entityId: id }
    );
  },
  recordSale: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/sales', data);
        invalidateApiCache('dashboard_');
        return res;
      },
      async () => await offlineService.recordSaleOffline(data)
    );
  },
  getRecent: async (limit: number = 20) => {
    if (!isNativeApp()) return api.get('/sales/recent', { params: { limit } });
    await sqliteDb.init();
    const isOnline = await offlineService.checkLiveNetworkStatus();
    if (isOnline) {
      const syncResult = await offlineService.syncCollection('sales_records', '/sales');
      const localDocs = await offlineService.getRecentSales(limit);
      if (localDocs.length > 0) {
        return { data: localDocs };
      }
      if (syncResult.items.length > 0) {
        return {
          data: [...syncResult.items]
            .sort((a: any, b: any) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
            .slice(0, limit),
        };
      }
    }
    const docs = await offlineService.getRecentSales(limit);
    return { data: docs };
  },
  getDaily: async (date: string) => {
    if (!isNativeApp()) return api.get('/sales/daily', { params: { date } });
    const docs = await offlineService.getSalesByDate(date);
    return { data: docs };
  },
  getCustomerHistory: async (customerId: string) => {
    if (!isNativeApp()) return api.get(`/sales/customer/${customerId}`);
    const docs = await offlineService.getCustomerHistoryOffline(customerId);
    return { data: docs };
  },
  recordPayment: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/customer-payments', data);
        return res;
      },
      async () => await offlineService.recordCustomerPaymentOffline(data)
    );
  },
};

export const reportApi = {
  getDashboard: async (days: number = 7) => {
    if (!isNativeApp()) {
      const cacheKey = `dashboard_${days}`;
      const cached = getCachedData(cacheKey);
      if (cached) return { data: cached, fromCache: true };
      const res = await api.get('/reports/dashboard', { params: { days } });
      setCachedData(cacheKey, res.data);
      return res;
    }
    if (offlineService.isOnline) {
      offlineService.syncFromServer().catch(console.error);
    }
    const data = await offlineService.getDashboardOffline(days);
    return { data };
  },
  getDaily: async (date: string) => {
    if (!isNativeApp()) return api.get('/reports/daily', { params: { date } });
    const collections = await offlineService.getCollectionsByDate(date);
    const totalQty = collections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const totalAmt = collections.reduce((sum, c) => sum + (c.amount || 0), 0);
    return {
      data: { collections, totalQty, totalAmt, date },
    };
  },
  getFarmer: async (id: string) => {
    if (!isNativeApp()) return api.get(`/reports/farmer/${id}`);
    const result = await db.collections.allDocs();
    const fCollections = result.rows
      .map((r) => r.doc as any)
      .filter((c) => c.farmerInternalId === id || c.farmerId === id);
    return { data: fCollections };
  },
  getBills: async (year: number, month: number, period: number, farmerId?: string) => {
    if (!isNativeApp()) return api.get('/reports/bills', { params: { year, month, period, farmerId } });
    const bills = await offlineService.getBillsOffline(year, month, period, farmerId);
    return { data: bills };
  },
  finalizeBills: async (data: { year: number; month: number; period: number; dairyId: string }) => {
    return withFallback(
      async () => {
        const res = await api.post('/reports/finalize-bills', data);
        invalidateApiCache('farmers_', 'dashboard_');
        return res;
      },
      async () => ({ count: 1, totalBills: 1 }),
      { type: 'FINALIZE_BILLS', payload: data }
    );
  },
};

export const rateApi = {
  getAll: async () => {
    if (!isNativeApp()) {
      const cached = getCachedData('rates_all');
      if (cached) return { data: cached, fromCache: true };
      const res = await api.get('/rates');
      setCachedData('rates_all', res.data);
      return res;
    }
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
        invalidateApiCache('rates_');
        return res;
      },
      async () => {
        const tempId = 'rate_' + Date.now();
        const doc = { ...data, id: tempId, _id: tempId, version: 1, _syncStatus: 'pending' };
        await db.rates.put(doc);
        return doc;
      },
      { type: 'CREATE_RATE', payload: data }
    );
  },
  update: async (id: string, data: any) => {
    const existing = isNativeApp() ? await db.rates.get(id).catch(() => null) : null;
    const baseVersion = data?.expectedVersion ?? existing?.version;

    return withFallback(
      async () => {
        const res = await api.put(`/rates/${id}`, data);
        invalidateApiCache('rates_');
        return res;
      },
      async () => {
        const updated = { ...(existing || {}), ...data, id, _syncStatus: 'pending' };
        await db.rates.put(updated);
        return updated;
      },
      { type: 'UPDATE_RATE', payload: { id, data }, baseVersion, entityId: id }
    );
  },
  delete: async (id: string) => {
    return withFallback(
      async () => {
        const res = await api.delete(`/rates/${id}`);
        invalidateApiCache('rates_');
        return res;
      },
      async () => {
        await db.rates.remove({ id });
        return { success: true };
      },
      { type: 'DELETE_RATE', payload: id, entityId: id }
    );
  },
  getSettings: async () => {
    if (!isNativeApp()) return api.get('/rates/settings');
    const settings = await offlineService.getRateSettings();
    return { data: settings };
  },
  saveSettings: async (data: any) => {
    return withFallback(
      async () => {
        const res = await api.post('/rates/settings', data);
        invalidateApiCache('rates_');
        return res;
      },
      async () => {
        await db.rateSettings.put({ ...data, id: 'current', _syncStatus: 'pending' });
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
        invalidateApiCache('farmers_', 'dashboard_');
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
        return res;
      },
      async () => {
        const tempId = 'user_' + Date.now();
        const doc = { ...data, id: tempId, _id: tempId, _syncStatus: 'pending' };
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
        return res;
      },
      async () => {
        const existing = await db.users.get(id).catch(() => ({}));
        const updated = { ...existing, ...data, id, _syncStatus: 'pending' };
        await db.users.put(updated);
        return updated;
      },
      { type: 'UPDATE_USER', payload: { id, data }, entityId: id }
    );
  },
  delete: async (id: string) => {
    return withFallback(
      async () => {
        const res = await api.delete(`/users/${id}`);
        return res;
      },
      async () => {
        await db.users.remove({ id });
        return { success: true };
      },
      { type: 'DELETE_USER', payload: id, entityId: id }
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
        return res;
      },
      async () => {
        const existing = await db.dairies.get(id).catch(() => ({}));
        const updated = { ...existing, ...data, id, _syncStatus: 'pending' };
        await db.dairies.put(updated);
        return updated;
      },
      { type: 'UPDATE_DAIRY', payload: { id, data }, entityId: id }
    );
  },
};
