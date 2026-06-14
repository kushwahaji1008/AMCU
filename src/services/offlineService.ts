import { realmInstance } from './realm';
import api from './axiosInstance';
import { Network } from '@capacitor/network';
import { isNativeApp } from './platform';

/**
 * Custom Realm drop-in emulation wrapper.
 */
const createCollectionWrapper = (schemaName: string) => {
  return {
    allDocs: async () => {
      // Return empty if not on native platform or not initialized
      if (!isNativeApp()) return { rows: [] };
      try {
        const objects = await realmInstance.objects<any>(schemaName);
        return {
          rows: objects.map(item => ({
            id: item.id || item._id,
            key: item.id || item._id,
            value: { rev: item._rev || '1' },
            doc: { ...item, _id: item.id || item._id }
          }))
        };
      } catch (e) {
        return { rows: [] };
      }
    },
    get: async (id: string) => {
      if (!isNativeApp()) throw { status: 404, message: 'Platform not supported' };
      const item = await realmInstance.objectForPrimaryKey<any>(schemaName, id);
      if (!item) {
        throw { status: 404, message: 'missing', error: true };
      }
      return { ...item, _id: item.id || item._id };
    },
    put: async (doc: any) => {
      if (!isNativeApp()) return doc;
      const id = doc.id || doc._id;
      if (!id) return doc;
      const itemToSave = { ...doc, id };
      return await realmInstance.write(async () => {
        return await realmInstance.create(schemaName, itemToSave, 'all');
      });
    },
    remove: async (doc: any) => {
      if (!isNativeApp()) return;
      const id = doc.id || doc._id;
      if (!id) return;
      return await realmInstance.write(async () => {
        await realmInstance.delete(schemaName, id);
      });
    }
  };
};

export const db = {
  farmers: createCollectionWrapper('farmers'),
  collections: createCollectionWrapper('collections'),
  shifts: createCollectionWrapper('shifts'),
  salesCustomers: createCollectionWrapper('sales_customers'),
  salesRecords: createCollectionWrapper('sales_records'),
  customerPayments: createCollectionWrapper('customer_payments'),
  rates: createCollectionWrapper('rates'),
  rateSettings: createCollectionWrapper('rate_settings'),
  payments: createCollectionWrapper('payments'),
  ledgers: createCollectionWrapper('ledgers'),
  users: createCollectionWrapper('users'),
  dairies: createCollectionWrapper('dairies'),
  syncQueue: createCollectionWrapper('sync_queue')
};

export interface SyncTask {
  _id: string;
  type: 
    | 'CREATE_FARMER' | 'UPDATE_FARMER' | 'DELETE_FARMER'
    | 'CREATE_COLLECTION' | 'UPDATE_COLLECTION'
    | 'CREATE_SHIFT' | 'SAVE_SHIFT_SUMMARY'
    | 'CREATE_SALE_CUSTOMER' | 'RECORD_SALE'
    | 'CREATE_RATE' | 'UPDATE_RATE' | 'DELETE_RATE' | 'SAVE_RATE_SETTINGS'
    | 'RECORD_PAYMENT' | 'CREATE_USER' | 'UPDATE_USER' | 'DELETE_USER'
    | 'UPDATE_DAIRY' | 'FINALIZE_BILLS';
  payload: any;
  timestamp: number;
}

class OfflineService {
  public isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;

  constructor() {
    this.initNetworkStatus();
  }

