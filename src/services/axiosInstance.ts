import axios from 'axios';

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
      
      if (!window.location.pathname.includes('/login')) {
        const reason = encodeURIComponent(message);
        window.location.href = `/login?reason=${reason}`;
      }
    }
    
    const apiError = new Error(message);
    (apiError as any).status = error.response?.status;
    (apiError as any).data = error.response?.data;
    
    return Promise.reject(apiError);
  }
);

export default api;
