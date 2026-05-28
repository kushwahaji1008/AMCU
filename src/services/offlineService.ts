import PouchDB from 'pouchdb-browser';
import pouchdbFind from 'pouchdb-find';
import { Capacitor } from '@capacitor/core';
import api from './axiosInstance';

PouchDB.plugin(pouchdbFind);

// Local databases using IndexedDB adapter explicitly (Works flawlessly on PWA and Android Capacitor)
const isNative = Capacitor.isNativePlatform();
const dbOptions: any = {
  adapter: 'idb'
};

export const db = {
  farmers: new PouchDB('farmers', dbOptions),
  farmerBalances: new PouchDB('farmer_balances', dbOptions),
  collections: new PouchDB('collections', dbOptions),
  shifts: new PouchDB('shifts', dbOptions),
  salesCustomers: new PouchDB('sales_customers', dbOptions),
  salesRecords: new PouchDB('sales_records', dbOptions),
  rates: new PouchDB('rates', dbOptions),
  rateSettings: new PouchDB('rate_settings', dbOptions),
  payments: new PouchDB('payments', dbOptions),
  ledgers: new PouchDB('ledgers', dbOptions),
  users: new PouchDB('users', dbOptions),
  dairies: new PouchDB('dairies', dbOptions),
  syncQueue: new PouchDB('sync_queue', dbOptions)
};

