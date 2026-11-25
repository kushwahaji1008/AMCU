import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { isNativeApp } from './platform';
import {
  ALL_ENTITY_TABLES,
  EntityTableName,
  sqliteDb,
} from './sqliteDatabase';

/**
 * Unified local storage adapter for Capacitor Android APK backed by native SQLite
 * (`@capacitor-community/sqlite`).
 *
 * Strictly inert on standard web browsers (`!isNativeApp()`), ensuring Website users
 * remain 100% online-only without local IndexedDB/Dexie/SQLite databases.
 */

export interface RealmSchema {
  name: string;
  primaryKey?: string;
  properties: Record<string, string | object>;
}

const ENTITY_TABLE_SET = new Set<string>(ALL_ENTITY_TABLES);

export class Realm {
  public path: string;
  public schema: RealmSchema[];
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: { path: string; schema: RealmSchema[] }) {
    this.path = config.path;
    this.schema = config.schema;
  }

  public triggerSaveBackup() {
    if (!isNativeApp()) return;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveBackupToFilesystem().catch((err) => {
        console.error('[Filesystem Sync] Auto-save failed:', err);
      });
    }, 1000);
  }

  async saveBackupToFilesystem(): Promise<void> {
    if (!sqliteDb.isEnabled()) {
      console.log('[Web Mode] Local offline database backups are disabled in browser mode.');
      return;
    }

    try {
      const backupData = await sqliteDb.exportAllData();
      const jsonString = JSON.stringify(backupData, null, 2);

      if (isNativeApp()) {
        try {
          await Filesystem.writeFile({
            path: 'database_backup_internal.json',
            data: jsonString,
            directory: Directory.Data,
            encoding: Encoding.UTF8,
            recursive: true,
          });
        } catch (err) {
          console.error('[Filesystem Sync] Directory.Data backup failed:', err);
        }

        try {
          await Filesystem.writeFile({
            path: 'DugdhaSetu_AMCU/Backups/database_backup.json',
            data: jsonString,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
            recursive: true,
          });

          if (backupData.collections?.length) {
            await Filesystem.writeFile({
              path: 'DugdhaSetu_AMCU/Reports/collections_record.csv',
              data: this.generateCollectionsCsv(backupData.collections),
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
              recursive: true,
            });
          }

          if (backupData.farmers?.length) {
            await Filesystem.writeFile({
              path: 'DugdhaSetu_AMCU/Reports/farmers_register.csv',
              data: this.generateFarmersCsv(backupData.farmers),
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
              recursive: true,
            });
          }

          if (backupData.payments?.length) {
            await Filesystem.writeFile({
              path: 'DugdhaSetu_AMCU/Reports/payments_ledger.csv',
              data: this.generatePaymentsCsv(backupData.payments),
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
              recursive: true,
            });
          }
        } catch (err) {
          console.warn('[Filesystem Sync] Directory.Documents write skipped:', err);
        }
      }
    } catch (e) {
      console.error('[Filesystem Sync] Failed to write database backup:', e);
      throw e;
    }
  }

  async loadBackupFromFilesystem(): Promise<boolean> {
    if (!isNativeApp() || !sqliteDb.isEnabled()) return false;

    try {
      let backupContent: string | null = null;

      for (const candidate of [
        { path: 'database_backup_internal.json', directory: Directory.Data },
        { path: 'DugdhaSetu_AMCU/Backups/database_backup.json', directory: Directory.Documents },
        { path: 'milkflow_amcu_db_backup.json', directory: Directory.Documents },
      ]) {
        try {
          const file = await Filesystem.readFile({
            path: candidate.path,
            directory: candidate.directory,
            encoding: Encoding.UTF8,
          });
          if (file?.data) {
            backupContent = typeof file.data === 'string' ? file.data : JSON.stringify(file.data);
            break;
          }
        } catch {
          // Try next backup path
        }
      }

      if (backupContent) {
        return await this.restoreBackupFromJSON(backupContent);
      }
    } catch (e) {
      console.error('[Filesystem Sync] Failed to restore database from filesystem:', e);
    }
    return false;
  }

  async restoreBackupFromJSON(jsonString: string): Promise<boolean> {
    if (!sqliteDb.isEnabled()) return false;
    try {
      const backupData = JSON.parse(jsonString);
      if (backupData && typeof backupData === 'object') {
        await sqliteDb.importBackupData(backupData);
        return true;
      }
      return false;
    } catch (e) {
      console.error('[SQLite Restore] Failed to restore JSON backup:', e);
      throw e;
    }
  }

  private generateCollectionsCsv(items: any[]): string {
    const headers = [
      'Date',
      'Shift',
      'Farmer Code',
      'Farmer Name',
      'Milk Type',
      'Quantity (Ltr)',
      'FAT (%)',
      'SNF (%)',
      'CLR',
      'Rate (Rs/Ltr)',
      'Total Amount (Rs)',
      'Timestamp',
    ];
    const rows = items.map((c) => [
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
      c.timestamp ? new Date(c.timestamp).toLocaleString() : '',
    ]);
    return [
      headers.join(','),
      ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(',')),
    ].join('\n');
  }

  private generateFarmersCsv(items: any[]): string {
    const headers = [
      'Farmer Code',
      'Farmer Name',
      'Mobile Number',
      'Village',
      'Cattle Type',
      'Outstanding Balance (Rs)',
      'Status',
    ];
    const rows = items.map((f) => [
      f.farmerCode || f.farmerId || '',
      f.name || '',
      f.mobile || '',
      f.village || '',
      f.cattleType || '',
      f.balance || 0,
      f.status || '',
    ]);
    return [
      headers.join(','),
      ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(',')),
    ].join('\n');
  }

  private generatePaymentsCsv(items: any[]): string {
    const headers = ['Date', 'Farmer ID', 'Farmer Name', 'Paid Amount (Rs)', 'Payment Method', 'Status', 'Reference'];
    const rows = items.map((p) => [
      p.date || '',
      p.farmerId || '',
      p.farmerName || '',
      p.amount || 0,
      p.method || '',
      p.status || '',
      p.reference || '',
    ]);
    return [
      headers.join(','),
      ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(',')),
    ].join('\n');
  }

  async objects<T = any>(name: string): Promise<T[]> {
    if (!sqliteDb.isEnabled()) return [];
    if (name === 'sync_queue') {
      return (await sqliteDb.getAllSyncTasks()) as unknown as T[];
    }
    if (ENTITY_TABLE_SET.has(name)) {
      return await sqliteDb.getAllEntities<T>(name as EntityTableName);
    }
    return [];
  }

  async objectForPrimaryKey<T = any>(name: string, key: any): Promise<T | null> {
    if (!sqliteDb.isEnabled() || !key) return null;
    if (ENTITY_TABLE_SET.has(name)) {
      return await sqliteDb.getEntityById<T>(name as EntityTableName, String(key));
    }
    return null;
  }

  async create<T = any>(
    name: string,
    properties: any,
    _updateMode: 'never' | 'all' | 'modified' = 'all'
  ): Promise<T> {
    if (!sqliteDb.isEnabled()) return properties as T;
    if (name === 'sync_queue') {
      const id = String(properties.id || properties._id || '');
      const task = await sqliteDb.enqueueSyncTask({
        id,
        type: properties.type,
        entityType: properties.entityType,
        entityId: properties.entityId,
        payload: properties.payload,
        idempotencyKey: properties.idempotencyKey || id,
        baseVersion: properties.baseVersion,
        status: properties.status || 'pending',
        retryCount: properties.retryCount || 0,
        nextRetryAt: properties.nextRetryAt || 0,
        createdAt: properties.timestamp || properties.createdAt || Date.now(),
      });
      this.triggerSaveBackup();
      return task as unknown as T;
    }

    if (ENTITY_TABLE_SET.has(name)) {
      const syncStatus = properties._syncStatus || 'synced';
      const saved = await sqliteDb.upsertEntity<T>(name as EntityTableName, properties, syncStatus);
      this.triggerSaveBackup();
      return saved;
    }

    return properties as T;
  }

  async delete(name: string, objectOrKey: any): Promise<void> {
    if (!sqliteDb.isEnabled()) return;
    const keyVal = typeof objectOrKey === 'object' && objectOrKey !== null
      ? objectOrKey.id || objectOrKey._id
      : objectOrKey;
    if (!keyVal) return;

    if (name === 'sync_queue') {
      await sqliteDb.removeSyncTask(String(keyVal));
    } else if (ENTITY_TABLE_SET.has(name)) {
      await sqliteDb.deleteEntity(name as EntityTableName, String(keyVal));
    }
    this.triggerSaveBackup();
  }

  async write<T = any>(callback: () => Promise<T> | T): Promise<T> {
    if (!sqliteDb.isEnabled()) {
      return await callback();
    }
    const result = await callback();
    this.triggerSaveBackup();
    return result;
  }

  async find<T = any>(name: string, predicate: (item: T) => boolean): Promise<T[]> {
    if (!sqliteDb.isEnabled()) return [];
    const all = await this.objects<T>(name);
    return all.filter(predicate);
  }
}

export const schemas: RealmSchema[] = [
  { name: 'farmers', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'collections', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'shifts', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'sales_customers', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'sales_records', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'customer_payments', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'rates', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'rate_settings', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'payments', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'ledgers', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'users', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'dairies', primaryKey: 'id', properties: { id: 'string' } },
  { name: 'sync_queue', primaryKey: 'id', properties: { id: 'string' } },
];

export const realmInstance = new Realm({
  path: 'dugdhasetu_amcu_sqlite',
  schema: schemas,
});
