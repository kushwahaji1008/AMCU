import { realmInstance } from './realm';
import api from './axiosInstance';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

/**
 * Custom PouchDB to Realm drop-in emulation wrapper.
 * Emulates CouchDB/PouchDB methods for smooth integration with existing APIs,
 * while executing fully on top of our schema-indexed Realm database architecture.
 */
const createCollectionWrapper = (schemaName: string) => {
  return {
    allDocs: async (options?: { include_docs?: boolean }) => {
      const objects = await realmInstance.objects<any>(schemaName);
      return {
        rows: objects.map(item => ({
          id: item.id || item._id,
          key: item.id || item._id,
          value: { rev: item._rev || '1' },
          doc: { ...item, _id: item.id || item._id }
        }))
      };
    },
    get: async (id: string) => {
      const item = await realmInstance.objectForPrimaryKey<any>(schemaName, id);
      if (!item) {
        throw { status: 404, message: 'missing', error: true };
      }
      return { ...item, _id: item.id || item._id };
    },
    put: async (doc: any) => {
      const id = doc.id || doc._id;
      if (!id) {
        throw new Error(`Document must have an ID for Realm schema "${schemaName}".`);
      }
      // PouchDB expects _id, but we store as id
      const itemToSave = { ...doc, id };
      return await realmInstance.write(async () => {
        return await realmInstance.create(schemaName, itemToSave, 'all');
      });
    },
    remove: async (doc: any) => {
      const id = doc.id || doc._id;
      if (!id) {
        throw new Error('Document must have an ID to remove.');
      }
      return await realmInstance.write(async () => {
        await realmInstance.delete(schemaName, id);
      });
    },
    find: async (query: any) => {
      const selector = query.selector || {};
      const objects = await realmInstance.objects<any>(schemaName);
      const docs = objects.filter(item => {
        return Object.keys(selector).every(key => {
          const val = selector[key];
          const itemVal = item[key];
          return itemVal === val;
        });
      });
      return {
        docs: docs.map(item => ({ ...item, _id: item.id || item._id }))
      };
    },
    createIndex: async (indexConfig: any) => {
      // Indexing is pre-configured dynamically in the Realm engine. Safe no-op.
      return { result: 'created' };
    }
  };
};