// Create indexes safely
db.farmers.createIndex({ index: { fields: ['farmerId'] } }).catch(() => {});
db.collections.createIndex({ index: { fields: ['date', 'shift'] } }).catch(() => {});
db.shifts.createIndex({ index: { fields: ['date'] } }).catch(() => {});
db.salesCustomers.createIndex({ index: { fields: ['id'] } }).catch(() => {});
db.salesRecords.createIndex({ index: { fields: ['date'] } }).catch(() => {});
db.rates.createIndex({ index: { fields: ['id'] } }).catch(() => {});
db.ledgers.createIndex({ index: { fields: ['farmerId', 'date'] } }).catch(() => {});
db.payments.createIndex({ index: { fields: ['farmerId'] } }).catch(() => {});

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
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
      this.syncFromServer();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async queueTask(type: SyncTask['type'], payload: any) {
    const task: SyncTask = {
      _id: new Date().toISOString() + '_' + Math.random().toString(36).substr(2, 9),
      type,
      payload,
      timestamp: Date.now()
    };
    await db.syncQueue.put(task);
    
    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  async processSyncQueue() {
    if (!Capacitor.isNativePlatform()) return;
    if (this.syncInProgress || !this.isOnline) return;
    this.syncInProgress = true;

    try {
      const result = await db.syncQueue.allDocs({ include_docs: true });
      const tasks = result.rows.map(row => row.doc as unknown as SyncTask).sort((a, b) => a.timestamp - b.timestamp);

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
          await db.syncQueue.remove(task as any);
        } catch (error: any) {
          console.error('Failed to sync task:', task, error);
          if (error.status >= 400 && error.status < 500) {
             await db.syncQueue.remove(task as any);
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async safeGetList(endpoint: string): Promise<any[]> {
    try {
      const res = await api.get(endpoint);
      if (Array.isArray(res.data)) return res.data;
      if (res.data && Array.isArray(res.data.data)) return res.data.data;
      return [];
    } catch (e: any) {
      if (e?.response?.status === 403 || e?.response?.status === 401) {
        console.warn(`Access denied for ${endpoint}, skipping sync.`);
        return [];
      }
      console.error(`Sync failed for ${endpoint}:`, e?.message || e);
      return [];
    }
  }

  private async syncCollection(dbInstance: any, endpoint: string) {
    const data = await this.safeGetList(endpoint);
    await this.syncDataToLocal(dbInstance, data);
  }

  private async syncDataToLocal(dbInstance: any, data: any[]) {
    const existing = await dbInstance.allDocs();
    const existingMap = new Map(existing.rows.map((r: any) => [r.id, r.value.rev]));
    
    // Deduplicate data by ID to prevent intra-bulk conflicts
    const uniqueDataMap = new Map();
    data.forEach(item => {
      const id = item.id || item._id;
      if (id) {
        uniqueDataMap.set(id, item);
      }
    });

    const bulkData = Array.from(uniqueDataMap.values()).map((item: any) => {
      const id = item.id || item._id;
      const doc = { ...item, _id: id };
      if (existingMap.has(id)) {
        doc._rev = existingMap.get(id);
        existingMap.delete(id);
      }
      return doc;
    });

    for (const [id, rev] of existingMap.entries()) {
      // Don't delete design docs
      if (typeof id === 'string' && !id.startsWith('_design/')) {
        bulkData.push({ _id: id, _rev: rev, _deleted: true });
      }
    }

    if (bulkData.length > 0) {
      try {
        await dbInstance.bulkDocs(bulkData);
      } catch (e) {
        console.error('bulkDocs conflict or error:', e);
      }
    }
  }

  async syncFromServer() {
    if (!Capacitor.isNativePlatform()) return;
    if (!this.isOnline) return;
    try {
      // 1. Sync Farmers
      await this.syncCollection(db.farmers, '/farmers');
      
      // 2. Sync Collections (last 30 days)
      const date = new Date();
      date.setDate(date.getDate() - 30);
      await this.syncCollection(db.collections, `/collections/report?date=${date.toISOString()}`);

      // 3. Sync Shifts
      await this.syncCollection(db.shifts, '/shifts/recent?limit=30');

      // 4. Sync Sales Customers
      await this.syncCollection(db.salesCustomers, '/sales/customers');

      // 5. Sync Rates
      await this.syncCollection(db.rates, '/rates');

      // 6. Sync Rate Settings
      try {
        const rateSettingsRes = await api.get('/rates/settings');
        const rateSettings = rateSettingsRes.data;
        if (rateSettings && !Array.isArray(rateSettings)) {
          try {
            const existing = await db.rateSettings.get('current');
            await db.rateSettings.put({ ...rateSettings, _id: 'current', _rev: existing._rev });
          } catch (e) {
            await db.rateSettings.put({ ...rateSettings, _id: 'current' });
          }
        }
      } catch (e: any) {
        if (e?.response?.status !== 403 && e?.response?.status !== 401) {
          console.error("Rate settings sync failed", e?.message || e);
        }
      }

      // 7. Sync Ledger
      await this.syncCollection(db.ledgers, '/ledger');

      // 8. Sync Users
      await this.syncCollection(db.users, '/users');

      // 9. Sync Dairies
      await this.syncCollection(db.dairies, '/dairies');

    } catch (error) {
      console.error('Failed to sync from server:', error);
    }
  }

  // --- Offline Read/Mutation Methods ---

  // 1. Farmers
  async getFarmers(): Promise<any[]> {
    const result = await db.farmers.allDocs({ include_docs: true });
    const balancesResult = await db.farmerBalances.allDocs({ include_docs: true });
    
    const balancesMap = new Map();
    balancesResult.rows.forEach(r => balancesMap.set(r.id, (r.doc as any).balance));
    
    return result.rows.map(row => {
      const f = row.doc as any;
      f.balance = balancesMap.get(f._id) || 0;
      return f;
    });
  }

  async getFarmerById(id: string) {
    try {
      return await db.farmers.get(id);
    } catch (e) {
      const result = await db.farmers.find({ selector: { farmerId: id } });
      return result.docs[0] || null;
    }
  }

  async searchFarmer(farmerId: string) {
    const result = await db.farmers.find({ selector: { farmerId } });
    return result.docs[0] || null;
  }

  // 2. Collections
  async getCollectionsByDate(dateStr: string, endDate?: string) {
    const result = await db.collections.allDocs({ include_docs: true });
    const docs = result.rows.map(row => row.doc as any);
    const startCompare = dateStr.split('T')[0];
    
    if (endDate) {
      const endCompare = endDate.split('T')[0];
      return docs.filter(doc => {
        if (!doc.date) return false;
        const comp = doc.date.split('T')[0];
        return comp >= startCompare && comp <= endCompare;
      });
    }
    
    return docs.filter(doc => doc.date && doc.date.split('T')[0] === startCompare);
  }

  // 3. Shifts
  async getRecentShifts(limit: number = 10): Promise<any[]> {
    const result = await db.shifts.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc as any).slice(0, limit);
  }

  async getShiftSummaryOffline(dateStr: string, shift: string) {
    const collections = await this.getCollectionsByDate(dateStr);
    const shiftCollections = collections.filter(c => String(c?.shift || '').toLowerCase() === String(shift || '').toLowerCase());
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
    const result = await db.salesCustomers.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc as any);
  }

  async recordSaleOffline(payload: any) {
    const doc = {
      ...payload,
      _id: 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      createdAt: new Date().toISOString()
    };
    await db.salesRecords.put(doc);
    await this.queueTask('RECORD_SALE', payload);
    return doc;
  }

  // 5. Rates
  async getRates(): Promise<any[]> {
    const result = await db.rates.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc as any);
  }

  async getRateSettings() {
    try {
      return await db.rateSettings.get('current');
    } catch {
      return {
        _id: 'current',
        fatMultiplier1: 3.96,
        snfMultiplier1: 2.64,
        maxFatForFormula1: 6.0,
        fatMultiplier2: 7.77,
        snfDeductions: {}
      };
    }
  }

  // 6. Ledger & Payments
  async getLedger(): Promise<any[]> {
    const result = await db.ledgers.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc as any);
  }

  async getLedgerByFarmerId(farmerInternalId: string) {
    const result = await db.ledgers.allDocs({ include_docs: true });
    return result.rows
      .map(row => row.doc as any)
      .filter(doc => doc.farmerId === farmerInternalId || doc.farmerInternalId === farmerInternalId);
  }

  async recordPaymentOffline(payload: any) {
    const doc = {
      ...payload,
      _id: 'payment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      date: new Date().toISOString()
    };
    await db.ledgers.put(doc);
    await this.queueTask('RECORD_PAYMENT', payload);
    return doc;
  }

  // 7. Users
  async getUsers(): Promise<any[]> {
    const result = await db.users.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc as any);
  }

  // 8. Dairies
  async getDairies(): Promise<any[]> {
    const result = await db.dairies.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc as any);
  }

  // 9. Bills offline calculation
  async getBillsOffline(year: number, month: number, period: number, farmerId?: string) {
    const farmers = await this.getFarmers();
    const result = await db.collections.allDocs({ include_docs: true });
    const collections = result.rows.map(row => row.doc as any);

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
      const comp = c.date.split('T')[0];
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

      if (!billsMap.has(fId)) {
        billsMap.set(fId, {
          farmerId: userFarmerId,
          farmerInternalId: fId,
          farmerName,
          quantity: 0,
          averageFat: 0,
          averageSnf: 0,
          amount: 0,
          fatSum: 0,
          snfSum: 0,
          count: 0
        });
      }

      const bill = billsMap.get(fId);
      bill.quantity += c.quantity || 0;
      bill.amount += c.amount || 0;
      bill.fatSum += (c.fat || 0) * (c.quantity || 0);
      bill.snfSum += (c.snf || 0) * (c.quantity || 0);
      bill.count += 1;
    });

    const billsList = Array.from(billsMap.values()).map(b => ({
      ...b,
      averageFat: b.quantity ? b.fatSum / b.quantity : 0,
      averageSnf: b.quantity ? b.snfSum / b.quantity : 0
    }));

    return billsList;
  }

  // 10. Dashboard offline calculation
  async getDashboardOffline() {
    const farmers = await this.getFarmers();
    const result = await db.collections.allDocs({ include_docs: true });
    const collections = result.rows.map(row => row.doc as any);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayCollections = collections.filter(c => c.date && c.date.startsWith(todayStr));

    const todayQty = todayCollections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const morningQty = todayCollections.filter(c => c.shift === 'Morning').reduce((sum, c) => sum + (c.quantity || 0), 0);
    const eveningQty = todayCollections.filter(c => c.shift === 'Evening').reduce((sum, c) => sum + (c.quantity || 0), 0);
    const todayAmount = todayCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
    
    const avgFat = todayQty ? todayCollections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0) / todayQty : 0;
    const avgSnf = todayQty ? todayCollections.reduce((sum, c) => sum + (c.snf || 0) * (c.quantity || 0), 0) / todayQty : 0;

    // Sorting collections to get recent transactions
    const sortedCollections = collections
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

    // Generate trendData for last 7 days
    const trendData: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dateCollections = collections.filter(c => c.date && c.date.startsWith(dateStr));
      trendData.push({
        date: dateStr,
        quantity: dateCollections.reduce((sum, c) => sum + (c.quantity || 0), 0),
        amount: dateCollections.reduce((sum, c) => sum + (c.amount || 0), 0)
      });
    }

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
