/// <reference types="vite/client" />
import axios from 'axios';

// For Android/Native, we need a full URL. For Web, we can use relative or window.location.origin
// VITE_API_URL should be set to the production server URL (e.g., https://your-app.onrender.com/api)
const baseURL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') ? `${window.location.origin}/api` : 'https://amcu.onrender.com/api');

const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const databaseId = localStorage.getItem('databaseId');
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  if (databaseId) {
    config.headers['x-database-id'] = databaseId;
  }
  
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = 'An unexpected error occurred';
    
    if (error.response?.data) {
      if (typeof error.response.data === 'string') {
        message = error.response.data;
      } else if (error.response.data.message) {
        message = error.response.data.message;
      } else if (error.response.data.errors && Array.isArray(error.response.data.errors)) {
        message = error.response.data.errors.map((e: any) => e.msg || e.message).join(', ');
      }
    } else if (error.message) {
      message = error.message;
    }
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('profile');
      
      // Only redirect if not already on the login page
      if (!window.location.pathname.includes('/login')) {
        const reason = encodeURIComponent(message);
        window.location.href = `/login?reason=${reason}`;
      }
    }
    
    // Create a standardized error object
    const apiError = new Error(message);
    (apiError as any).status = error.response?.status;
    (apiError as any).data = error.response?.data;
    
    return Promise.reject(apiError);
  }
);

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
  getAll: () => api.get('/farmers'),
  getById: (id: string) => api.get(`/farmers/${id}`),
  search: (farmerId: string) => api.get(`/farmers/search/${farmerId}`),
  create: (data: any) => api.post('/farmers', data),
  update: (id: string, data: any) => api.put(`/farmers/${id}`, data),
  delete: (id: string) => api.delete(`/farmers/${id}`),
  getSummary: (id: string) => api.get(`/farmers/${id}/summary`),
};

export const collectionApi = {
  create: (data: any) => api.post('/collections', data),
  update: (id: string, data: any) => api.put(`/collections/${id}`, data),
  getDailyReport: (date: string, endDate?: string) => api.get(`/collections/report?date=${date}${endDate ? `&endDate=${endDate}` : ''}`),
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
