/// <reference types="vite/client" />
import api from './axiosInstance';
import { offlineService } from './offlineService';

export default api;

export const authApi = {
  login: (credentials: any) => api.post('/auth/login', credentials),
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
    if (!offlineService.isOnline) {
      const docs = await offlineService.getFarmers();
      return { data: docs };
    }
    const res = await api.get('/farmers');
    // Update local cache silently
    offlineService.syncFromServer().catch(console.error);
    return res;
  },
  getById: async (id: string) => {
    if (!offlineService.isOnline) {
      const doc = await offlineService.getFarmerById(id);
      return { data: doc };
    }
    return api.get(`/farmers/${id}`);
  },
  search: async (farmerId: string) => {
    if (!offlineService.isOnline) {
      const doc = await offlineService.searchFarmer(farmerId);
      return { data: doc };
    }
    return api.get(`/farmers/search/${farmerId}`);
  },
  create: async (data: any) => {
    if (!offlineService.isOnline) {
      await offlineService.queueTask('CREATE_FARMER', data);
      return { data: { ...data, _id: 'temp_' + Date.now() } };
    }
    return api.post('/farmers', data);
  },
  update: async (id: string, data: any) => {
    if (!offlineService.isOnline) {
      await offlineService.queueTask('UPDATE_FARMER', { id, data });
      return { data: { ...data, id } };
    }
    return api.put(`/farmers/${id}`, data);
  },
  delete: (id: string) => api.delete(`/farmers/${id}`),
  getSummary: (id: string) => api.get(`/farmers/${id}/summary`),
};

export const collectionApi = {
  create: async (data: any) => {
    if (!offlineService.isOnline) {
      await offlineService.queueTask('CREATE_COLLECTION', data);
      return { data: { ...data, _id: 'temp_' + Date.now() } };
    }
    return api.post('/collections', data);
  },
  update: async (id: string, data: any) => {
    if (!offlineService.isOnline) {
      await offlineService.queueTask('UPDATE_COLLECTION', { id, data });
      return { data: { ...data, id } };
    }
    return api.put(`/collections/${id}`, data);
  },
  getDailyReport: async (date: string, endDate?: string) => {
    if (!offlineService.isOnline && !endDate) {
      const docs = await offlineService.getCollectionsByDate(date);
      return { data: docs };
    }
    return api.get(`/collections/report?date=${date}${endDate ? `&endDate=${endDate}` : ''}`);
  },
  getReport: (date: string, endDate?: string) => api.get(`/collections/report?date=${date}${endDate ? `&endDate=${endDate}` : ''}`),
  getByFarmerId: (farmerInternalId: string) => api.get(`/collections/farmer/${farmerInternalId}`),
};

export const shiftApi = {
  createSummary: (data: any) => api.post('/shifts/summary', data),
  getSummary: (date: string, shift: string) => api.get(`/shifts/summary?date=${date}&shift=${shift}`),
  getRecent: (limit: number = 10) => api.get(`/shifts/recent?limit=${limit}`),
};

export const saleApi = {
  getCustomers: () => api.get('/sales/customers'),
  createCustomer: (data: any) => api.post('/sales/customers', data),
  recordSale: (data: any) => api.post('/sales', data),
};

export const reportApi = {
  getDashboard: () => api.get('/reports/dashboard'),
  getDaily: (date: string) => api.get(`/reports/daily?date=${date}`),
  getFarmer: (id: string) => api.get(`/reports/farmer/${id}`),
  getBills: (year: number, month: number, period: number, farmerId?: string) => 
    api.get(`/reports/bills?year=${year}&month=${month}&period=${period}${farmerId ? `&farmerId=${farmerId}` : ''}`),
  finalizeBills: (data: { year: number, month: number, period: number, dairyId: string }) =>
    api.post('/reports/finalize-bills', data),
};

export const rateApi = {
  getAll: () => api.get('/rates'),
  create: (data: any) => api.post('/rates', data),
  update: (id: string, data: any) => api.put(`/rates/${id}`, data),
  delete: (id: string) => api.delete(`/rates/${id}`),
  getSettings: () => api.get('/rates/settings'),
  saveSettings: (data: any) => api.post('/rates/settings', data),
};

export const paymentApi = {
  getLedger: () => api.get('/ledger'),
  getLedgerByFarmerId: (farmerInternalId: string) => api.get(`/ledger/farmer/${farmerInternalId}`),
  recordPayment: (data: any) => api.post('/payments', data),
};

export const userApi = {
  getAll: (role?: string) => api.get(`/users${role ? `?role=${role}` : ''}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

export const dairyApi = {
  getAll: () => api.get('/dairies'),
  update: (id: string, data: any) => api.put(`/dairies/${id}`, data),
};
