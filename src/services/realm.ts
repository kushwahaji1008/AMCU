import Dexie, { type Table } from 'dexie';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

/**
 * Realm Database Emulator & Engine for Web and Mobile platforms.
 * Adheres to standard Realm schemas, transactions, and object query patterns,
 * using IndexedDB (via Dexie) as the high-capacity, robust offline storage backend.
 */

export interface RealmSchema {
  name: string;
  primaryKey?: string;
  properties: Record<string, string | object>;
}

export class Realm {
  private dexieDb: Dexie;
  public path: string;
  public schema: RealmSchema[];
  private initPromise: Promise<void> | null = null;
  private saveTimeout: any = null;

  constructor(config: { path: string; schema: RealmSchema[] }) {
    this.path = config.path;
    this.schema = config.schema;

    // Create a unique DB name for this path
    this.dexieDb = new Dexie(`Realm_${config.path}`);

    // Map Realm schemas to Dexie store definitions
    const stores: Record<string, string> = {};
    config.schema.forEach((s) => {
      const primaryKey = s.primaryKey || 'id';
      
      // Dexie index specification: "primaryKey, index1, index2"
      // We index standard searchable fields for performance
      let storeDef = primaryKey;
      if (s.name === 'farmers') {
        storeDef += ', farmerId';
      } else if (s.name === 'collections') {
        storeDef += ', date, shift, farmerInternalId, farmerId';
      } else if (s.name === 'shifts') {
        storeDef += ', date';
      } else if (s.name === 'sales_customers') {
        storeDef += ', id';
      } else if (s.name === 'sales_records') {
        storeDef += ', date, customerId';
      } else if (s.name === 'rates') {
        storeDef += ', id';
      } else if (s.name === 'ledgers') {
        storeDef += ', farmerInternalId, date';
      } else if (s.name === 'payments') {
        storeDef += ', farmerInternalId, date';
      } else if (s.name === 'users') {
        storeDef += ', username';
      }
      
      stores[s.name] = storeDef;
    });

    this.dexieDb.version(1).stores(stores);

    // Load initial backup from device storage files if on a native platform
    if (Capacitor.isNativePlatform()) {
      this.initPromise = this.loadBackupFromFilesystem()
        .then(() => {
          console.log('[Realm Sync] Backup loaded successfully.');
        })
        .catch((err) => {
          console.error('[Realm Sync] Failed to load backup on start:', err);
        });
    }
  }