export const db = {
  farmers: createCollectionWrapper('farmers'),
  collections: createCollectionWrapper('collections'),
  shifts: createCollectionWrapper('shifts'),
  salesCustomers: createCollectionWrapper('sales_customers'),
  salesRecords: createCollectionWrapper('sales_records'),
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
    // 1. Web browser fallback listeners
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
      this.syncFromServer();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // 2. Native Capacitor network listeners for Android and iOS
    if (Capacitor.isNativePlatform()) {
      try {
        Network.addListener('networkStatusChange', (status) => {
          const wasOnline = this.isOnline;
          this.isOnline = status.connected;
          console.log(`[OfflineService] Native Network state changed: ${this.isOnline ? 'ONLINE' : 'OFFLINE'}`);
          
          if (wasOnline !== this.isOnline) {
            window.dispatchEvent(new Event(this.isOnline ? 'online' : 'offline'));
          }

          if (this.isOnline) {
            this.processSyncQueue();
            this.syncFromServer();
          }
        });

        // Initialize state natively
        Network.getStatus().then((status) => {
          const wasOnline = this.isOnline;
          this.isOnline = status.connected;
          console.log(`[OfflineService] Initial Native Network state: ${this.isOnline ? 'ONLINE' : 'OFFLINE'}`);
          
          if (wasOnline !== this.isOnline) {
            window.dispatchEvent(new Event(this.isOnline ? 'online' : 'offline'));
          }

          if (this.isOnline) {
            this.processSyncQueue();
            this.syncFromServer();
          }
        });
      } catch (err) {
        console.warn('Failed to initialize Capacitor Network listeners, relying on window listeners:', err);
      }
    }
  }

  async queueTask(type: SyncTask['type'], payload: any) {
    const task: SyncTask = {
      _id: new Date().toISOString() + '_' + Math.random().toString(36).substr(2, 9),
      type,
      payload,
      timestamp: Date.now()
    };
    await realmInstance.write(() => 
      realmInstance.create('sync_queue', { ...task, id: task._id }, 'all')
    );
    
    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  async processSyncQueue() {
    if (this.syncInProgress || !this.isOnline) return;
    this.syncInProgress = true;

    try {
      const result = await realmInstance.objects<any>('sync_queue');
      const tasks = [...result].sort((a, b) => a.timestamp - b.timestamp);

      for (const task of tasks) {
        try {
          switch (task.type) {
            case 'CREATE_FARMER':
              await api.post('/farmers', task.payload);
              break;
            case 'UPDATE_FARMER':
              await api.put(`/farmers/${task.payload.id}`, task.payload.data);
              break;
            case 'DELETE_FARMER':
              await api.delete(`/farmers/${task.payload}`);
              break;
            case 'CREATE_COLLECTION':
              await api.post('/collections', task.payload);
              break;
            case 'UPDATE_COLLECTION':
              await api.put(`/collections/${task.payload.id}`, task.payload.data);
              break;
            case 'CREATE_SHIFT':
            case 'SAVE_SHIFT_SUMMARY':
              await api.post('/shifts/summary', task.payload);
              break;
            case 'CREATE_SALE_CUSTOMER':
              await api.post('/sales/customers', task.payload);
              break;
            case 'RECORD_SALE':
              await api.post('/sales', task.payload);
              break;
            case 'CREATE_RATE':
              await api.post('/rates', task.payload);
              break;
            case 'UPDATE_RATE':
              await api.put(`/rates/${task.payload.id}`, task.payload.data);
              break;
            case 'DELETE_RATE':
              await api.delete(`/rates/${task.payload}`);
              break;
            case 'SAVE_RATE_SETTINGS':
              await api.post('/rates/settings', task.payload);
              break;
            case 'RECORD_PAYMENT':
              await api.post('/payments', task.payload);
              break;
            case 'CREATE_USER':
              await api.post('/users', task.payload);
              break;
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
          // Remove from queue after successful sync
          await realmInstance.write(() => realmInstance.delete('sync_queue', task.id || task._id));
        } catch (error: any) {
          console.error('Failed to sync task:', task, error);
          if (error.status >= 400 && error.status < 500) {
             await realmInstance.write(() => realmInstance.delete('sync_queue', task.id || task._id));
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async safeGetList(endpoint: string): Promise<any[] | null> {
    try {
      const res = await api.get(endpoint);
      if (Array.isArray(res.data)) return res.data;
      if (res.data && Array.isArray(res.data.data)) return res.data.data;
      return [];
    } catch (e: any) {
      const status = e?.status || e?.response?.status;
      if (status === 403 || status === 401) {
        console.warn(`Access denied for ${endpoint}, skipping sync.`);
        return null;
      }
      console.error(`Sync failed for ${endpoint}:`, e?.message || e);
      return null;
    }
  }

  private async syncCollection(schemaName: string, endpoint: string) {
    const data = await this.safeGetList(endpoint);
    if (data === null) {
      return;
    }
    await this.syncDataToLocal(schemaName, data);
  }

  private async syncDataToLocal(schemaName: string, data: any[]) {
    const existing = await realmInstance.objects<any>(schemaName);
    const existingIds = new Set(existing.map((r: any) => r.id || r._id));
    
    const uniqueIncoming = new Map();
    data.forEach(item => {
      const id = item.id || item._id;
      if (id) {
        uniqueIncoming.set(id, item);
      }
    });

    await realmInstance.write(async () => {
      // Upsert incoming values
      for (const item of uniqueIncoming.values()) {
        const id = item.id || item._id;
        await realmInstance.create(schemaName, { ...item, id }, 'all');
        existingIds.delete(id);
      }

      // Delete values that were deleted on the server
      for (const id of existingIds) {
        if (typeof id === 'string') {
          // Keep persistent local rate settings current
          if (schemaName === 'rate_settings' && id === 'current') continue;
          await realmInstance.delete(schemaName, id);
        }
      }
    });
  }

  async syncFromServer() {
    if (!this.isOnline) return;
    try {
      // 1. Sync Farmers
      await this.syncCollection('farmers', '/farmers');
      
      // 2. Sync Collections (ALL of them, ensuring permanent offsite backup and local retention)
      await this.syncCollection('collections', '/collections');

      // 3. Sync Shifts
      await this.syncCollection('shifts', '/shifts/recent?limit=30');

      // 4. Sync Sales Customers
      await this.syncCollection('sales_customers', '/sales/customers');

      // 5. Sync Sales Records (ALL transactions from feed/milk sales)
      await this.syncCollection('sales_records', '/sales');

      // 6. Sync Rates
      await this.syncCollection('rates', '/rates');

      // 7. Sync Rate Settings
      try {
        const rateSettingsRes = await api.get('/rates/settings');
        const rateSettings = rateSettingsRes.data;
        if (rateSettings && !Array.isArray(rateSettings)) {
          await realmInstance.write(() => realmInstance.create('rate_settings', { ...rateSettings, id: 'current' }, 'all'));
        }
      } catch (e: any) {
        const status = e?.status || e?.response?.status;
        if (status !== 403 && status !== 401) {
          console.error("Rate settings sync failed", e?.message || e);
        }
      }

      // 8. Sync Ledgers (all entries)
      await this.syncCollection('ledgers', '/ledger');

      // 9. Sync Users
      await this.syncCollection('users', '/users');

      // 10. Sync Dairies
      await this.syncCollection('dairies', '/dairies');

    } catch (error) {
      console.error('Failed to sync from server:', error);
    }
  }

  // --- Offline Read/Mutation Methods ---

  // 1. Farmers
  async getFarmers(): Promise<any[]> {
    return await realmInstance.objects('farmers');
  }

  async getFarmerById(id: string) {
    return await realmInstance.objectForPrimaryKey('farmers', id);
  }

  async searchFarmer(farmerId: string) {
    const results = await realmInstance.find('farmers', f => f.farmerId === farmerId);
    return results[0] || null;
  }

  // 2. Collections
  async getCollectionsByDate(dateStr: string, endDate?: string) {
    const docs = await realmInstance.objects<any>('collections');
    const startCompare = dateStr.split('T')[0];
    
    if (endDate) {
      const endCompare = endDate.split('T')[0];
      return docs.filter(doc => {
        if (!doc.date) return false;
        const comp = typeof doc.date === 'string' ? doc.date.split('T')[0] : new Date(doc.date).toISOString().split('T')[0];
        return comp >= startCompare && comp <= endCompare;
      });
    }
    
    return docs.filter(doc => {
      if (!doc.date) return false;
      const comp = typeof doc.date === 'string' ? doc.date.split('T')[0] : new Date(doc.date).toISOString().split('T')[0];
      return comp === startCompare;
    });
  }

  // 3. Shifts
  async getRecentShifts(limit: number = 10): Promise<any[]> {
    const items = await realmInstance.objects<any>('shifts');
    return items.slice(0, limit);
  }

  async getShiftSummaryOffline(dateStr: string, shift: string) {
    const collections = await this.getCollectionsByDate(dateStr);
    const shiftCollections = collections.filter(c => c.shift && c.shift.toLowerCase() === shift.toLowerCase());

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

  // 4. Sales / Customers
  async getSalesCustomers(): Promise<any[]> {
    return await realmInstance.objects('sales_customers');
  }

  async recordSaleOffline(payload: any) {
    const id = 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const roundedRate = Math.round((payload.rate || 0) * 100) / 100;
    const roundedAmount = Math.round((payload.amount || payload.quantity * roundedRate || 0) * 100) / 100;
    const doc = {
      ...payload,
      id,
      rate: roundedRate,
      amount: roundedAmount,
      createdAt: new Date().toISOString()
    };
    await realmInstance.write(() => realmInstance.create('sales_records', doc, 'all'));
    await this.queueTask('RECORD_SALE', doc);
    return doc;
  }

  // 5. Rates
  async getRates(): Promise<any[]> {
    return await realmInstance.objects('rates');
  }

  async getRateSettings() {
    const settings = await realmInstance.objectForPrimaryKey<any>('rate_settings', 'current');
    if (settings) return settings;
    return {
      id: 'current',
      fatMultiplier1: 3.96,
      snfMultiplier1: 2.64,
      maxFatForFormula1: 6.0,
      fatMultiplier2: 7.77,
      snfDeductions: {}
    };
  }

  // 6. Ledger & Payments
  async getLedger(): Promise<any[]> {
    return await realmInstance.objects('ledgers');
  }

  async getLedgerByFarmerId(farmerInternalId: string) {
    const items = await realmInstance.objects<any>('ledgers');
    return items.filter(doc => doc.farmerInternalId === farmerInternalId || doc.farmerId === farmerInternalId);
  }

  async recordPaymentOffline(payload: any) {
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

  // 7. Users
  async getUsers(): Promise<any[]> {
    return await realmInstance.objects('users');
  }

  // 8. Dairies
  async getDairies(): Promise<any[]> {
    return await realmInstance.objects('dairies');
  }

  // 9. Bills offline calculation
  async getBillsOffline(year: number, month: number, period: number, farmerId?: string) {
    const farmers = await this.getFarmers();
    const collections = await realmInstance.objects<any>('collections');

    let startDay = 1;
    let endDay = 10;
    if (period === 2) {
      startDay = 11;
      endDay = 20;
    } else if (period === 3) {
      startDay = 21;
      endDay = 31;
    }

    const startCompare = `${year}-${String(month + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endCompare = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    const periodCollections = collections.filter(c => {
      if (!c.date) return false;
      const comp = typeof c.date === 'string' ? c.date.split('T')[0] : new Date(c.date).toISOString().split('T')[0];
      return comp >= startCompare && comp <= endCompare;
    });

    const billsMap = new Map<string, any>();

    periodCollections.forEach(c => {
      const fId = c.farmerInternalId || c.farmerId;
      if (!fId) return;
      if (farmerId && fId !== farmerId) return;

      const farmerObj = farmers.find((f: any) => f.id === fId || f._id === fId || f.farmerId === fId);
      const farmerName = farmerObj ? (farmerObj.name || farmerObj.displayName) : 'Unknown';
      const userFarmerId = farmerObj ? farmerObj.farmerId : 'F-Unknown';
      const village = farmerObj ? (farmerObj.village || '') : '';

      if (!billsMap.has(fId)) {
        billsMap.set(fId, {
          farmerId: userFarmerId,
          farmerInternalId: fId,
          farmerName,
          village,
          quantity: 0,
          totalQuantity: 0,
          averageFat: 0,
          averageSnf: 0,
          avgFat: 0,
          avgSnf: 0,
          amount: 0,
          fatSum: 0,
          snfSum: 0,
          count: 0,
          startDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
          endDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
          collections: []
        });
      }

      const bill = billsMap.get(fId);
      bill.quantity += c.quantity || 0;
      bill.totalQuantity += c.quantity || 0;
      bill.amount += c.amount || 0;
      bill.fatSum += (c.fat || 0) * (c.quantity || 0);
      bill.snfSum += (c.snf || 0) * (c.quantity || 0);
      bill.count += 1;
      bill.collections.push(c);
    });

    const billsList = Array.from(billsMap.values()).map(b => {
      const avgFatVal = b.quantity ? Math.round((b.fatSum / b.quantity) * 100) / 100 : 0;
      const avgSnfVal = b.quantity ? Math.round((b.snfSum / b.quantity) * 100) / 100 : 0;
      return {
        ...b,
        amount: Math.round(b.amount * 100) / 100,
        totalQuantity: Math.round(b.totalQuantity * 100) / 100,
        averageFat: avgFatVal,
        averageSnf: avgSnfVal,
        avgFat: avgFatVal,
        avgSnf: avgSnfVal
      };
    });

    return billsList;
  }

  // 10. Dashboard offline calculation
  async getDashboardOffline() {
    const farmers = await this.getFarmers();
    const collections = await realmInstance.objects<any>('collections');

    const todayStr = new Date().toISOString().split('T')[0];
    const todayCollections = collections.filter(c => {
      if (!c.date) return false;
      const comp = typeof c.date === 'string' ? c.date.split('T')[0] : new Date(c.date).toISOString().split('T')[0];
      return comp === todayStr;
    });

    const todayQty = Math.round(todayCollections.reduce((sum, c) => sum + (c.quantity || 0), 0) * 100) / 100;
    const morningQty = Math.round(todayCollections.filter(c => c.shift === 'Morning').reduce((sum, c) => sum + (c.quantity || 0), 0) * 100) / 100;
    const eveningQty = Math.round(todayCollections.filter(c => c.shift === 'Evening').reduce((sum, c) => sum + (c.quantity || 0), 0) * 100) / 100;
    const todayAmount = Math.round(todayCollections.reduce((sum, c) => sum + (c.amount || 0), 0) * 100) / 100;
    
    const avgFat = todayQty ? Math.round((todayCollections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0) / todayQty) * 100) / 100 : 0;
    const avgSnf = todayQty ? Math.round((todayCollections.reduce((sum, c) => sum + (c.snf || 0) * (c.quantity || 0), 0) / todayQty) * 100) / 100 : 0;

    const sortedCollections = [...collections]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 10);

    const recentTxns = sortedCollections.map(c => {
      const farmerObj = farmers.find((f: any) => f.id === c.farmerInternalId || f._id === c.farmerInternalId || f.farmerId === c.farmerInternalId);
      return {
        ...c,
        farmerName: farmerObj ? (farmerObj.name || farmerObj.displayName) : (c.farmerName || 'Unknown'),
        farmerId: farmerObj ? farmerObj.farmerId : (c.farmerId || '')
      };
    });

    // We can include the last 30 days of collections as trendData so the chart can filter or query them perfectly
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const trendData = collections.filter(c => {
      if (!c.date) return false;
      const comp = typeof c.date === 'string' ? c.date.split('T')[0] : new Date(c.date).toISOString().split('T')[0];
      return comp >= thirtyDaysAgoStr;
    }).map(c => {
      const farmerObj = farmers.find((f: any) => f.id === c.farmerInternalId || f._id === c.farmerInternalId || f.farmerId === c.farmerInternalId);
      return {
        ...c,
        farmerName: farmerObj ? (farmerObj.name || farmerObj.displayName) : (c.farmerName || 'Unknown'),
        farmerId: farmerObj ? farmerObj.farmerId : (c.farmerId || '')
      };
    });

    return {
      todayQty,
      morningQty,
      eveningQty,
      todayAmount,
      totalFarmers: farmers.length,
      avgFat,
      avgSnf,
      recentTxns,
      trendData
    };
  }
}

export const offlineService = new OfflineService();