  private initNetworkStatus() {
    // 1. Web browser fallback listeners
    window.addEventListener('online', () => {
      this.isOnline = true;
      if (isNativeApp()) {
        this.processSyncQueue();
        this.syncFromServer();
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // 2. Native Capacitor network listeners
    if (isNativeApp()) {
      try {
        Network.addListener('networkStatusChange', (status) => {
          const wasOnline = this.isOnline;
          this.isOnline = status.connected;
          
          if (wasOnline !== this.isOnline) {
            window.dispatchEvent(new Event(this.isOnline ? 'online' : 'offline'));
          }

          if (this.isOnline) {
            this.processSyncQueue();
            this.syncFromServer();
          }
        });

        Network.getStatus().then((status) => {
          this.isOnline = status.connected;
          if (this.isOnline) {
            this.processSyncQueue();
            this.syncFromServer();
          }
        });
      } catch (err) {
        console.warn('Network listeners failed:', err);
      }
    }
  }

  async queueTask(type: SyncTask['type'], payload: any) {
    if (!isNativeApp()) return;

    const task: SyncTask = {
      _id: new Date().toISOString() + '_' + Math.random().toString(36).substr(2, 9),
      type,
      payload,
      timestamp: Date.now()
    };

    try {
      await realmInstance.write(() => 
        realmInstance.create('sync_queue', { ...task, id: task._id }, 'all')
      );
      
      if (this.isOnline) {
        this.processSyncQueue();
      }
    } catch (e) {
      console.error('Queue task failed:', e);
    }
  }

  async processSyncQueue() {
    if (!isNativeApp() || this.syncInProgress || !this.isOnline) return;
    this.syncInProgress = true;

    try {
      const result = await realmInstance.objects<any>('sync_queue');
      const tasks = [...result].sort((a, b) => a.timestamp - b.timestamp);

      for (const task of tasks) {
        try {
          await this.executeSyncTask(task);
          await realmInstance.write(() => realmInstance.delete('sync_queue', task.id || task._id));
        } catch (error: any) {
          console.error('Sync error:', error);
          if (error.status >= 400 && error.status < 500) {
            await realmInstance.write(() => realmInstance.delete('sync_queue', task.id || task._id));
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async executeSyncTask(task: any) {
    switch (task.type) {
      case 'CREATE_FARMER': {
        const res = await api.post('/farmers', task.payload);
        await this.handleCreateSyncResult('farmers', task.payload.id, res.data);
        break;
      }
      case 'UPDATE_FARMER':
        await api.put(`/farmers/${task.payload.id}`, task.payload.data);
        break;
      case 'DELETE_FARMER':
        await api.delete(`/farmers/${task.payload}`);
        break;
      case 'CREATE_COLLECTION': {
        const res = await api.post('/collections', task.payload);
        await this.handleCreateSyncResult('collections', task.payload.id, res.data);
        break;
      }
      case 'UPDATE_COLLECTION':
        await api.put(`/collections/${task.payload.id}`, task.payload.data);
        break;
      case 'CREATE_SHIFT':
      case 'SAVE_SHIFT_SUMMARY': {
        const res = await api.post('/shifts/summary', task.payload);
        await this.handleCreateSyncResult('shifts', task.payload.id, res.data);
        break;
      }
      case 'CREATE_SALE_CUSTOMER': {
        const res = await api.post('/customers', task.payload);
        await this.handleCreateSyncResult('sales_customers', task.payload.id, res.data);
        break;
      }
      case 'RECORD_SALE': {
        const res = await api.post('/sales', task.payload);
        await this.handleCreateSyncResult('sales_records', task.payload.id, res.data);
        break;
      }
      case 'RECORD_CUSTOMER_PAYMENT': {
        const res = await api.post('/customer-payments', task.payload);
        await this.handleCreateSyncResult('customer_payments', task.payload.id, res.data);
        break;
      }
      case 'CREATE_RATE': {
        const res = await api.post('/rates', task.payload);
        await this.handleCreateSyncResult('rates', task.payload.id, res.data);
        break;
      }
      case 'UPDATE_RATE':
        await api.put(`/rates/${task.payload.id}`, task.payload.data);
        break;
      case 'DELETE_RATE':
        await api.delete(`/rates/${task.payload}`);
        break;
      case 'SAVE_RATE_SETTINGS':
        await api.post('/rates/settings', task.payload);
        break;
      case 'RECORD_PAYMENT': {
        const res = await api.post('/payments', task.payload);
        await this.handleCreateSyncResult('ledgers', task.payload.id, res.data);
        break;
      }
      case 'CREATE_USER': {
        const res = await api.post('/users', task.payload);
        await this.handleCreateSyncResult('users', task.payload.id, res.data);
        break;
      }
      case 'UPDATE_USER':
        await api.put(`/users/${task.payload.id}`, task.payload.data);
        break;
      case 'DELETE_USER':
        await api.delete(`/users/${task.payload}`);
        break;
      case 'UPDATE_DAIRY':
        await api.put(`/dairies/${task.payload.id}`, task.payload.data);
        break;
      case 'FINALIZE_BILLS':
        await api.post('/reports/finalize-bills', task.payload);
        break;
    }
  }

  private async handleCreateSyncResult(schemaName: string, tempId: string, serverDoc: any) {
    if (!tempId || !serverDoc || !isNativeApp()) return;
    const realId = serverDoc.id || serverDoc._id;
    if (!realId) return;

    await realmInstance.write(async () => {
      if (tempId !== realId) {
        try {
          await realmInstance.delete(schemaName, tempId);
        } catch (e) {}
      }
      await realmInstance.create(schemaName, { ...serverDoc, id: realId }, 'all');
    });
  }

  async syncFromServer() {
    if (!this.isOnline || !isNativeApp()) return;
    try {
      await this.syncCollection('farmers', '/farmers');
      await this.syncCollection('collections', '/collections');
      await this.syncCollection('shifts', '/shifts/recent?limit=30');
      await this.syncCollection('sales_customers', '/sales/customers');
      await this.syncCollection('sales_records', '/sales');
      await this.syncCollection('rates', '/rates');
      await this.syncSettings();
      await this.syncCollection('ledgers', '/ledger');
      await this.syncCollection('users', '/users');
      await this.syncCollection('dairies', '/dairies');
    } catch (error) {
      console.error('Server sync failed:', error);
    }
  }

  private async syncSettings() {
    try {
      const res = await api.get('/rates/settings');
      if (res.data && !Array.isArray(res.data)) {
        await realmInstance.write(() => realmInstance.create('rate_settings', { ...res.data, id: 'current' }, 'all'));
      }
    } catch (e) {}
  }

  private async syncCollection(schemaName: string, endpoint: string) {
    try {
      const res = await api.get(endpoint);
      const data = res.data?.data || res.data;
      if (Array.isArray(data)) {
        await this.syncDataToLocal(schemaName, data);
      }
    } catch (e) {}
  }

  private async syncDataToLocal(schemaName: string, data: any[]) {
    if (!isNativeApp()) return;
    await realmInstance.write(async () => {
      for (const item of data) {
        const id = item.id || item._id;
        if (id) {
          await realmInstance.create(schemaName, { ...item, id }, 'all');
        }
      }
    });
  }

  // --- Offline Read Methods ---

  async getFarmers(): Promise<any[]> {
    if (!isNativeApp()) return [];
    return await realmInstance.objects('farmers');
  }

  async getFarmerById(id: string) {
    if (!isNativeApp()) return null;
    return await realmInstance.objectForPrimaryKey('farmers', id);
  }

  async searchFarmer(farmerId: string) {
    if (!isNativeApp()) return null;
    const results = await realmInstance.find<any>('farmers', f => f.farmerId === farmerId);
    return results[0] || null;
  }

  async getCollectionsByDate(dateStr: string, endDate?: string) {
    if (!isNativeApp()) return [];
    const docs = await realmInstance.objects<any>('collections');
    const startCompare = dateStr.split('T')[0];
    
    if (endDate) {
      const endCompare = endDate.split('T')[0];
      return docs.filter(doc => {
        const d = typeof doc.date === 'string' ? doc.date.split('T')[0] : new Date(doc.date).toISOString().split('T')[0];
        return d >= startCompare && d <= endCompare;
      });
    }
    
    return docs.filter(doc => {
      const d = typeof doc.date === 'string' ? doc.date.split('T')[0] : new Date(doc.date).toISOString().split('T')[0];
      return d === startCompare;
    });
  }

  async recordCollectionOffline(payload: any) {
    if (!isNativeApp()) throw new Error('Offline mode not available on web');

    const fatVal = parseFloat(payload.fat);
    const snfVal = parseFloat(payload.snf);

    // Specialized Fat and SNF validation
    let isValid = false;
    if (fatVal >= 3.0 && fatVal <= 5.9) {
      if (snfVal >= 8.0 && snfVal <= 8.5) {
        isValid = true;
      }
    } else if (fatVal >= 6.0 && fatVal <= 10.0) {
      if (snfVal >= 8.3 && snfVal <= 9.0) {
        isValid = true;
      }
    }

    if (!isValid) {
      throw new Error('Invalid fat snf input');
    }

    const id = 'coll_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const roundedRate = Math.round((payload.rate || 0) * 100) / 100;
    const roundedAmount = Math.round((payload.amount || (payload.quantity * roundedRate) || 0) * 100) / 100;
    
    const doc = {
      ...payload,
      id,
      rate: roundedRate,
      amount: roundedAmount,
      date: payload.date || new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    
    await realmInstance.write(() => realmInstance.create('collections', doc, 'all'));
    await this.queueTask('CREATE_COLLECTION', doc);
    return doc;
  }

  async getRecentShifts(limit: number = 10): Promise<any[]> {
    if (!isNativeApp()) return [];
    const items = await realmInstance.objects<any>('shifts');
    return items.slice(0, limit);
  }

  async getShiftSummaryOffline(dateStr: string, shift: string) {
    if (!isNativeApp()) return null;
    const collections = await this.getCollectionsByDate(dateStr);
    const shiftCollections = collections.filter(c => c.shift?.toLowerCase() === shift.toLowerCase());

    const totalQty = shiftCollections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const totalAmt = shiftCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
    const avgFat = shiftCollections.length ? shiftCollections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0) / totalQty : 0;
    const avgSnf = shiftCollections.length ? shiftCollections.reduce((sum, c) => sum + (c.snf || 0) * (c.quantity || 0), 0) / totalQty : 0;

    return {
      date: dateStr,
      shift,
      totalQty,
      totalAmt,
      avgFat,
      avgSnf,
      collectionsCount: shiftCollections.length,
      collections: shiftCollections
    };
  }

  async getSalesCustomers(): Promise<any[]> {
    if (!isNativeApp()) return [];
    return await realmInstance.objects('sales_customers');
  }

  async addCustomerOffline(payload: any) {
    if (!isNativeApp()) throw new Error('Offline mode not available on web');
    const id = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const doc = {
      ...payload,
      id,
      createdAt: new Date().toISOString(),
      balance: 0
    };
    await realmInstance.write(() => realmInstance.create('sales_customers', doc, 'all'));
    await this.queueTask('CREATE_SALE_CUSTOMER', doc);
    return doc;
  }

  async recordSaleOffline(payload: any) {
    if (!isNativeApp()) throw new Error('Offline mode not available on web');
    const id = 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const roundedRate = Math.round((payload.rate || 0) * 100) / 100;
    const roundedAmount = Math.round((payload.amount || payload.quantity * roundedRate || 0) * 100) / 100;
    
    // Simulate message sending
    const messageStatus = await this.sendSaleMessage(payload.customerMobile, payload.customerName, payload.quantity, roundedAmount, payload.notes);
    
    const doc = {
      ...payload,
      id,
      rate: roundedRate,
      amount: roundedAmount,
      date: payload.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      messageStatus
    };
    
    await realmInstance.write(() => realmInstance.create('sales_records', doc, 'all'));
    await this.queueTask('RECORD_SALE', doc);
    return doc;
  }

  private async sendSaleMessage(mobile: string, name: string, qty: number, amount: number, notes?: string) {
    console.log(`[SIMULATED SMS] To: ${mobile} (${name}), Msg: Your milk purchase of ${qty}L for ₹${amount} has been recorded. Note: ${notes || 'N/A'}`);
    return 'Sent';
  }

  async getRecentSales(limit: number = 20): Promise<any[]> {
    if (!isNativeApp()) return [];
    const items = await realmInstance.objects<any>('sales_records');
    return items.slice(0, limit).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getSalesByDate(dateStr: string) {
    if (!isNativeApp()) return [];
    const docs = await realmInstance.objects<any>('sales_records');
    const target = dateStr.split('T')[0];
    return docs.filter(doc => {
      const d = typeof doc.date === 'string' ? doc.date.split('T')[0] : new Date(doc.date).toISOString().split('T')[0];
      return d === target;
    });
  }

  async getRates(): Promise<any[]> {
    if (!isNativeApp()) return [];
    return await realmInstance.objects('rates');
  }

  async getRateSettings() {
    if (isNativeApp()) {
      const settings = await realmInstance.objectForPrimaryKey<any>('rate_settings', 'current');
      if (settings) return settings;
    }
    return {
      id: 'current',
      fatMultiplier1: 3.96,
      snfMultiplier1: 2.64,
      maxFatForFormula1: 6.0,
      fatMultiplier2: 7.77,
      snfDeductions: {}
    };
  }

  async getLedger(): Promise<any[]> {
    if (!isNativeApp()) return [];
    return await realmInstance.objects('ledgers');
  }

  async getLedgerByFarmerId(farmerInternalId: string) {
    if (!isNativeApp()) return [];
    const items = await realmInstance.objects<any>('ledgers');
    return items.filter(doc => doc.farmerInternalId === farmerInternalId || doc.farmerId === farmerInternalId);
  }

  async recordPaymentOffline(payload: any) {
    if (!isNativeApp()) throw new Error('Offline mode not available on web');
    const id = 'payment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const roundedAmount = Math.round((payload.amount || 0) * 100) / 100;
    const doc = {
      ...payload,
      id,
      amount: roundedAmount,
      date: new Date().toISOString()
    };
    await realmInstance.write(() => realmInstance.create('ledgers', doc, 'all'));
    await this.queueTask('RECORD_PAYMENT', doc);
    return doc;
  }

  async recordCustomerPaymentOffline(payload: any) {
    if (!isNativeApp()) throw new Error('Offline mode not available on web');
    const id = 'cust_pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const roundedAmount = Math.round((payload.amount || 0) * 100) / 100;
    const doc = {
      ...payload,
      id,
      amount: roundedAmount,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    await realmInstance.write(() => realmInstance.create('customer_payments', doc, 'all'));
    await this.queueTask('RECORD_CUSTOMER_PAYMENT', doc);
    return doc;
  }

  async getUsers(): Promise<any[]> {
    if (!isNativeApp()) return [];
    return await realmInstance.objects('users');
  }

  async getDairies(): Promise<any[]> {
    if (!isNativeApp()) return [];
    return await realmInstance.objects('dairies');
  }

  async getBillsOffline(year: number, month: number, period: number, farmerId?: string) {
    if (!isNativeApp()) return [];
    const farmers = await this.getFarmers();
    const collections = await realmInstance.objects<any>('collections');
    // ... rest of the logic remains same but restricted to local data
    // (truncating for brevity as requested "reduce repeated code patterns" and keeping it clean)
    return this.calculateBills(farmers, collections, year, month, period, farmerId);
  }

  private calculateBills(farmers: any[], collections: any[], year: number, month: number, period: number, farmerId?: string) {
    let startDay = 1, endDay = 10;
    if (period === 2) { startDay = 11; endDay = 20; }
    else if (period === 3) { startDay = 21; endDay = 31; }

    const startCompare = `${year}-${String(month + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endCompare = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    const billsMap = new Map<string, any>();
    collections.forEach(c => {
      const d = typeof c.date === 'string' ? c.date.split('T')[0] : new Date(c.date).toISOString().split('T')[0];
      if (d < startCompare || d > endCompare) return;

      const fId = c.farmerInternalId || c.farmerId;
      if (!fId || (farmerId && fId !== farmerId)) return;

      if (!billsMap.has(fId)) {
        const f = farmers.find(item => item.id === fId || item.farmerId === fId);
        billsMap.set(fId, {
          farmerId: f?.farmerId || 'Unknown',
          farmerName: f?.name || 'Unknown',
          quantity: 0, amount: 0, fatSum: 0, snfSum: 0, count: 0,
          startDate: startCompare, endDate: endCompare, collections: []
        });
      }
      const b = billsMap.get(fId);
      b.quantity += c.quantity || 0;
      b.amount += c.amount || 0;
      b.fatSum += (c.fat || 0) * (c.quantity || 0);
      b.snfSum += (c.snf || 0) * (c.quantity || 0);
      b.count++;
      b.collections.push(c);
    });

    return Array.from(billsMap.values()).map(b => ({
      ...b,
      amount: Math.round(b.amount * 100) / 100,
      avgFat: b.quantity ? Math.round((b.fatSum / b.quantity) * 100) / 100 : 0,
      avgSnf: b.quantity ? Math.round((b.snfSum / b.quantity) * 100) / 100 : 0
    }));
  }

  async getDashboardOffline(days: number = 7) {
    if (!isNativeApp()) return null;
    const farmers = await this.getFarmers();
    const collections = await realmInstance.objects<any>('collections');
    const todayStr = new Date().toISOString().split('T')[0];
    
    const today = collections.filter(c => {
      const d = typeof c.date === 'string' ? c.date.split('T')[0] : new Date(c.date).toISOString().split('T')[0];
      return d === todayStr;
    });

    const qty = today.reduce((s, c) => s + (c.quantity || 0), 0);
    const morning = today.filter(c => c.shift?.toLowerCase() === 'morning').reduce((s, c) => s + (c.quantity || 0), 0);
    const evening = today.filter(c => c.shift?.toLowerCase() === 'evening').reduce((s, c) => s + (c.quantity || 0), 0);
    const amount = today.reduce((s, c) => s + (c.amount || 0), 0);
    const fat = qty ? today.reduce((s, c) => s + (c.fat || 0) * (c.quantity || 0), 0) / qty : 0;
    const snf = qty ? today.reduce((s, c) => s + (c.snf || 0) * (c.quantity || 0), 0) / qty : 0;

    // Filter collections for last N days for trend data
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const trendData = collections.filter(c => new Date(c.date) >= cutoffDate);

    return {
      todayQty: Math.round(qty * 100) / 100,
      morningQty: Math.round(morning * 100) / 100,
      eveningQty: Math.round(evening * 100) / 100,
      todayAmount: Math.round(amount * 100) / 100,
      avgFat: Math.round(fat * 100) / 100,
      avgSnf: Math.round(snf * 100) / 100,
      totalFarmers: farmers.length,
      recentTxns: collections.slice(0, 10),
      trendData: trendData
    };
  }
}

export const offlineService = new OfflineService();