  // Triggered after create, delete, change
  public triggerSaveBackup() {
    if (!Capacitor.isNativePlatform()) return;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveBackupToFilesystem().catch((err) => {
        console.error('[Filesystem Sync] Auto-save failed:', err);
      });
    }, 500);
  }

  // Backup all tables in dexieDb to capacitor filesystem or web file download
  async saveBackupToFilesystem(): Promise<void> {
    try {
      const backupData: Record<string, any[]> = {};
      for (const s of this.schema) {
        const table = this.dexieDb.table(s.name);
        if (table) {
          const items = await table.toArray();
          backupData[s.name] = items;
        }
      }
      
      const jsonString = JSON.stringify(backupData, null, 2);
      
      if (Capacitor.isNativePlatform()) {
        // 1. ALWAYS write to permissionless Directory.Data first as our absolute reliable storage
        try {
          await Filesystem.writeFile({
            path: 'database_backup_internal.json',
            data: jsonString,
            directory: Directory.Data,
            encoding: Encoding.UTF8,
            recursive: true
          });
          console.log('[Filesystem Sync] Saved internal database backup in secure Directory.Data');
        } catch (err) {
          console.error('[Filesystem Sync] App private directory write failed (unlikely layout issue):', err);
        }

        // 2. Try writing to public Directory.Documents for user visibility and backups.
        // We wrap this entire block in try-catch because Scoped Storage can throw a permission exception.
        try {
          // Save primary JSON database backup (for app-level restoration)
          await Filesystem.writeFile({
            path: 'DugdhaSetu_AMCU/Backups/database_backup.json',
            data: jsonString,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
            recursive: true
          });
          console.log('[Filesystem Sync] Successfully backed up database JSON to DugdhaSetu_AMCU/Backups/database_backup.json');

          // Create human-readable, office-ready CSV reports on local phone storage like WhatsApp export files
          if (backupData.collections && backupData.collections.length > 0) {
            const collectionsCsv = this.generateCollectionsCsv(backupData.collections);
            await Filesystem.writeFile({
              path: 'DugdhaSetu_AMCU/Reports/collections_record.csv',
              data: collectionsCsv,
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
              recursive: true
            });
          }

          if (backupData.farmers && backupData.farmers.length > 0) {
            const farmersCsv = this.generateFarmersCsv(backupData.farmers);
            await Filesystem.writeFile({
              path: 'DugdhaSetu_AMCU/Reports/farmers_register.csv',
              data: farmersCsv,
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
              recursive: true
            });
          }

          if (backupData.payments && backupData.payments.length > 0) {
            const paymentsCsv = this.generatePaymentsCsv(backupData.payments);
            await Filesystem.writeFile({
              path: 'DugdhaSetu_AMCU/Reports/payments_ledger.csv',
              data: paymentsCsv,
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
              recursive: true
            });
          }

          console.log('[Filesystem Export] Updated live human-readable CSV documents on phone storage');
        } catch (err) {
          console.warn('[Filesystem Sync] Directory.Documents write skipped (this is common on Android 10+ if permissions are not granted):', err);
        }
      } else {
        // Web context fallback: trigger direct json download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DugdhaSetu_AMCU_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[Web Export] Triggered backup file download in browser');
      }
    } catch (e) {
      console.error('[Filesystem Sync] Failed to write database backup:', e);
      throw e;
    }
  }

  // Dual Fallback: Restore all tables from capacitor filesystem back to dexieDb
  async loadBackupFromFilesystem(): Promise<boolean> {
    try {
      if (!Capacitor.isNativePlatform()) return false;
      
      let backupContent: string | null = null;
      let pathUsed = '';

      // 1. Try reading the private, permissionless Directory.Data backup file first (highly reliable)
      try {
        console.log('[Filesystem Sync] Checking internal Directory.Data database backup file...');
        const file = await Filesystem.readFile({
          path: 'database_backup_internal.json',
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        if (file && file.data) {
          backupContent = typeof file.data === 'string' ? file.data : JSON.stringify(file.data);
          pathUsed = 'database_backup_internal.json (Directory.Data)';
          console.log('[Filesystem Sync] Successfully retrieved backup from Directory.Data');
        }
      } catch (e) {
        console.log('[Filesystem Sync] No internal backup found in Directory.Data, checking Documents directory...');
      }

      // 2. Try reading the organized WhatsApp-style file in Documents
      if (!backupContent) {
        try {
          console.log('[Filesystem Sync] Checking organized device backup file in Documents...');
          const file = await Filesystem.readFile({
            path: 'DugdhaSetu_AMCU/Backups/database_backup.json',
            directory: Directory.Documents,
            encoding: Encoding.UTF8
          });
          if (file && file.data) {
            backupContent = typeof file.data === 'string' ? file.data : JSON.stringify(file.data);
            pathUsed = 'DugdhaSetu_AMCU/Backups/database_backup.json';
            console.log('[Filesystem Sync] Retrieved backup from Documents');
          }
        } catch (e) {
          console.log('[Filesystem Sync] No organized backup found in Documents.');
        }
      }

      // 3. Fallback to old legacy root path in Documents if organized path is empty
      if (!backupContent) {
        try {
          const file = await Filesystem.readFile({
            path: 'milkflow_amcu_db_backup.json',
            directory: Directory.Documents,
            encoding: Encoding.UTF8
          });
          if (file && file.data) {
            backupContent = typeof file.data === 'string' ? file.data : JSON.stringify(file.data);
            pathUsed = 'milkflow_amcu_db_backup.json';
            console.log('[Filesystem Sync] Retrieved legacy backup from Documents');
          }
        } catch (e) {
          console.log('[Filesystem Sync] Legacy root database backup not found.');
        }
      }

      // If backup is loaded, parse and apply transactions
      if (backupContent) {
        return await this.restoreBackupFromJSON(backupContent);
      }
    } catch (e) {
      console.error('[Filesystem Sync] Failed to restore database from filesystem:', e);
    }
    return false;
  }

  // Restore raw JSON content directly into Dexie tables
  async restoreBackupFromJSON(jsonString: string): Promise<boolean> {
    try {
      const backupData = JSON.parse(jsonString);
      if (backupData && typeof backupData === 'object') {
        const tableNames = this.schema.map((s) => s.name);
        await this.dexieDb.transaction('rw', tableNames, async () => {
          for (const tableName of Object.keys(backupData)) {
            const table = this.dexieDb.table(tableName);
            if (table) {
              await table.clear();
              if (Array.isArray(backupData[tableName]) && backupData[tableName].length > 0) {
                await table.bulkAdd(backupData[tableName]);
              }
            }
          }
        });
        console.log('[Realm Sync] Successfully restored tables from database backup JSON data.');
        return true;
      }
      return false;
    } catch (e) {
      console.error('[Realm Sync] Failed to parse and restore database backup JSON:', e);
      throw e;
    }
  }

  // Generate Excel/WPS compatible CSV sheets of milk collections
  private generateCollectionsCsv(items: any[]): string {
    const headers = ['Date', 'Shift', 'Farmer Code', 'Farmer Name', 'Milk Type', 'Quantity (Ltr)', 'FAT (%)', 'SNF (%)', 'CLR', 'Rate (Rs/Ltr)', 'Total Amount (Rs)', 'Timestamp'];
    const rows = items.map(c => [
      c.date || '',
      c.shift || '',
      c.farmerCode || c.farmerId || '',
      c.farmerName || '',
      c.milkType || '',
      c.quantity || 0,
      c.fat || 0,
      c.snf || 0,
      c.clr || 0,
      c.rate || 0,
      c.amount || 0,
      c.timestamp ? new Date(c.timestamp).toLocaleString() : ''
    ]);
    return [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(','))].join('\n');
  }

  // Generate Excel/WPS compatible CSV sheets of farmers register
  private generateFarmersCsv(items: any[]): string {
    const headers = ['Farmer Code', 'Farmer Name', 'Mobile Number', 'Village', 'Cattle Type', 'Outstanding Balance (Rs)', 'Status'];
    const rows = items.map(f => [
      f.farmerCode || f.farmerId || '',
      f.name || '',
      f.mobile || '',
      f.village || '',
      f.cattleType || '',
      f.balance || 0,
      f.status || ''
    ]);
    return [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(','))].join('\n');
  }

  // Generate Excel/WPS compatible CSV sheets of payments disbursements
  private generatePaymentsCsv(items: any[]): string {
    const headers = ['Date', 'Farmer ID', 'Farmer Name', 'Paid Amount (Rs)', 'Payment Method', 'Status', 'Reference'];
    const rows = items.map(p => [
      p.date || '',
      p.farmerId || '',
      p.farmerName || '',
      p.amount || 0,
      p.method || '',
      p.status || '',
      p.reference || ''
    ]);
    return [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(','))].join('\n');
  }

  // Ensure database initialization is complete before performing query/mutation
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  // Get indexable DEXIE table
  private getTable(name: string): Table<any, any> {
    const table = this.dexieDb.table(name);
    if (!table) {
      throw new Error(`Realm Table for schema "${name}" is not registered.`);
    }
    return table;
  }

  /**
   * Realm objects() method
   */
  async objects<T = any>(name: string): Promise<T[]> {
    await this.ensureInitialized();
    const table = this.getTable(name);
    return (await table.toArray()) as T[];
  }

  /**
   * Realm objectForPrimaryKey() method
   */
  async objectForPrimaryKey<T = any>(name: string, key: any): Promise<T | null> {
    await this.ensureInitialized();
    const table = this.getTable(name);
    const item = await table.get(key);
    return item || null;
  }

  /**
   * Realm create() method
   */
  async create<T = any>(
    name: string,
    properties: any,
    updateMode: 'never' | 'all' | 'modified' = 'all'
  ): Promise<T> {
    await this.ensureInitialized();
    const table = this.getTable(name);
    const schemaDef = this.schema.find((s) => s.name === name);
    const primaryKey = schemaDef?.primaryKey || 'id';
    const keyVal = properties[primaryKey];

    if (!keyVal) {
      throw new Error(`Primary key "${primaryKey}" must be specified for schema "${name}".`);
    }

    if (updateMode === 'all' || updateMode === 'modified') {
      await table.put(properties);
    } else {
      await table.add(properties);
    }
    
    this.triggerSaveBackup();
    return properties as T;
  }

  /**
   * Realm delete() method
   */
  async delete(name: string, objectOrKey: any): Promise<void> {
    await this.ensureInitialized();
    const table = this.getTable(name);
    const schemaDef = this.schema.find((s) => s.name === name);
    const primaryKey = schemaDef?.primaryKey || 'id';

    if (typeof objectOrKey === 'object' && objectOrKey !== null) {
      const keyVal = objectOrKey[primaryKey];
      if (keyVal) {
        await table.delete(keyVal);
      }
    } else {
      await table.delete(objectOrKey);
    }
    
    this.triggerSaveBackup();
  }

  /**
   * Realm transaction write wrapper
   */
  async write<T = any>(callback: () => Promise<T> | T): Promise<T> {
    await this.ensureInitialized();
    const tableNames = this.schema.map((s) => s.name);
    const result = await this.dexieDb.transaction('rw', tableNames, async () => {
      return await callback();
    });
    this.triggerSaveBackup();
    return result;
  }

  /**
   * Query matching Realm's simple query system
   */
  async find<T = any>(name: string, predicate: (item: T) => boolean): Promise<T[]> {
    await this.ensureInitialized();
    const all = await this.objects<T>(name);
    return all.filter(predicate);
  }
}

