import { db } from '../db';
import { Collection, Farmer, Ledger, RateSetting, SalesCustomer, SalesRecord, User } from '../db/models';
import { Q } from '@nozbe/watermelondb';

class OfflineService {
  isOnline: boolean = true;
  constructor() {}

  async syncFromServer() {
    // offline mock
  }

  async getFarmers() {
    const farmers = await db.collections.get<Farmer>('farmers').query().fetch();
    return farmers.map((f) => ({
      id: f.id,
      farmerId: f.farmerId,
      name: f.name,
      phone: f.phone,
    }));
  }

  async getFarmerById(id: string) {
    try {
      const f = await db.collections.get<Farmer>('farmers').find(id);
      return { id: f.id, farmerId: f.farmerId, name: f.name, phone: f.phone };
    } catch {
      return null;
    }
  }

  async searchFarmer(farmerId: string) {
    const farmers = await db.collections.get<Farmer>('farmers').query(Q.where('farmer_id', farmerId)).fetch();
    const f = farmers[0];
    if (f) return { id: f.id, farmerId: f.farmerId, name: f.name, phone: f.phone };
    return null;
  }

  async createFarmer(data: any) {
    return await db.write(async () => {
      return await db.collections.get<Farmer>('farmers').create((f) => {
        f.farmerId = data.farmerId;
        f.name = data.name;
        f.phone = data.phone;
      });
    });
  }

  async updateFarmer(id: string, data: any) {
    return await db.write(async () => {
      const f = await db.collections.get<Farmer>('farmers').find(id);
      return await f.update((farmer) => {
        if (data.name) farmer.name = data.name;
        if (data.phone) farmer.phone = data.phone;
        if (data.farmerId) farmer.farmerId = data.farmerId;
      });
    });
  }

  async deleteFarmer(id: string) {
    return await db.write(async () => {
      const f = await db.collections.get<Farmer>('farmers').find(id);
      return await f.markAsDeleted();
    });
  }

  async getCollectionsByDate(dateStr: string, endDate?: string) {
    const startCompare = dateStr.split('T')[0];
    let items;
    if (endDate) {
      const endCompare = endDate.split('T')[0];
      items = await db.collections.get<Collection>('collections')
        .query(Q.where('date', Q.gte(startCompare)), Q.where('date', Q.lte(endCompare))).fetch();
    } else {
      items = await db.collections.get<Collection>('collections')
        .query(Q.where('date', Q.like(`${startCompare}%`))).fetch();
    }
    return items.map((c) => ({
      id: c.id,
      farmerInternalId: c.farmerInternalId,
      date: c.date,
      shift: c.shift,
      quantity: c.quantity,
      fat: c.fat,
      snf: c.snf,
      amount: c.amount,
    }));
  }

  async createCollection(data: any) {
     return await db.write(async () => {
      return await db.collections.get<Collection>('collections').create((c) => {
        c.farmerInternalId = data.farmerInternalId || data.farmerId;
        c.date = data.date;
        c.shift = data.shift;
        c.quantity = data.quantity;
        c.fat = data.fat;
        c.snf = data.snf;
        c.amount = data.amount;
      });
     });
  }

  async getRecentShifts(limit: number = 10) {
    const cls = await db.collections.get<Collection>('collections').query(Q.sortBy('date', Q.desc), Q.take(limit)).fetch();
    return cls.map(c => ({ date: c.date, shift: c.shift }));
  }

  async getShiftSummaryOffline(dateStr: string, shift: string) {
    const dt = dateStr.split('T')[0];
    const collections = await db.collections.get<Collection>('collections')
      .query(Q.where('date', Q.like(`${dt}%`)), Q.where('shift', shift)).fetch();

    const totalQty = collections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const totalAmt = collections.reduce((sum, c) => sum + (c.amount || 0), 0);
    const avgFat = collections.length ? collections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0) / totalQty : 0;
    const avgSnf = collections.length ? collections.reduce((sum, c) => sum + (c.snf || 0) * (c.quantity || 0), 0) / totalQty : 0;

