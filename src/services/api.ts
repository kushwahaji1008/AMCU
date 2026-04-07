import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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
    const message = error.response?.data?.message || error.message || 'An unexpected error occurred';
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('profile');
      window.location.href = '/login';
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
  getDailyReport: (date: string) => api.get(`/collections/report?date=${date}`),
  getReport: (date: string) => api.get(`/collections/report?date=${date}`),
};

export const saleApi = {
  getCustomers: () => api.get('/customers'),
  createCustomer: (data: any) => api.post('/customers', data),
  recordSale: (data: any) => api.post('/sales', data),
};

export const reportApi = {
  getDashboard: () => api.get('/reports/dashboard'),
  getDaily: (date: string) => api.get('/reports/daily?date=${date}'),
  getFarmer: (farmerId: string) => api.get(`/reports/farmer/${farmerId}`),
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
  recordPayment: (data: any) => api.post('/payments', data),
};

export const userApi = {
  getAll: (role?: string) => api.get(`/users${role ? `?role=${role}` : ''}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};
