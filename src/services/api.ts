import axios from 'axios';
import { db } from './localDb';
import { syncManager } from './syncManager';
import { v4 as uuidv4 } from 'uuid'; // We need to generate IDs locally

const api = axios.create({
  baseURL: 'https://amcu.onrender.com/api',
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
  getAll: async () => {
    const farmers = await db.farmers.toArray();
    return { data: farmers };
  },
  getById: async (id: string) => {
    const farmer = await db.farmers.get(id);
    return { data: farmer };
  },
  search: async (farmerId: string) => {
    const farmer = await db.farmers.where('farmerId').equals(farmerId).first();
    if (!farmer) throw { response: { status: 404 } };
    return { data: farmer };
  },
  create: async (data: any) => {
    const id = data.id || uuidv4();
    const newFarmer = { ...data, id, createdAt: new Date().toISOString(), balance: 0 };
    await db.farmers.add(newFarmer);
    await db.syncQueue.add({ action: 'CREATE', entity: 'FARMER', data: newFarmer, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: newFarmer };
  },
  update: async (id: string, data: any) => {
    await db.farmers.update(id, data);
    const updated = await db.farmers.get(id);
    await db.syncQueue.add({ action: 'UPDATE', entity: 'FARMER', data: updated, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: updated };
  },
  delete: async (id: string) => {
    await db.farmers.delete(id);
    await db.syncQueue.add({ action: 'DELETE', entity: 'FARMER', data: { id }, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: { success: true } };
  },
  getSummary: async (id: string) => {
    // Simplified local summary
    const farmer = await db.farmers.get(id);
    const collections = await db.collections.where('farmerId').equals(id).toArray();
    const totalQuantity = collections.reduce((sum, c) => sum + c.quantity, 0);
    const totalAmount = collections.reduce((sum, c) => sum + c.amount, 0);
    return { data: { farmer, totalQuantity, totalAmount, recentCollections: collections.slice(-5) } };
  },
};

export const collectionApi = {
  create: async (data: any) => {
    const id = data.id || uuidv4();
    const newCollection = { ...data, id, createdAt: new Date().toISOString() };
    await db.collections.add(newCollection);
    
    // Update farmer balance locally
    const farmer = await db.farmers.get(data.farmerId);
    if (farmer) {
      await db.farmers.update(data.farmerId, { balance: (farmer.balance || 0) + data.amount });
    }

    await db.syncQueue.add({ action: 'CREATE', entity: 'COLLECTION', data: newCollection, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: newCollection };
  },
  update: async (id: string, data: any) => {
    await db.collections.update(id, data);
    return { data: await db.collections.get(id) };
  },
  getDailyReport: async (date: string, endDate?: string) => {
    let collections = await db.collections.toArray();
    collections = collections.filter(c => {
      const cDate = new Date(c.date).toISOString().split('T')[0];
      if (endDate) return cDate >= date && cDate <= endDate;
      return cDate === date;
    });
    return { data: collections };
  },
  getReport: async (date: string, endDate?: string) => {
    let collections = await db.collections.toArray();
    collections = collections.filter(c => {
      const cDate = new Date(c.date).toISOString().split('T')[0];
      if (endDate) return cDate >= date && cDate <= endDate;
      return cDate === date;
    });
    return { data: collections };
  },
  getByFarmerId: async (farmerId: string) => {
    const collections = await db.collections.where('farmerId').equals(farmerId).toArray();
    return { data: collections };
  },
};

export const shiftApi = {
  createSummary: async (data: any) => {
    // We don't have a shift summary table in localDb yet, but we can just mock it or add it
    // For now, return success
    return { data: { success: true } };
  },
  getSummary: async (date: string, shift: string) => {
    // Compute from local collections
    const collections = await db.collections.toArray();
    const shiftCollections = collections.filter(c => 
      new Date(c.date).toISOString().split('T')[0] === date && c.shift === shift
    );
    
    const totalFarmers = new Set(shiftCollections.map(c => c.farmerId)).size;
    const totalQuantity = shiftCollections.reduce((sum, c) => sum + c.quantity, 0);
    const amount = shiftCollections.reduce((sum, c) => sum + c.amount, 0);
    const avgFat = shiftCollections.length ? shiftCollections.reduce((sum, c) => sum + c.fat, 0) / shiftCollections.length : 0;
    const avgSnf = shiftCollections.length ? shiftCollections.reduce((sum, c) => sum + c.snf, 0) / shiftCollections.length : 0;

    return { 
      data: {
        date, shift, totalFarmers, totalQuantity, amount, avgFat, avgSnf
      } 
    };
  },
  getRecent: async (limit: number = 10) => {
    return { data: [] };
  },
};

export const saleApi = {
  getCustomers: async () => {
    return { data: [] };
  },
  createCustomer: async (data: any) => {
    return { data: { ...data, id: uuidv4() } };
  },
  recordSale: async (data: any) => {
    return { data: { ...data, id: uuidv4() } };
  },
};

export const reportApi = {
  getDashboard: async () => {
    const today = new Date().toISOString().split('T')[0];
    const collections = await db.collections.toArray();
    const todayCollections = collections.filter(c => new Date(c.date).toISOString().split('T')[0] === today);
    
    let todayQty = 0, morningQty = 0, eveningQty = 0, todayAmount = 0, fatSum = 0, snfSum = 0;
    todayCollections.forEach(c => {
      todayQty += c.quantity;
      if (c.shift === 'Morning') morningQty += c.quantity;
      else eveningQty += c.quantity;
      todayAmount += c.amount;
      fatSum += c.fat;
      snfSum += c.snf;
    });

    const activeFarmers = await db.farmers.count();
    
    // Trend data (last 7 days)
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayCollections = collections.filter(c => new Date(c.date).toISOString().split('T')[0] === dateStr);
      trendData.push({
        date: dateStr,
        quantity: dayCollections.reduce((sum, c) => sum + c.quantity, 0),
        amount: dayCollections.reduce((sum, c) => sum + c.amount, 0)
      });
    }

    return {
      data: {
        todayQty: todayQty,
        morningQty: morningQty,
        eveningQty: eveningQty,
        todayAmount: todayAmount,
        totalFarmers: activeFarmers,
        avgFat: todayCollections.length ? (fatSum / todayCollections.length) : 0,
        avgSnf: todayCollections.length ? (snfSum / todayCollections.length) : 0,
        recentTxns: collections.slice(-5).reverse(),
        trendData
      }
    };
  },
  getDaily: async (date: string) => {
    const collections = await db.collections.toArray();
    const daily = collections.filter(c => new Date(c.date).toISOString().split('T')[0] === date);
    return { data: daily };
  },
  getFarmer: async (farmerId: string) => {
    const collections = await db.collections.where('farmerId').equals(farmerId).toArray();
    return { data: collections };
  },
  getBills: async (year: number, month: number, period: number, farmerId?: string) => {
    let startDate: Date, endDate: Date;
    if (period === 1) {
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month, 10);
    } else if (period === 2) {
      startDate = new Date(year, month, 11);
      endDate = new Date(year, month, 20);
    } else {
      startDate = new Date(year, month, 21);
      endDate = new Date(year, month + 1, 0);
    }

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    let collections = await db.collections.toArray();
    collections = collections.filter(c => {
      const cDate = new Date(c.date).toISOString().split('T')[0];
      return cDate >= startStr && cDate <= endStr && (!farmerId || c.farmerId === farmerId);
    });

    // Group by farmer
    const billsMap = new Map();
    for (const c of collections) {
      if (!billsMap.has(c.farmerId)) {
        const farmer = await db.farmers.get(c.farmerId);
        billsMap.set(c.farmerId, {
          farmerId: c.farmerId,
          farmerName: farmer?.name || c.farmerName,
          totalQuantity: 0,
          amount: 0,
          collections: []
        });
      }
      const bill = billsMap.get(c.farmerId);
      bill.totalQuantity += c.quantity;
      bill.amount += c.amount;
      bill.collections.push(c);
    }

    return { data: Array.from(billsMap.values()) };
  },
};

export const rateApi = {
  getAll: async () => {
    const rates = await db.rateCharts.toArray();
    return { data: rates };
  },
  create: async (data: any) => {
    const id = data.id || uuidv4();
    const newRate = { ...data, id };
    await db.rateCharts.add(newRate);
    await db.syncQueue.add({ action: 'CREATE', entity: 'RATE_CHART', data: newRate, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: newRate };
  },
  update: async (id: string, data: any) => {
    await db.rateCharts.update(id, data);
    const updated = await db.rateCharts.get(id);
    await db.syncQueue.add({ action: 'UPDATE', entity: 'RATE_CHART', data: updated, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: updated };
  },
  delete: async (id: string) => {
    await db.rateCharts.delete(id);
    await db.syncQueue.add({ action: 'DELETE', entity: 'RATE_CHART', data: { id }, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: { success: true } };
  },
  getSettings: async () => {
    const settings = await db.rateSettings.get('default');
    return { data: settings || {} };
  },
  saveSettings: async (data: any) => {
    await db.rateSettings.put({ ...data, id: 'default' });
    await db.syncQueue.add({ action: 'UPDATE', entity: 'RATE_SETTINGS', data, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: { success: true } };
  },
};

export const paymentApi = {
  getLedger: async () => {
    const ledger = await db.ledger.toArray();
    return { data: ledger };
  },
  getLedgerByFarmerId: async (farmerId: string) => {
    const ledger = await db.ledger.where('farmerId').equals(farmerId).toArray();
    return { data: ledger };
  },
  recordPayment: async (data: any) => {
    const id = data.id || uuidv4();
    const newPayment = { ...data, id, type: 'debit' };
    await db.ledger.add(newPayment);
    
    // Update farmer balance locally
    const farmer = await db.farmers.get(data.farmerId);
    if (farmer) {
      await db.farmers.update(data.farmerId, { balance: (farmer.balance || 0) - data.amount });
    }

    await db.syncQueue.add({ action: 'CREATE', entity: 'PAYMENT', data: newPayment, status: 'PENDING', timestamp: Date.now() });
    syncManager.sync();
    return { data: newPayment };
  },
};

export const userApi = {
  getAll: (role?: string) => api.get(`/users${role ? `?role=${role}` : ''}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

export const dairyApi = {
  getAll: () => api.get('/dairies'),
};