    return {
      date: dateStr,
      shift,
      totalQty,
      totalAmt,
      avgFat,
      avgSnf,
      collectionsCount: collections.length,
      collections: collections.map(c => ({
        id: c.id, farmerInternalId: c.farmerInternalId, quantity: c.quantity, fat: c.fat, snf: c.snf, amount: c.amount, date: c.date, shift: c.shift
      }))
    };
  }

  async getSalesCustomers() {
     const res = await db.collections.get<SalesCustomer>('sales_customers').query().fetch();
     return res.map(r => ({ id: r.id, name: r.name, phone: r.phone }));
  }

  async recordSaleOffline(payload: any) {
    return await db.write(async () => {
      const sale = await db.collections.get<SalesRecord>('sales_records').create((s) => {
        s.customerId = payload.customerId || '';
        s.date = new Date().toISOString();
        s.quantity = payload.quantity;
        s.amount = payload.amount;
      });
      return { id: sale.id, ...payload };
    });
  }

  async getRates() {
    return []; // Re-implemented if needed
  }

  async getRateSettings() {
    const set = await db.collections.get<RateSetting>('rate_settings').query().fetch();
    if (set.length > 0) {
      return {
        _id: 'current',
        fatMultiplier1: set[0].fatMultiplier1,
        snfMultiplier1: set[0].snfMultiplier1,
        maxFatForFormula1: set[0].maxFat,
        fatMultiplier2: set[0].fatMultiplier2,
        snfDeductions: {}
      };
    }
    return {
      _id: 'current',
      fatMultiplier1: 3.96,
      snfMultiplier1: 2.64,
      maxFatForFormula1: 6.0,
      fatMultiplier2: 7.77,
      snfDeductions: {}
    };
  }
  
  async saveRateSettings(data: any) {
    return await db.write(async () => {
       const set = await db.collections.get<RateSetting>('rate_settings').query().fetch();
       if (set.length > 0) {
          await set[0].update((s) => {
             s.fatMultiplier1 = data.fatMultiplier1;
             s.snfMultiplier1 = data.snfMultiplier1;
             s.maxFat = data.maxFatForFormula1;
             s.fatMultiplier2 = data.fatMultiplier2;
          });
       } else {
          await db.collections.get<RateSetting>('rate_settings').create((s) => {
             s.fatMultiplier1 = data.fatMultiplier1;
             s.snfMultiplier1 = data.snfMultiplier1;
             s.maxFat = data.maxFatForFormula1;
             s.fatMultiplier2 = data.fatMultiplier2;
          });
       }
    });
  }

  async getLedger() {
    const l = await db.collections.get<Ledger>('ledgers').query().fetch();
    return l.map(r => ({ id: r.id, farmerInternalId: r.farmerInternalId, date: r.date, type: r.type, amount: r.amount, description: r.description }));
  }

  async getLedgerByFarmerId(farmerInternalId: string) {
    const l = await db.collections.get<Ledger>('ledgers').query(Q.where('farmer_internal_id', farmerInternalId)).fetch();
    return l.map(r => ({ id: r.id, farmerInternalId: r.farmerInternalId, date: r.date, type: r.type, amount: r.amount, description: r.description }));
  }

  async recordPaymentOffline(payload: any) {
    return await db.write(async () => {
      const led = await db.collections.get<Ledger>('ledgers').create((l) => {
        l.farmerInternalId = payload.farmerInternalId || payload.farmerId;
        l.date = new Date().toISOString();
        l.type = 'payment';
        l.amount = payload.amount;
        l.description = payload.description || '';
      });
      return { id: led.id, ...payload };
    });
  }

  async getUsers() {
    const res = await db.collections.get<User>('users').query().fetch();
    return res.map(u => ({ id: u.id, username: u.username, role: u.role }));
  }

  async getDairies() {
    return [];
  }

  async getBillsOffline(year: number, month: number, period: number, farmerId?: string) {
    const farmers = await this.getFarmers();
    
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

    const items = await db.collections.get<Collection>('collections')
      .query(Q.where('date', Q.gte(startCompare)), Q.where('date', Q.lte(endCompare))).fetch();

    const periodCollections = items.map(c => ({
      farmerInternalId: c.farmerInternalId, 
      date: c.date, 
      quantity: c.quantity,
      fat: c.fat,
      snf: c.snf,
      amount: c.amount
    }));

    const billsMap = new Map<string, any>();

    periodCollections.forEach(c => {
      const fId = c.farmerInternalId;
      if (!fId) return;
      if (farmerId && fId !== farmerId) return;

      const farmerObj = farmers.find((f: any) => f.id === fId || f.farmerId === fId);
      const farmerName = farmerObj ? farmerObj.name : 'Unknown';
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

    return Array.from(billsMap.values()).map(b => ({
      ...b,
      averageFat: b.quantity ? b.fatSum / b.quantity : 0,
      averageSnf: b.quantity ? b.snfSum / b.quantity : 0
    }));
  }

  async getDashboardOffline() {
    const farmers = await this.getFarmers();
    
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCollectionsDocs = await db.collections.get<Collection>('collections')
        .query(Q.where('date', Q.like(`${todayStr}%`))).fetch();

    const todayCollections = todayCollectionsDocs.map(c => ({
       farmerInternalId: c.farmerInternalId, quantity: c.quantity, fat: c.fat, snf: c.snf, amount: c.amount, shift: c.shift
    }));

    const todayQty = todayCollections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const morningQty = todayCollections.filter(c => c.shift === 'Morning').reduce((sum, c) => sum + (c.quantity || 0), 0);
    const eveningQty = todayCollections.filter(c => c.shift === 'Evening').reduce((sum, c) => sum + (c.quantity || 0), 0);
    const todayAmount = todayCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
    
    const avgFat = todayQty ? todayCollections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0) / todayQty : 0;
    const avgSnf = todayQty ? todayCollections.reduce((sum, c) => sum + (c.snf || 0) * (c.quantity || 0), 0) / todayQty : 0;

    const allCollectionsDocs = await db.collections.get<Collection>('collections')
        .query(Q.sortBy('date', Q.desc), Q.take(10)).fetch();

    const recentTxns = allCollectionsDocs.map(c => {
      const farmerObj = farmers.find((f: any) => f.id === c.farmerInternalId || f.farmerId === c.farmerInternalId);
      return {
        id: c.id,
        date: c.date,
        quantity: c.quantity,
        amount: c.amount,
        farmerName: farmerObj ? farmerObj.name : 'Unknown',
        farmerId: farmerObj ? farmerObj.farmerId : ''
      };
    });

    const trendData: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const tdate = new Date();
      tdate.setDate(tdate.getDate() - i);
      const dateStr2 = tdate.toISOString().split('T')[0];
      const dateCollectionsDocs = await db.collections.get<Collection>('collections')
        .query(Q.where('date', Q.like(`${dateStr2}%`))).fetch();
        
      trendData.push({
        date: dateStr2,
        quantity: dateCollectionsDocs.reduce((sum, c) => sum + (c.quantity || 0), 0),
        amount: dateCollectionsDocs.reduce((sum, c) => sum + (c.amount || 0), 0)
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

