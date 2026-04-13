import Dexie, { Table } from 'dexie';
import { Farmer, CollectionTransaction, RateChart, RateSettings, LedgerEntry, Payment } from '../types';

export interface SyncQueueItem {
  id?: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'FARMER' | 'COLLECTION' | 'PAYMENT' | 'RATE_CHART' | 'RATE_SETTINGS';
  data: any;
  timestamp: number;
  status: 'PENDING' | 'FAILED';
  error?: string;
}

export class DugdhaSetuDB extends Dexie {
  farmers!: Table<Farmer, string>;
  collections!: Table<CollectionTransaction, string>;
  rateCharts!: Table<RateChart, string>;
  rateSettings!: Table<RateSettings, string>;
  ledger!: Table<LedgerEntry, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('DugdhaSetuDB');
    
    // Define tables and indexes
    this.version(1).stores({
      farmers: 'id, farmerId, name, mobile, dairyId',
      collections: 'id, farmerId, date, shift, dairyId',
      rateCharts: 'id, milkType, dairyId',
      rateSettings: 'id, dairyId',
      ledger: 'id, farmerId, date, dairyId',
      syncQueue: '++id, action, entity, status, timestamp'
    });
  }
}

export const db = new DugdhaSetuDB();