// Realm schema specifications for MilkFlow AMCU entities
export const schemas: RealmSchema[] = [
  {
    name: 'farmers',
    primaryKey: 'id',
    properties: {
      id: 'string',
      farmerId: 'string',
      farmerCode: 'string?',
      name: 'string',
      mobile: 'string',
      village: 'string',
      cattleType: 'string',
      bankAccount: 'string?',
      ifsc: 'string?',
      status: 'string',
      createdAt: 'string',
      balance: 'double',
      dairyId: 'string'
    }
  },
  {
    name: 'collections',
    primaryKey: 'id',
    properties: {
      id: 'string',
      timestamp: 'string',
      date: 'string',
      shift: 'string',
      farmerInternalId: 'string',
      farmerId: 'string',
      farmerCode: 'string?',
      farmerName: 'string',
      milkType: 'string',
      quantity: 'double',
      fat: 'double',
      snf: 'double',
      clr: 'double',
      rate: 'double',
      amount: 'double',
      operatorId: 'string',
      dairyId: 'string',
      isManual: 'bool?',
      isApproved: 'bool?',
      approvedBy: 'string?',
      approvedAt: 'string?'
    }
  },
  {
    name: 'shifts',
    primaryKey: 'id',
    properties: {
      id: 'string',
      date: 'string',
      shift: 'string',
      totalFarmers: 'int',
      totalQuantity: 'double',
      avgFat: 'double',
      avgSnf: 'double',
      amount: 'double',
      closedAt: 'string',
      closedBy: 'string',
      dairyId: 'string'
    }
  },
  {
    name: 'sales_customers',
    primaryKey: 'id',
    properties: {
      id: 'string',
      name: 'string',
      phone: 'string',
      email: 'string?',
      status: 'string',
      createdAt: 'string'
    }
  },
  {
    name: 'sales_records',
    primaryKey: 'id',
    properties: {
      id: 'string',
      customerId: 'string',
      customerName: 'string',
      quantity: 'double',
      milkType: 'string',
      rate: 'double',
      amount: 'double',
      date: 'string',
      shift: 'string',
      operatorId: 'string'
    }
  },
  {
    name: 'rates',
    primaryKey: 'id',
    properties: {
      id: 'string',
      effectiveFrom: 'string',
      milkType: 'string',
      baseRate: 'double',
      fatStandard: 'double',
      snfStandard: 'double',
      fatStep: 'double',
      snfStep: 'double',
      dairyId: 'string',
      fat: 'double?',
      snf: 'double?',
      rate: 'double?',
      fatMin: 'double?',
      fatMax: 'double?',
      snfMin: 'double?',
      snfMax: 'double?'
    }
  },
  {
    name: 'rate_settings',
    primaryKey: 'id',
    properties: {
      id: 'string',
      fatMultiplier1: 'double',
      snfMultiplier1: 'double',
      fatMultiplier2: 'double',
      snfDeductions: 'object',
      minFatForFormula1: 'double',
      maxFatForFormula1: 'double',
      dairyId: 'string?'
    }
  },
  {
    name: 'payments',
    primaryKey: 'id',
    properties: {
      id: 'string',
      farmerInternalId: 'string',
      farmerId: 'string',
      farmerName: 'string',
      amount: 'double',
      method: 'string',
      reference: 'string?',
      date: 'string',
      timestamp: 'string',
      operatorId: 'string',
      status: 'string',
      dairyId: 'string'
    }
  },
  {
    name: 'ledgers',
    primaryKey: 'id',
    properties: {
      id: 'string',
      farmerInternalId: 'string',
      farmerId: 'string',
      type: 'string',
      amount: 'double',
      description: 'string',
      referenceId: 'string',
      date: 'string',
      balanceAfter: 'double',
      dairyId: 'string',
      method: 'string?',
      reference: 'string?',
      operatorId: 'string?'
    }
  },
  {
    name: 'users',
    primaryKey: 'id',
    properties: {
      id: 'string',
      username: 'string',
      email: 'string',
      role: 'string',
      status: 'string',
      dairyId: 'string',
      databaseId: 'string?',
      createdAt: 'string'
    }
  },
  {
    name: 'dairies',
    primaryKey: 'id',
    properties: {
      id: 'string',
      name: 'string',
      location: 'string',
      contact: 'string',
      scaleModel: 'string?',
      pricingFormula: 'string?',
      status: 'string',
      createdAt: 'string'
    }
  },
  {
    name: 'sync_queue',
    primaryKey: 'id',
    properties: {
      id: 'string',
      type: 'string',
      payload: 'object',
      timestamp: 'int'
    }
  }
];

// Initialize global Realm database instance for the app
export const realmInstance = new Realm({
  path: 'milkflow_amcu_db',
  schema: schemas
});
