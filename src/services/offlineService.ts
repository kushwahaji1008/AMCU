import PouchDB from 'pouchdb-browser';
import pouchdbFind from 'pouchdb-find';
import api from './axiosInstance';

PouchDB.plugin(pouchdbFind);

// Helper to check if running on Android/device
export function isAndroidDevice(): boolean {
  // If online and super admin, we bypass offline-first behavior to let super admin manage everything on the server
  try {
    const savedProfile = localStorage.getItem('profile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile);
      if (profile?.role === 'super_admin' && navigator.onLine) {
        return false;
      }
    }
  } catch (e) {}

  const ua = navigator.userAgent.toLowerCase();
  return /android/i.test(ua) || !!(window as any).isAndroid || !!(window as any).Capacitor || !!(window as any).cordova;
}

// Shared non-partitioned database for caching logged in user accounts
export const accountsDb = new PouchDB('cached_user_accounts');

// Determine initial database suffix/partition
const getInitialUserId = (): string => {
  try {
    const savedProfile = localStorage.getItem('profile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile);
      if (profile && profile.uid) {
        const dbId = localStorage.getItem('databaseId') || profile.databaseId || '(default)';
        return `${profile.uid}_${dbId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      }
    }
  } catch (e) {}
  const dbId = localStorage.getItem('databaseId') || '(default)';
  const lastUser = localStorage.getItem('last_active_userId') || 'default';
  return `${lastUser}_${dbId.replace(/[^a-zA-Z0-9]/g, '_')}`;
};

let activeUserId = getInitialUserId();

// Local databases dynamically mapped
export const db: { [key: string]: any } = {
  farmers: new PouchDB(`farmers_${activeUserId}`),
  collections: new PouchDB(`collections_${activeUserId}`),
  shifts: new PouchDB(`shifts_${activeUserId}`),
  salesCustomers: new PouchDB(`sales_customers_${activeUserId}`),
  salesRecords: new PouchDB(`sales_records_${activeUserId}`),
  rates: new PouchDB(`rates_${activeUserId}`),
  rateSettings: new PouchDB(`rate_settings_${activeUserId}`),
  payments: new PouchDB(`payments_${activeUserId}`),
  ledgers: new PouchDB(`ledgers_${activeUserId}`),
  users: new PouchDB(`users_${activeUserId}`),
  dairies: new PouchDB(`dairies_${activeUserId}`),
  syncQueue: new PouchDB(`sync_queue_${activeUserId}`)
};

// Initialize index creator helper
const createIndexes = (databaseObj: typeof db) => {
  databaseObj.farmers.createIndex({ index: { fields: ['farmerId'] } }).catch(() => {});
  databaseObj.collections.createIndex({ index: { fields: ['date', 'shift'] } }).catch(() => {});
  databaseObj.shifts.createIndex({ index: { fields: ['date'] } }).catch(() => {});
  databaseObj.salesCustomers.createIndex({ index: { fields: ['id'] } }).catch(() => {});
  databaseObj.salesRecords.createIndex({ index: { fields: ['date'] } }).catch(() => {});
  databaseObj.rates.createIndex({ index: { fields: ['id'] } }).catch(() => {});
  databaseObj.ledgers.createIndex({ index: { fields: ['farmerId', 'date'] } }).catch(() => {});
  databaseObj.payments.createIndex({ index: { fields: ['farmerId'] } }).catch(() => {});
};

createIndexes(db);

export function initUserDatabases(userId: string) {
  if (!userId) userId = 'default';
  const dbId = localStorage.getItem('databaseId') || '(default)';
  const partitionedUserId = `${userId}_${dbId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  if (activeUserId === partitionedUserId) return;
  
  activeUserId = partitionedUserId;
  localStorage.setItem('last_active_userId', userId);
  
  // Close old PouchDB connections
  try {
    db.farmers.close().catch(() => {});
    db.collections.close().catch(() => {});
    db.shifts.close().catch(() => {});
    db.salesCustomers.close().catch(() => {});
    db.salesRecords.close().catch(() => {});
    db.rates.close().catch(() => {});
    db.rateSettings.close().catch(() => {});
    db.payments.close().catch(() => {});
    db.ledgers.close().catch(() => {});
    db.users.close().catch(() => {});
    db.dairies.close().catch(() => {});
    db.syncQueue.close().catch(() => {});
  } catch (e) {
    console.error("Error closing PouchDB connections", e);
  }

  // Re-initialize for the new user ID
  db.farmers = new PouchDB(`farmers_${partitionedUserId}`);
  db.collections = new PouchDB(`collections_${partitionedUserId}`);
  db.shifts = new PouchDB(`shifts_${partitionedUserId}`);
  db.salesCustomers = new PouchDB(`sales_customers_${partitionedUserId}`);
  db.salesRecords = new PouchDB(`sales_records_${partitionedUserId}`);
  db.rates = new PouchDB(`rates_${partitionedUserId}`);
  db.rateSettings = new PouchDB(`rate_settings_${partitionedUserId}`);
  db.payments = new PouchDB(`payments_${partitionedUserId}`);
  db.ledgers = new PouchDB(`ledgers_${partitionedUserId}`);
  db.users = new PouchDB(`users_${partitionedUserId}`);
  db.dairies = new PouchDB(`dairies_${partitionedUserId}`);
  db.syncQueue = new PouchDB(`sync_queue_${partitionedUserId}`);

  // Create indexes for new connections
  createIndexes(db);
}

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
  private syncFromServerInProgress: boolean = false;

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

  // Initial sync from server to local PouchDB databases
  async syncFromServer() {
    if (!this.isOnline) return;
    if (this.syncFromServerInProgress) return;
    this.syncFromServerInProgress = true;
    try {
      // 1. Sync Farmers
      try {
        const farmersRes = await api.get('/farmers');
        const farmers = farmersRes.data || [];
        const bulkFarmers = farmers.map((f: any) => ({ ...f, _id: f.id || f._id }));
        const existingFarmers = await db.farmers.allDocs();
        await Promise.all(existingFarmers.rows.map(row => db.farmers.remove(row.id, row.value.rev).catch(() => {})));
        if (bulkFarmers.length > 0) await db.farmers.bulkDocs(bulkFarmers);
      } catch (e) {
        console.error("Farmer sync failed", e);
      }
      
      // 2. Sync Collections (last 30 days)
      try {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        const collectionsRes = await api.get(`/collections/report?date=${date.toISOString()}`);
        const collections = collectionsRes.data || [];
        const bulkCollections = collections.map((c: any) => ({ ...c, _id: c.id || c._id }));
        const existingCollections = await db.collections.allDocs();
        await Promise.all(existingCollections.rows.map(row => db.collections.remove(row.id, row.value.rev).catch(() => {})));
        if (bulkCollections.length > 0) await db.collections.bulkDocs(bulkCollections);
      } catch (e) {
        console.error("Collections sync failed", e);
      }

      // 3. Sync Shifts
      try {
        const shiftsRes = await api.get('/shifts/recent?limit=30');
        const shifts = shiftsRes.data || [];
        const bulkShifts = shifts.map((s: any) => ({ ...s, _id: s.id || s._id }));
        const existingShifts = await db.shifts.allDocs();
        await Promise.all(existingShifts.rows.map(row => db.shifts.remove(row.id, row.value.rev).catch(() => {})));
        if (bulkShifts.length > 0) await db.shifts.bulkDocs(bulkShifts);
      } catch (e) {
        console.error("Shift sync failed", e);
      }

      // 4. Sync Sales Customers
      try {
        const salesCustomersRes = await api.get('/customers');
        const salesCustomers = Array.isArray(salesCustomersRes.data) ? salesCustomersRes.data : [];
        const bulkSalesCust = salesCustomers.map((sc: any) => ({ ...sc, _id: sc.id || sc._id }));
        const existingSalesCust = await db.salesCustomers.allDocs();
        await Promise.all(existingSalesCust.rows.map(row => db.salesCustomers.remove(row.id, row.value.rev).catch(() => {})));
        if (bulkSalesCust.length > 0) await db.salesCustomers.bulkDocs(bulkSalesCust);
      } catch (e) {
        console.error("Sales customers sync failed", e);
      }

      // 5. Sync Rates
      try {
        const ratesRes = await api.get('/rates');
        const rates = ratesRes.data || [];
        const bulkRates = rates.map((r: any) => ({ ...r, _id: r.id || r._id }));
        const existingRates = await db.rates.allDocs();
        await Promise.all(existingRates.rows.map(row => db.rates.remove(row.id, row.value.rev).catch(() => {})));
        if (bulkRates.length > 0) await db.rates.bulkDocs(bulkRates);
      } catch (e) {
        console.error("Rates sync failed", e);
      }

      // 6. Sync Rate Settings
      try {
        const rateSettingsRes = await api.get('/rates/settings');
        const rateSettings = rateSettingsRes.data;
        if (rateSettings) {
          try {
            const existing = await db.rateSettings.get('current');
            await db.rateSettings.put({ ...rateSettings, _id: 'current', _rev: existing._rev });
          } catch (e) {
            await db.rateSettings.put({ ...rateSettings, _id: 'current' });
          }
        }
      } catch (e) {
        console.error("Rate settings sync failed", e);
      }

      // 7. Sync Ledger
      try {
        const ledgerRes = await api.get('/ledger');
        const ledger = ledgerRes.data || [];
        const bulkLedger = ledger.map((l: any) => ({ ...l, _id: l.id || l._id }));
        const existingLedger = await db.ledgers.allDocs();
        await Promise.all(existingLedger.rows.map(row => db.ledgers.remove(row.id, row.value.rev).catch(() => {})));
        if (bulkLedger.length > 0) await db.ledgers.bulkDocs(bulkLedger);
      } catch (e) {
        console.error("Ledger sync failed", e);
      }

      // 8. Sync Users
      try {
        const usersRes = await api.get('/users');
        const users = usersRes.data || [];
        const bulkUsers = users.map((u: any) => ({ ...u, _id: u.id || u._id }));
        const existingUsers = await db.users.allDocs();
        await Promise.all(existingUsers.rows.map(row => db.users.remove(row.id, row.value.rev).catch(() => {})));
        if (bulkUsers.length > 0) await db.users.bulkDocs(bulkUsers);
      } catch (e) {
        console.error("Users sync failed", e);
      }

      // 9. Sync Dairies
      try {
        let isSuperAdmin = false;
        try {
          const profileStr = localStorage.getItem('profile');
          if (profileStr) {
            const profileVal = JSON.parse(profileStr);
            isSuperAdmin = profileVal?.role === 'super_admin';
          }
        } catch (e) {}

        if (isSuperAdmin) {
          const dairiesRes = await api.get('/dairies');
          const dairies = dairiesRes.data || [];
          const bulkDairies = dairies.map((d: any) => ({ ...d, _id: d.id || d._id }));
          const existingDairies = await db.dairies.allDocs();
          await Promise.all(existingDairies.rows.map(row => db.dairies.remove(row.id, row.value.rev).catch(() => {})));
          if (bulkDairies.length > 0) await db.dairies.bulkDocs(bulkDairies);
        }
      } catch (e) {
        console.error("Dairies sync failed", e);
      }

    } catch (error) {
      console.error('Failed to sync from server:', error);
    } finally {
      this.syncFromServerInProgress = false;
    }
  }

  // --- Offline Read/Mutation Methods ---

  // 1. Farmers
  async getFarmers(): Promise<any[]> {
    const result = await db.farmers.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc as any);
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
