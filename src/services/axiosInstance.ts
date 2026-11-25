import axios from 'axios';
import { CLIENT_APP_VERSION, getPlatform, isNativeApp } from './platform';

const getBaseURL = () => {
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  if (isNativeApp()) {
    return 'https://amcu.onrender.com/api';
  }
  return '/api';
};

const baseURL = getBaseURL();

// Global active request tracker for axios
let activeRequests = 0;
const _loadingListeners: Array<(isLoading: boolean) => void> = [];

export const onLoadingChange = (listener: (isLoading: boolean) => void) => {
  _loadingListeners.push(listener);
  return () => {
    const index = _loadingListeners.indexOf(listener);
    if (index > -1) _loadingListeners.splice(index, 1);
  };
};

const notifyLoading = () => {
  const isLoading = activeRequests > 0;
  _loadingListeners.forEach((l) => l(isLoading));
};

const api = axios.create({
  baseURL,
  timeout: 30000,
});

const generateCorrelationId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback
  }
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

api.interceptors.request.use(
  (config) => {
    activeRequests++;
    notifyLoading();

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const databaseId = typeof localStorage !== 'undefined' ? localStorage.getItem('databaseId') : null;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (databaseId) {
      config.headers['x-database-id'] = databaseId;
    }

    config.headers['X-Platform'] = getPlatform();
    config.headers['X-App-Version'] = CLIENT_APP_VERSION;
    if (!config.headers['X-Correlation-Id']) {
      config.headers['X-Correlation-Id'] = generateCorrelationId();
    }

    return config;
  },
  (error) => {
    activeRequests = Math.max(0, activeRequests - 1);
    notifyLoading();
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    activeRequests = Math.max(0, activeRequests - 1);
    notifyLoading();
    return response;
  },
  (error) => {
    activeRequests = Math.max(0, activeRequests - 1);
    notifyLoading();

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
      const isAuthEndpoint =
        error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/admin/verify');

      if (!isAuthEndpoint) {
        localStorage.removeItem('token');
        localStorage.removeItem('profile');
        localStorage.removeItem('databaseId');

        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          const reason = encodeURIComponent(message);
          window.location.href = `/login?reason=${reason}`;
        }
      }
    }

    const apiError = new Error(message) as any;
    apiError.status = error.response?.status;
    apiError.data = error.response?.data;
    apiError.response = error.response;

    return Promise.reject(apiError);
  }
);

export default api;
