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

export default api;

export const authApi = {
  login: (credentials: any) => api.post('/auth/login', credentials),
  register: (data: any) => api.post('/auth/register', data),
  verifyAdmin: (credentials: any) => api.post('/admin/verify', credentials),
};

export const farmerApi = {
  getAll: () => api.get('/farmers'),
  getById: (id: string) => api.get(`/farmers/${id}`),
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
  getDaily: (date: string) => api.get(`/reports/daily?date=${date}`),
  getFarmer: (farmerId: string) => api.get(`/reports/farmer/${farmerId}`),
};

export const rateApi = {
  getAll: () => api.get('/rates'),
  create: (data: any) => api.post('/rates', data),
};

export const userApi = {
  getAll: (role?: string) => api.get(`/users${role ? `?role=${role}` : ''}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};
