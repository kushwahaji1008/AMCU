import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
  capSQLiteVersionUpgrade,
} from '@capacitor-community/sqlite';
import { isNativeApp } from './platform';

export const SQLITE_DB_NAME = 'dugdhasetu_amcu';
export const SQLITE_DB_VERSION = 2;

export type EntityTableName =
  | 'farmers'
  | 'collections'
  | 'shifts'
  | 'sales_customers'
  | 'sales_records'
  | 'customer_payments'
  | 'rates'
  | 'rate_settings'
  | 'payments'
  | 'ledgers'
  | 'users'
  | 'dairies';

export type LocalSyncStatus = 'synced' | 'pending' | 'failed' | 'conflict';

export interface SQLiteDriverAdapter {
  execute(statements: string, transaction?: boolean): Promise<any>;
  query(statement: string, values?: any[]): Promise<{ values?: any[] }>;
  run(statement: string, values?: any[], transaction?: boolean): Promise<any>;
  beginTransaction(): Promise<any>;
  commitTransaction(): Promise<any>;
  rollbackTransaction(): Promise<any>;
  close?(): Promise<void>;
}

export interface PersistedSyncTask {
  id: string;
  type: string;
  entityType?: string;
  entityId?: string;
  payload: any;
  idempotencyKey: string;
  baseVersion?: number;
  status: 'pending' | 'in_progress' | 'failed' | 'conflict';
  retryCount: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LocalSyncConflict {
  id: string;
  serverConflictId?: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  localPayload: any;
  serverPayload?: any;
  localVersion?: number;
  serverVersion?: number;
  reason: string;
  status: 'unresolved' | 'resolved_keep_server' | 'resolved_apply_local' | 'resolved_merged';
  queueTaskId?: string;
  createdAt: number;
  resolvedAt?: number;
}

export type SmsDeliveryStatus = 'queued' | 'submitted' | 'sent' | 'delivered' | 'failed' | 'simulated';

export interface PersistedSmsRecord {
  id: string;
  idempotencyKey: string;
  recipientType: 'farmer' | 'customer' | 'other';
  recipientId?: string;
  recipientName?: string;
  phone: string;
  message: string;
  triggerType: string;
  deliveryChannel: 'native_sim' | 'server_gateway' | 'server_simulated';
  status: SmsDeliveryStatus;
  attempts: number;
  nextRetryAt: number;
  simSlot?: number;
  providerMessageId?: string;
  errorMessage?: string;
  syncedToServer: boolean;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  deliveredAt?: number;
}

export interface PersistedAuditOutboxEntry {
  logId: string;
  action: string;
  targetId?: string;
  targetType?: string;
  beforeValue?: any;
  afterValue?: any;
  details?: any;
  operationStatus: 'success' | 'failure' | 'conflict' | 'queued';
  errorDetails?: string;
  syncStatus: 'online' | 'queued_offline' | 'synced_from_offline' | 'failed';
  correlationId?: string;
  appVersion?: string;
  createdAt: number;
  synced: boolean;
  retryCount: number;
}

export interface SQLiteDiagnosticsStats {
  initialized: boolean;
  schemaVersion: number;
  counts: Record<EntityTableName, number>;
  pendingSyncCount: number;
  failedSyncCount: number;
  conflictCount: number;
  queuedSmsCount: number;
  sentSmsCount: number;
  failedSmsCount: number;
  pendingAuditCount: number;
}

export const ALL_ENTITY_TABLES: EntityTableName[] = [
  'farmers',
  'collections',
  'shifts',
  'sales_customers',
  'sales_records',
  'customer_payments',
  'rates',
  'rate_settings',
  'payments',
  'ledgers',
  'users',
  'dairies',
];

const SCHEMA_V1_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS farmers (
    id TEXT PRIMARY KEY,
    farmer_id TEXT,
    farmer_code TEXT,
    name TEXT,
    mobile TEXT,
    balance REAL DEFAULT 0,
    version INTEGER DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    date TEXT,
    shift TEXT,
    farmer_internal_id TEXT,
    farmer_id TEXT,
    amount REAL DEFAULT 0,
    version INTEGER DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    date TEXT,
    shift TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sales_customers (
    id TEXT PRIMARY KEY,
    name TEXT,
    mobile TEXT,
    balance REAL DEFAULT 0,
    version INTEGER DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sales_records (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    date TEXT,
    amount REAL DEFAULT 0,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS customer_payments (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    date TEXT,
    amount REAL DEFAULT 0,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS rates (
    id TEXT PRIMARY KEY,
    milk_type TEXT,
    version INTEGER DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS rate_settings (
    id TEXT PRIMARY KEY,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    farmer_internal_id TEXT,
    date TEXT,
    amount REAL DEFAULT 0,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS ledgers (
    id TEXT PRIMARY KEY,
    farmer_internal_id TEXT,
    date TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    role TEXT,
    database_id TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS dairies (
    id TEXT PRIMARY KEY,
    database_id TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    updated_at TEXT,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    payload TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    base_version INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
];

const SCHEMA_V2_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY,
    server_conflict_id TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    local_payload TEXT NOT NULL,
    server_payload TEXT,
    local_version INTEGER,
    server_version INTEGER,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unresolved',
    queue_task_id TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS sms_queue (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    recipient_type TEXT NOT NULL,
    recipient_id TEXT,
    recipient_name TEXT,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    delivery_channel TEXT NOT NULL DEFAULT 'native_sim',
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_retry_at INTEGER NOT NULL DEFAULT 0,
    sim_slot INTEGER,
    provider_message_id TEXT,
    error_message TEXT,
    synced_to_server INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    sent_at INTEGER,
    delivered_at INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS audit_outbox (
    log_id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    target_id TEXT,
    target_type TEXT,
    before_value TEXT,
    after_value TEXT,
    details TEXT,
    operation_status TEXT NOT NULL DEFAULT 'success',
    error_details TEXT,
    sync_status TEXT NOT NULL DEFAULT 'queued_offline',
    correlation_id TEXT,
    app_version TEXT,
    created_at INTEGER NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS kv_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_farmers_code ON farmers(farmer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(date);`,
  `CREATE INDEX IF NOT EXISTS idx_collections_farmer ON collections(farmer_internal_id);`,
  `CREATE INDEX IF NOT EXISTS idx_ledgers_farmer ON ledgers(farmer_internal_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales_records(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_sms_queue_status ON sms_queue(status, next_retry_at);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_outbox_synced ON audit_outbox(synced, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_conflicts_status ON sync_conflicts(status, created_at);`,
];

export const SQLITE_MIGRATIONS: capSQLiteVersionUpgrade[] = [
  { toVersion: 1, statements: SCHEMA_V1_STATEMENTS },
  { toVersion: 2, statements: SCHEMA_V2_STATEMENTS },
];

function safeJsonParse<T>(raw: any, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class SqliteDatabaseService {
  private sqliteConn: SQLiteConnection | null = null;
  private db: SQLiteDriverAdapter | null = null;
  private initPromise: Promise<boolean> | null = null;
  private txMutex: Promise<void> = Promise.resolve();
  private testAdapter: SQLiteDriverAdapter | null = null;

  public isEnabled(): boolean {
    return isNativeApp() || this.testAdapter !== null;
  }

  /**
   * Used strictly in automated unit/integration tests to wire a deterministic
   * SQLite driver adapter without altering production Web vs Native runtime checks.
   */
  public setTestDriver(adapter: SQLiteDriverAdapter | null): void {
    this.testAdapter = adapter;
    this.db = null;
    this.initPromise = null;
  }

  public async init(): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }
    if (this.db) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (this.testAdapter) {
          this.db = this.testAdapter;
          await this.ensureSchemaStatements();
          return true;
        }

        const sqlite = new SQLiteConnection(CapacitorSQLite);
        this.sqliteConn = sqlite;

        const consistency = await sqlite.checkConnectionsConsistency().catch(() => ({ result: false }));
        const isConn = await sqlite.isConnection(SQLITE_DB_NAME, false).catch(() => ({ result: false }));

        if (!isConn.result) {
          await sqlite.addUpgradeStatement(SQLITE_DB_NAME, SQLITE_MIGRATIONS);
        }

        const nativeDb: SQLiteDBConnection =
          consistency.result && isConn.result
            ? await sqlite.retrieveConnection(SQLITE_DB_NAME, false)
            : await sqlite.createConnection(SQLITE_DB_NAME, false, 'no-encryption', SQLITE_DB_VERSION, false);

        const isOpen = await nativeDb.isDBOpen().catch(() => ({ result: false }));
        if (!isOpen.result) {
          await nativeDb.open();
        }

        this.db = nativeDb;
        await this.ensureSchemaStatements();
        await this.migrateFromLegacyDexieIfNeeded();
        return true;
      } catch (err) {
        this.initPromise = null;
        console.error('[SQLite] Initialization failed:', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  private async ensureSchemaStatements(): Promise<void> {
    if (!this.db) return;
    await this.db.execute([...SCHEMA_V1_STATEMENTS, ...SCHEMA_V2_STATEMENTS].join('\n'), false);
    await this.db.run(
      `INSERT OR REPLACE INTO kv_metadata (key, value, updated_at) VALUES (?, ?, ?)`,
      ['schema_version', String(SQLITE_DB_VERSION), Date.now()],
      false
    );
  }

  private async ensureDb(): Promise<SQLiteDriverAdapter> {
    const ok = await this.init();
    if (!ok || !this.db) {
      throw new Error('Offline SQLite database is only available inside the Capacitor Android app.');
    }
    return this.db;
  }

  /**
   * Serializes database write transactions to avoid SQLite "already in transaction" errors
   * and guarantee atomic multi-statement commits.
   */
  public async withTransaction<T>(fn: (adapter: SQLiteDriverAdapter) => Promise<T>): Promise<T> {
    const prev = this.txMutex;
    let release!: () => void;
    this.txMutex = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev;
    const db = await this.ensureDb();
    try {
      await db.beginTransaction();
      const result = await fn(db);
      await db.commitTransaction();
      return result;
    } catch (error) {
      await db.rollbackTransaction().catch(() => {});
      throw error;
    } finally {
      release();
    }
  }

  private buildUpsertSql(table: EntityTableName, record: any, syncStatus: LocalSyncStatus) {
    const id = String(record.id || record._id || '');
    if (!id) {
      throw new Error(`Missing primary key "id" for table ${table}`);
    }
    const clean = {
      ...record,
      id,
      _syncStatus: syncStatus,
      version: Number(record.version) || 1,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };
    const json = JSON.stringify(clean);
    const updatedAt = String(clean.updatedAt);
    const version = Number(clean.version) || 1;

    switch (table) {
      case 'farmers':
        return {
          sql: `INSERT OR REPLACE INTO farmers (id, farmer_id, farmer_code, name, mobile, balance, version, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            id,
            String(clean.farmerId || ''),
            String(clean.farmerCode || clean.farmerId || ''),
            String(clean.name || ''),
            String(clean.mobile || ''),
            Number(clean.balance) || 0,
            version,
            syncStatus,
            updatedAt,
            json,
          ],
        };
      case 'collections':
        return {
          sql: `INSERT OR REPLACE INTO collections (id, date, shift, farmer_internal_id, farmer_id, amount, version, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            id,
            clean.date ? String(clean.date) : '',
            String(clean.shift || ''),
            String(clean.farmerInternalId || ''),
            String(clean.farmerId || ''),
            Number(clean.amount) || 0,
            version,
            syncStatus,
            updatedAt,
            json,
          ],
        };
      case 'shifts':
        return {
          sql: `INSERT OR REPLACE INTO shifts (id, date, shift, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
          params: [id, String(clean.date || ''), String(clean.shift || ''), syncStatus, updatedAt, json],
        };
      case 'sales_customers':
        return {
          sql: `INSERT OR REPLACE INTO sales_customers (id, name, mobile, balance, version, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            id,
            String(clean.name || ''),
            String(clean.mobile || ''),
            Number(clean.balance) || 0,
            version,
            syncStatus,
            updatedAt,
            json,
          ],
        };
      case 'sales_records':
        return {
          sql: `INSERT OR REPLACE INTO sales_records (id, customer_id, date, amount, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [id, String(clean.customerId || ''), String(clean.date || ''), Number(clean.amount) || 0, syncStatus, updatedAt, json],
        };
      case 'customer_payments':
        return {
          sql: `INSERT OR REPLACE INTO customer_payments (id, customer_id, date, amount, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [id, String(clean.customerId || ''), String(clean.date || clean.timestamp || ''), Number(clean.amount) || 0, syncStatus, updatedAt, json],
        };
      case 'rates':
        return {
          sql: `INSERT OR REPLACE INTO rates (id, milk_type, version, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
          params: [id, String(clean.milkType || ''), version, syncStatus, updatedAt, json],
        };
      case 'rate_settings':
        return {
          sql: `INSERT OR REPLACE INTO rate_settings (id, sync_status, updated_at, data) VALUES (?, ?, ?, ?)`,
          params: [id, syncStatus, updatedAt, json],
        };
      case 'payments':
        return {
          sql: `INSERT OR REPLACE INTO payments (id, farmer_internal_id, date, amount, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [id, String(clean.farmerInternalId || ''), String(clean.date || ''), Number(clean.amount) || 0, syncStatus, updatedAt, json],
        };
      case 'ledgers':
        return {
          sql: `INSERT OR REPLACE INTO ledgers (id, farmer_internal_id, date, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
          params: [id, String(clean.farmerInternalId || ''), String(clean.date || ''), syncStatus, updatedAt, json],
        };
      case 'users':
        return {
          sql: `INSERT OR REPLACE INTO users (id, username, role, database_id, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [id, String(clean.username || ''), String(clean.role || ''), String(clean.databaseId || ''), syncStatus, updatedAt, json],
        };
      case 'dairies':
        return {
          sql: `INSERT OR REPLACE INTO dairies (id, database_id, sync_status, updated_at, data) VALUES (?, ?, ?, ?, ?)`,
          params: [id, String(clean.databaseId || ''), syncStatus, updatedAt, json],
        };
    }
  }

  public async getAllEntities<T = any>(table: EntityTableName): Promise<T[]> {
    if (!this.isEnabled()) return [];
    const db = await this.ensureDb();
    const res = await db.query(`SELECT data, sync_status, version FROM ${table}`);
    return (res.values || []).map((row: any) => {
      const parsed = safeJsonParse<any>(row.data, {});
      return {
        ...parsed,
        _syncStatus: row.sync_status || parsed._syncStatus || 'synced',
        version: row.version ?? parsed.version ?? 1,
      } as T;
    });
  }

  public async getEntityById<T = any>(table: EntityTableName, id: string): Promise<T | null> {
    if (!this.isEnabled() || !id) return null;
    const db = await this.ensureDb();
    const res = await db.query(`SELECT data, sync_status, version FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    const row = res.values?.[0];
    if (!row) return null;
    const parsed = safeJsonParse<any>(row.data, null);
    if (!parsed) return null;
    return {
      ...parsed,
      _syncStatus: row.sync_status || parsed._syncStatus || 'synced',
      version: row.version ?? parsed.version ?? 1,
    } as T;
  }

  public async upsertEntity<T = any>(
    table: EntityTableName,
    record: any,
    syncStatus: LocalSyncStatus = 'synced'
  ): Promise<T> {
    const id = String(record.id || record._id || '');
    const stmt = this.buildUpsertSql(table, record, syncStatus);
    await this.withTransaction(async (tx) => {
      await tx.run(stmt.sql, stmt.params, false);
    });
    return { ...record, id, _syncStatus: syncStatus } as T;
  }

  public async upsertEntityInTx(
    tx: SQLiteDriverAdapter,
    table: EntityTableName,
    record: any,
    syncStatus: LocalSyncStatus = 'synced'
  ): Promise<void> {
    const stmt = this.buildUpsertSql(table, record, syncStatus);
    await tx.run(stmt.sql, stmt.params, false);
  }

  public async deleteEntity(table: EntityTableName, id: string): Promise<void> {
    if (!this.isEnabled() || !id) return;
    await this.withTransaction(async (tx) => {
      await tx.run(`DELETE FROM ${table} WHERE id = ?`, [id], false);
    });
  }

  /**
   * Upserts fresh server records into SQLite while preserving any local rows that still have
   * 'pending', 'failed', or 'conflict' status so offline edits are never silently clobbered.
   */
  public async mergeServerEntities(table: EntityTableName, serverItems: any[]): Promise<void> {
    if (!this.isEnabled() || !Array.isArray(serverItems)) return;

    await this.withTransaction(async (tx) => {
      const existingRows = await tx.query(`SELECT id, sync_status FROM ${table}`);
      const protectedIds = new Set<string>();
      const syncedIdsOnDevice = new Set<string>();

      for (const row of existingRows.values || []) {
        if (row.sync_status && row.sync_status !== 'synced') {
          protectedIds.add(String(row.id));
        } else {
          syncedIdsOnDevice.add(String(row.id));
        }
      }

      const incomingIds = new Set<string>();
      for (const item of serverItems) {
        const id = String(item?.id || item?._id || '');
        if (!id) continue;
        incomingIds.add(id);
        if (protectedIds.has(id)) {
          // Do not overwrite un-synced local modifications
          continue;
        }
        const stmt = this.buildUpsertSql(table, { ...item, id }, 'synced');
        await tx.run(stmt.sql, stmt.params, false);
      }

      // Prune server-deleted rows only if they have no unsynced local changes
      for (const existingId of syncedIdsOnDevice) {
        if (!incomingIds.has(existingId)) {
          await tx.run(`DELETE FROM ${table} WHERE id = ? AND sync_status = 'synced'`, [existingId], false);
        }
      }
    });
  }

  // --- Sync Queue Operations ---

  public async enqueueSyncTask(task: Omit<PersistedSyncTask, 'retryCount' | 'nextRetryAt' | 'createdAt' | 'updatedAt' | 'status'> & {
    status?: PersistedSyncTask['status'];
    retryCount?: number;
    nextRetryAt?: number;
    createdAt?: number;
  }): Promise<PersistedSyncTask> {
    const now = Date.now();
    const persisted: PersistedSyncTask = {
      id: task.id,
      type: task.type,
      entityType: task.entityType,
      entityId: task.entityId,
      payload: task.payload,
      idempotencyKey: task.idempotencyKey,
      baseVersion: task.baseVersion,
      status: task.status || 'pending',
      retryCount: task.retryCount ?? 0,
      nextRetryAt: task.nextRetryAt ?? 0,
      lastError: task.lastError,
      createdAt: task.createdAt ?? now,
      updatedAt: now,
    };

    await this.withTransaction(async (tx) => {
      await tx.run(
        `INSERT OR REPLACE INTO sync_queue (id, type, entity_type, entity_id, payload, idempotency_key, base_version, status, retry_count, next_retry_at, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          persisted.id,
          persisted.type,
          persisted.entityType || null,
          persisted.entityId || null,
          JSON.stringify(persisted.payload),
          persisted.idempotencyKey,
          persisted.baseVersion ?? null,
          persisted.status,
          persisted.retryCount,
          persisted.nextRetryAt,
          persisted.lastError || null,
          persisted.createdAt,
          persisted.updatedAt,
        ],
        false
      );
    });

    return persisted;
  }

  public async enqueueSyncTaskInTx(
    tx: SQLiteDriverAdapter,
    task: Omit<PersistedSyncTask, 'retryCount' | 'nextRetryAt' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<void> {
    const now = Date.now();
    await tx.run(
      `INSERT OR REPLACE INTO sync_queue (id, type, entity_type, entity_id, payload, idempotency_key, base_version, status, retry_count, next_retry_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, NULL, ?, ?)`,
      [
        task.id,
        task.type,
        task.entityType || null,
        task.entityId || null,
        JSON.stringify(task.payload),
        task.idempotencyKey,
        task.baseVersion ?? null,
        now,
        now,
      ],
      false
    );
  }

  private mapSyncTaskRow(row: any): PersistedSyncTask {
    return {
      id: row.id,
      type: row.type,
      entityType: row.entity_type || undefined,
      entityId: row.entity_id || undefined,
      payload: safeJsonParse(row.payload, {}),
      idempotencyKey: row.idempotency_key,
      baseVersion: row.base_version !== null && row.base_version !== undefined ? Number(row.base_version) : undefined,
      status: row.status,
      retryCount: Number(row.retry_count) || 0,
      nextRetryAt: Number(row.next_retry_at) || 0,
      lastError: row.last_error || undefined,
      createdAt: Number(row.created_at) || 0,
      updatedAt: Number(row.updated_at) || 0,
    };
  }

  public async getAllSyncTasks(): Promise<PersistedSyncTask[]> {
    if (!this.isEnabled()) return [];
    const db = await this.ensureDb();
    const res = await db.query(`SELECT * FROM sync_queue ORDER BY created_at ASC`);
    return (res.values || []).map((r: any) => this.mapSyncTaskRow(r));
  }

  public async getRunnableSyncTasks(nowMs: number = Date.now()): Promise<PersistedSyncTask[]> {
    if (!this.isEnabled()) return [];
    const db = await this.ensureDb();
    const res = await db.query(
      `SELECT * FROM sync_queue WHERE status IN ('pending', 'failed', 'in_progress') AND next_retry_at <= ? ORDER BY created_at ASC`,
      [nowMs]
    );
    return (res.values || []).map((r: any) => this.mapSyncTaskRow(r));
  }

  public async updateSyncTaskState(
    id: string,
    patch: Partial<Pick<PersistedSyncTask, 'status' | 'retryCount' | 'nextRetryAt' | 'lastError' | 'payload' | 'entityId'>>
  ): Promise<void> {
    if (!this.isEnabled()) return;
    await this.withTransaction(async (tx) => {
      const existing = await tx.query(`SELECT * FROM sync_queue WHERE id = ? LIMIT 1`, [id]);
      const row = existing.values?.[0];
      if (!row) return;
      const now = Date.now();
      await tx.run(
        `UPDATE sync_queue SET status = ?, retry_count = ?, next_retry_at = ?, last_error = ?, payload = ?, entity_id = ?, updated_at = ? WHERE id = ?`,
        [
          patch.status ?? row.status,
          patch.retryCount ?? row.retry_count,
          patch.nextRetryAt ?? row.next_retry_at,
          patch.lastError !== undefined ? patch.lastError : row.last_error,
          patch.payload !== undefined ? JSON.stringify(patch.payload) : row.payload,
          patch.entityId !== undefined ? patch.entityId : row.entity_id,
          now,
          id,
        ],
        false
      );
    });
  }

  /**
   * Completes a sync task: removes it from sync_queue, updates the corresponding local entity
   * with the authoritative server record, and remaps any temporary offline ID in dependent
   * child tables and queued sync tasks (e.g. offline temp_farmer -> server Mongo ID).
   */
  public async completeSyncTask(
    taskId: string,
    table?: EntityTableName,
    tempId?: string,
    serverRecord?: any
  ): Promise<void> {
    if (!this.isEnabled()) return;
    const realId = serverRecord ? String(serverRecord.id || serverRecord._id || '') : '';

    await this.withTransaction(async (tx) => {
      await tx.run(`DELETE FROM sync_queue WHERE id = ?`, [taskId], false);

      if (table && serverRecord && realId) {
        if (tempId && tempId !== realId) {
          await tx.run(`DELETE FROM ${table} WHERE id = ?`, [tempId], false);
          await this.remapTempIdInPendingObjects(tx, table, tempId, realId);
        }
        const stmt = this.buildUpsertSql(table, { ...serverRecord, id: realId }, 'synced');
        await tx.run(stmt.sql, stmt.params, false);
      }
    });
  }

  private async remapTempIdInPendingObjects(
    tx: SQLiteDriverAdapter,
    parentTable: EntityTableName,
    tempId: string,
    realId: string
  ): Promise<void> {
    // 1. Remap references in queued sync tasks
    const pendingRes = await tx.query(`SELECT id, entity_id, payload FROM sync_queue ORDER BY created_at ASC`);
    for (const row of pendingRes.values || []) {
      let changed = false;
      const payload = safeJsonParse<any>(row.payload, {});
      let nextEntityId = row.entity_id;

      if (nextEntityId === tempId) {
        nextEntityId = realId;
        changed = true;
      }

      const remapFields = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of ['id', 'farmerInternalId', 'customerId', 'dairyId']) {
          if (obj[key] === tempId) {
            obj[key] = realId;
            changed = true;
          }
        }
        if (obj.data && typeof obj.data === 'object') {
          remapFields(obj.data);
        }
      };
      remapFields(payload);

      if (changed) {
        await tx.run(
          `UPDATE sync_queue SET entity_id = ?, payload = ?, updated_at = ? WHERE id = ?`,
          [nextEntityId || null, JSON.stringify(payload), Date.now(), row.id],
          false
        );
      }
    }

    // 2. Remap references in dependent local SQLite entity tables
    if (parentTable === 'farmers') {
      for (const childTable of ['collections', 'payments', 'ledgers'] as const) {
        const res = await tx.query(`SELECT id, data, sync_status FROM ${childTable} WHERE farmer_internal_id = ?`, [tempId]);
        for (const r of res.values || []) {
          const parsed = safeJsonParse<any>(r.data, {});
          parsed.farmerInternalId = realId;
          const stmt = this.buildUpsertSql(childTable, parsed, (r.sync_status as LocalSyncStatus) || 'pending');
          await tx.run(stmt.sql, stmt.params, false);
        }
      }
    } else if (parentTable === 'sales_customers') {
      for (const childTable of ['sales_records', 'customer_payments'] as const) {
        const res = await tx.query(`SELECT id, data, sync_status FROM ${childTable} WHERE customer_id = ?`, [tempId]);
        for (const r of res.values || []) {
          const parsed = safeJsonParse<any>(r.data, {});
          parsed.customerId = realId;
          const stmt = this.buildUpsertSql(childTable, parsed, (r.sync_status as LocalSyncStatus) || 'pending');
          await tx.run(stmt.sql, stmt.params, false);
        }
      }
    }
  }

  public async removeSyncTask(taskId: string): Promise<void> {
    if (!this.isEnabled()) return;
    await this.withTransaction(async (tx) => {
      await tx.run(`DELETE FROM sync_queue WHERE id = ?`, [taskId], false);
    });
  }

  // --- Sync Conflicts ---

  public async recordConflict(
    conflict: Omit<LocalSyncConflict, 'createdAt' | 'status'>,
    table?: EntityTableName
  ): Promise<LocalSyncConflict> {
    const entry: LocalSyncConflict = {
      ...conflict,
      status: 'unresolved',
      createdAt: Date.now(),
    };
    await this.withTransaction(async (tx) => {
      await tx.run(
        `INSERT OR REPLACE INTO sync_conflicts
         (id, server_conflict_id, entity_type, entity_id, operation, local_payload, server_payload, local_version, server_version, reason, status, queue_task_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.serverConflictId || null,
          entry.entityType,
          entry.entityId,
          entry.operation,
          JSON.stringify(entry.localPayload),
          entry.serverPayload ? JSON.stringify(entry.serverPayload) : null,
          entry.localVersion ?? null,
          entry.serverVersion ?? null,
          entry.reason,
          entry.status,
          entry.queueTaskId || null,
          entry.createdAt,
        ],
        false
      );

      if (conflict.queueTaskId) {
        await tx.run(
          `UPDATE sync_queue SET status = 'conflict', last_error = ?, updated_at = ? WHERE id = ?`,
          [entry.reason, Date.now(), conflict.queueTaskId],
          false
        );
      }

      if (table && conflict.entityId) {
        await tx.run(`UPDATE ${table} SET sync_status = 'conflict' WHERE id = ?`, [conflict.entityId], false);
      }
    });
    return entry;
  }

  public async getConflicts(status?: LocalSyncConflict['status']): Promise<LocalSyncConflict[]> {
    if (!this.isEnabled()) return [];
    const db = await this.ensureDb();
    const res = status
      ? await db.query(`SELECT * FROM sync_conflicts WHERE status = ? ORDER BY created_at DESC`, [status])
      : await db.query(`SELECT * FROM sync_conflicts ORDER BY created_at DESC`);
    return (res.values || []).map((r: any) => ({
      id: r.id,
      serverConflictId: r.server_conflict_id || undefined,
      entityType: r.entity_type,
      entityId: r.entity_id,
      operation: r.operation,
      localPayload: safeJsonParse(r.local_payload, {}),
      serverPayload: r.server_payload ? safeJsonParse(r.server_payload, undefined) : undefined,
      localVersion: r.local_version !== null ? Number(r.local_version) : undefined,
      serverVersion: r.server_version !== null ? Number(r.server_version) : undefined,
      reason: r.reason,
      status: r.status,
      queueTaskId: r.queue_task_id || undefined,
      createdAt: Number(r.created_at) || 0,
      resolvedAt: r.resolved_at ? Number(r.resolved_at) : undefined,
    }));
  }

  public async markConflictResolved(
    conflictId: string,
    resolution: 'resolved_keep_server' | 'resolved_apply_local' | 'resolved_merged',
    table?: EntityTableName,
    updatedRecord?: any
  ): Promise<void> {
    if (!this.isEnabled()) return;
    await this.withTransaction(async (tx) => {
      const res = await tx.query(`SELECT queue_task_id, entity_id FROM sync_conflicts WHERE id = ? LIMIT 1`, [conflictId]);
      const row = res.values?.[0];
      await tx.run(
        `UPDATE sync_conflicts SET status = ?, resolved_at = ? WHERE id = ?`,
        [resolution, Date.now(), conflictId],
        false
      );
      if (row?.queue_task_id) {
        await tx.run(`DELETE FROM sync_queue WHERE id = ?`, [row.queue_task_id], false);
      }
      if (table && updatedRecord && (updatedRecord.id || updatedRecord._id)) {
        const stmt = this.buildUpsertSql(table, { ...updatedRecord, id: updatedRecord.id || updatedRecord._id }, 'synced');
        await tx.run(stmt.sql, stmt.params, false);
      } else if (table && row?.entity_id) {
        await tx.run(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ?`, [row.entity_id], false);
      }
    });
  }

  // --- Persistent SMS Queue ---

  public async enqueueSms(sms: Omit<PersistedSmsRecord, 'createdAt' | 'updatedAt' | 'syncedToServer'> & {
    createdAt?: number;
    syncedToServer?: boolean;
  }): Promise<{ record: PersistedSmsRecord; inserted: boolean }> {
    const now = Date.now();
    const record: PersistedSmsRecord = {
      ...sms,
      syncedToServer: Boolean(sms.syncedToServer),
      createdAt: sms.createdAt ?? now,
      updatedAt: now,
    };

    let inserted = false;
    await this.withTransaction(async (tx) => {
      const existing = await tx.query(`SELECT * FROM sms_queue WHERE idempotency_key = ? LIMIT 1`, [record.idempotencyKey]);
      if (existing.values && existing.values.length > 0) {
        return;
      }
      inserted = true;
      await tx.run(
        `INSERT INTO sms_queue
         (id, idempotency_key, recipient_type, recipient_id, recipient_name, phone, message, trigger_type, delivery_channel, status, attempts, next_retry_at, sim_slot, provider_message_id, error_message, synced_to_server, created_at, updated_at, sent_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.idempotencyKey,
          record.recipientType,
          record.recipientId || null,
          record.recipientName || null,
          record.phone,
          record.message,
          record.triggerType,
          record.deliveryChannel,
          record.status,
          record.attempts,
          record.nextRetryAt,
          record.simSlot ?? null,
          record.providerMessageId || null,
          record.errorMessage || null,
          record.syncedToServer ? 1 : 0,
          record.createdAt,
          record.updatedAt,
          record.sentAt ?? null,
          record.deliveredAt ?? null,
        ],
        false
      );
    });

    return { record, inserted };
  }

  private mapSmsRow(r: any): PersistedSmsRecord {
    return {
      id: r.id,
      idempotencyKey: r.idempotency_key,
      recipientType: r.recipient_type,
      recipientId: r.recipient_id || undefined,
      recipientName: r.recipient_name || undefined,
      phone: r.phone,
      message: r.message,
      triggerType: r.trigger_type,
      deliveryChannel: r.delivery_channel,
      status: r.status,
      attempts: Number(r.attempts) || 0,
      nextRetryAt: Number(r.next_retry_at) || 0,
      simSlot: r.sim_slot !== null && r.sim_slot !== undefined ? Number(r.sim_slot) : undefined,
      providerMessageId: r.provider_message_id || undefined,
      errorMessage: r.error_message || undefined,
      syncedToServer: Boolean(r.synced_to_server),
      createdAt: Number(r.created_at) || 0,
      updatedAt: Number(r.updated_at) || 0,
      sentAt: r.sent_at ? Number(r.sent_at) : undefined,
      deliveredAt: r.delivered_at ? Number(r.delivered_at) : undefined,
    };
  }

  public async updateSmsStatus(
    idOrProviderMsgId: string,
    patch: Partial<
      Pick<
        PersistedSmsRecord,
        'status' | 'attempts' | 'nextRetryAt' | 'providerMessageId' | 'errorMessage' | 'simSlot' | 'sentAt' | 'deliveredAt' | 'syncedToServer'
      >
    >
  ): Promise<PersistedSmsRecord | null> {
    if (!this.isEnabled()) return null;
    let updated: PersistedSmsRecord | null = null;
    await this.withTransaction(async (tx) => {
      const res = await tx.query(
        `SELECT * FROM sms_queue WHERE id = ? OR idempotency_key = ? OR provider_message_id = ? LIMIT 1`,
        [idOrProviderMsgId, idOrProviderMsgId, idOrProviderMsgId]
      );
      const row = res.values?.[0];
      if (!row) return;
      const now = Date.now();
      const nextStatus = patch.status ?? row.status;
      const nextAttempts = patch.attempts ?? Number(row.attempts);
      const nextRetryAt = patch.nextRetryAt ?? Number(row.next_retry_at);
      const nextProviderId = patch.providerMessageId !== undefined ? patch.providerMessageId : row.provider_message_id;
      const nextErr = patch.errorMessage !== undefined ? patch.errorMessage : row.error_message;
      const nextSlot = patch.simSlot !== undefined ? patch.simSlot : row.sim_slot;
      const nextSentAt = patch.sentAt !== undefined ? patch.sentAt : row.sent_at;
      const nextDeliveredAt = patch.deliveredAt !== undefined ? patch.deliveredAt : row.delivered_at;
      const nextSynced = patch.syncedToServer !== undefined ? (patch.syncedToServer ? 1 : 0) : row.synced_to_server;

      await tx.run(
        `UPDATE sms_queue SET status = ?, attempts = ?, next_retry_at = ?, provider_message_id = ?, error_message = ?, sim_slot = ?, sent_at = ?, delivered_at = ?, synced_to_server = ?, updated_at = ? WHERE id = ?`,
        [
          nextStatus,
          nextAttempts,
          nextRetryAt,
          nextProviderId || null,
          nextErr || null,
          nextSlot ?? null,
          nextSentAt ?? null,
          nextDeliveredAt ?? null,
          nextSynced,
          now,
          row.id,
        ],
        false
      );

      updated = this.mapSmsRow({
        ...row,
        status: nextStatus,
        attempts: nextAttempts,
        next_retry_at: nextRetryAt,
        provider_message_id: nextProviderId,
        error_message: nextErr,
        sim_slot: nextSlot,
        sent_at: nextSentAt,
        delivered_at: nextDeliveredAt,
        synced_to_server: nextSynced,
        updated_at: now,
      });
    });
    return updated;
  }

  public async getSmsQueue(limit: number = 100): Promise<PersistedSmsRecord[]> {
    if (!this.isEnabled()) return [];
    const db = await this.ensureDb();
    const res = await db.query(`SELECT * FROM sms_queue ORDER BY created_at DESC LIMIT ?`, [limit]);
    return (res.values || []).map((r: any) => this.mapSmsRow(r));
  }

  public async getRetryableSms(nowMs: number = Date.now()): Promise<PersistedSmsRecord[]> {
    if (!this.isEnabled()) return [];
    const db = await this.ensureDb();
    const res = await db.query(
      `SELECT * FROM sms_queue WHERE status IN ('queued', 'failed') AND attempts < 3 AND next_retry_at <= ? ORDER BY created_at ASC`,
      [nowMs]
    );
    return (res.values || []).map((r: any) => this.mapSmsRow(r));
  }

  public async getUnsyncedSmsLogs(limit: number = 50): Promise<PersistedSmsRecord[]> {
    if (!this.isEnabled()) return [];
    const db = await this.ensureDb();
    const res = await db.query(
      `SELECT * FROM sms_queue WHERE synced_to_server = 0 ORDER BY updated_at ASC LIMIT ?`,
      [limit]
    );
    return (res.values || []).map((r: any) => this.mapSmsRow(r));
  }

  // --- Superadmin Audit Outbox (Offline Queuing) ---

  public async enqueueAuditOutbox(entry: Omit<PersistedAuditOutboxEntry, 'synced' | 'retryCount'>): Promise<void> {
    if (!this.isEnabled()) return;
    await this.withTransaction(async (tx) => {
      await tx.run(
        `INSERT OR IGNORE INTO audit_outbox
         (log_id, action, target_id, target_type, before_value, after_value, details, operation_status, error_details, sync_status, correlation_id, app_version, created_at, synced, retry_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          entry.logId,
          entry.action,
          entry.targetId || null,
          entry.targetType || null,
          entry.beforeValue !== undefined ? JSON.stringify(entry.beforeValue) : null,
          entry.afterValue !== undefined ? JSON.stringify(entry.afterValue) : null,
          entry.details !== undefined ? JSON.stringify(entry.details) : null,
          entry.operationStatus,
          entry.errorDetails || null,
          entry.syncStatus,
          entry.correlationId || null,
          entry.appVersion || null,
          entry.createdAt,
        ],
        false
      );
    });
  }

  public async getPendingAuditOutbox(limit: number = 100): Promise<PersistedAuditOutboxEntry[]> {
    if (!this.isEnabled()) return [];
    const db = await this.ensureDb();
    const res = await db.query(`SELECT * FROM audit_outbox WHERE synced = 0 ORDER BY created_at ASC LIMIT ?`, [limit]);
    return (res.values || []).map((r: any) => ({
      logId: r.log_id,
      action: r.action,
      targetId: r.target_id || undefined,
      targetType: r.target_type || undefined,
      beforeValue: safeJsonParse(r.before_value, undefined),
      afterValue: safeJsonParse(r.after_value, undefined),
      details: safeJsonParse(r.details, undefined),
      operationStatus: r.operation_status,
      errorDetails: r.error_details || undefined,
      syncStatus: r.sync_status,
      correlationId: r.correlation_id || undefined,
      appVersion: r.app_version || undefined,
      createdAt: Number(r.created_at) || 0,
      synced: Boolean(r.synced),
      retryCount: Number(r.retry_count) || 0,
    }));
  }

  public async markAuditsSynced(logIds: string[]): Promise<void> {
    if (!this.isEnabled() || logIds.length === 0) return;
    await this.withTransaction(async (tx) => {
      for (const id of logIds) {
        await tx.run(`UPDATE audit_outbox SET synced = 1, sync_status = 'synced_from_offline' WHERE log_id = ?`, [id], false);
      }
      // Keep recent audit history bounded on device while preserving all unsynced entries
      await tx.run(
        `DELETE FROM audit_outbox WHERE synced = 1 AND created_at < ?`,
        [Date.now() - 14 * 24 * 60 * 60 * 1000],
        false
      );
    });
  }

  // --- Key-Value Metadata & Diagnostics ---

  public async getMetadata(key: string): Promise<string | null> {
    if (!this.isEnabled()) return null;
    const db = await this.ensureDb();
    const res = await db.query(`SELECT value FROM kv_metadata WHERE key = ? LIMIT 1`, [key]);
    return res.values?.[0]?.value ?? null;
  }

  public async setMetadata(key: string, value: string): Promise<void> {
    if (!this.isEnabled()) return;
    await this.withTransaction(async (tx) => {
      await tx.run(
        `INSERT OR REPLACE INTO kv_metadata (key, value, updated_at) VALUES (?, ?, ?)`,
        [key, value, Date.now()],
        false
      );
    });
  }

  public async getDiagnosticsStats(): Promise<SQLiteDiagnosticsStats> {
    const emptyCounts = ALL_ENTITY_TABLES.reduce(
      (acc, name) => ({ ...acc, [name]: 0 }),
      {} as Record<EntityTableName, number>
    );

    if (!this.isEnabled()) {
      return {
        initialized: false,
        schemaVersion: SQLITE_DB_VERSION,
        counts: emptyCounts,
        pendingSyncCount: 0,
        failedSyncCount: 0,
        conflictCount: 0,
        queuedSmsCount: 0,
        sentSmsCount: 0,
        failedSmsCount: 0,
        pendingAuditCount: 0,
      };
    }

    const db = await this.ensureDb();
    const counts = { ...emptyCounts };
    for (const table of ALL_ENTITY_TABLES) {
      const r = await db.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
      counts[table] = Number(r.values?.[0]?.cnt || 0);
    }

    const pendingSync = await db.query(`SELECT COUNT(*) AS cnt FROM sync_queue WHERE status IN ('pending', 'in_progress')`);
    const failedSync = await db.query(`SELECT COUNT(*) AS cnt FROM sync_queue WHERE status = 'failed'`);
    const conflicts = await db.query(`SELECT COUNT(*) AS cnt FROM sync_conflicts WHERE status = 'unresolved'`);
    const smsQueued = await db.query(`SELECT COUNT(*) AS cnt FROM sms_queue WHERE status = 'queued'`);
    const smsSent = await db.query(`SELECT COUNT(*) AS cnt FROM sms_queue WHERE status IN ('submitted', 'sent', 'delivered')`);
    const smsFailed = await db.query(`SELECT COUNT(*) AS cnt FROM sms_queue WHERE status = 'failed'`);
    const pendingAudit = await db.query(`SELECT COUNT(*) AS cnt FROM audit_outbox WHERE synced = 0`);

    return {
      initialized: true,
      schemaVersion: SQLITE_DB_VERSION,
      counts,
      pendingSyncCount: Number(pendingSync.values?.[0]?.cnt || 0),
      failedSyncCount: Number(failedSync.values?.[0]?.cnt || 0),
      conflictCount: Number(conflicts.values?.[0]?.cnt || 0),
      queuedSmsCount: Number(smsQueued.values?.[0]?.cnt || 0),
      sentSmsCount: Number(smsSent.values?.[0]?.cnt || 0),
      failedSmsCount: Number(smsFailed.values?.[0]?.cnt || 0),
      pendingAuditCount: Number(pendingAudit.values?.[0]?.cnt || 0),
    };
  }

  public async exportAllData(): Promise<Record<string, any[]>> {
    const out: Record<string, any[]> = {};
    if (!this.isEnabled()) return out;
    for (const t of ALL_ENTITY_TABLES) {
      out[t] = await this.getAllEntities(t);
    }
    out.sync_queue = await this.getAllSyncTasks();
    out.sync_conflicts = await this.getConflicts();
    out.sms_queue = await this.getSmsQueue(500);
    return out;
  }

  public async importBackupData(backupData: Record<string, any[]>): Promise<void> {
    if (!this.isEnabled() || !backupData || typeof backupData !== 'object') return;
    await this.withTransaction(async (tx) => {
      for (const table of ALL_ENTITY_TABLES) {
        const items = backupData[table];
        if (!Array.isArray(items)) continue;
        await tx.run(`DELETE FROM ${table}`, [], false);
        for (const item of items) {
          const id = item?.id || item?._id;
          if (!id) continue;
          const stmt = this.buildUpsertSql(table, { ...item, id }, item._syncStatus || 'synced');
          await tx.run(stmt.sql, stmt.params, false);
        }
      }

      if (Array.isArray(backupData.sync_queue)) {
        for (const q of backupData.sync_queue) {
          if (!q?.id && !q?._id) continue;
          const qId = String(q.id || q._id);
          await tx.run(
            `INSERT OR IGNORE INTO sync_queue (id, type, entity_type, entity_id, payload, idempotency_key, base_version, status, retry_count, next_retry_at, last_error, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              qId,
              q.type || 'UNKNOWN',
              q.entityType || null,
              q.entityId || null,
              JSON.stringify(q.payload || {}),
              q.idempotencyKey || qId,
              q.baseVersion ?? null,
              q.status || 'pending',
              Number(q.retryCount) || 0,
              Number(q.nextRetryAt) || 0,
              q.lastError || null,
              Number(q.createdAt || q.timestamp) || Date.now(),
              Date.now(),
            ],
            false
          );
        }
      }
    });
  }

  /**
   * One-time migration from legacy IndexedDB (`Realm_milkflow_amcu_db`) or filesystem backup
   * on first launch after upgrading the Android APK to native Capacitor SQLite.
   */
  private async migrateFromLegacyDexieIfNeeded(): Promise<void> {
    const alreadyMigrated = await this.getMetadata('migrated_from_dexie');
    if (alreadyMigrated === '1') return;

    try {
      if (typeof indexedDB !== 'undefined' && typeof (indexedDB as any).databases === 'function') {
        const dbs = await (indexedDB as any).databases();
        const hasLegacy = Array.isArray(dbs) && dbs.some((d: any) => d.name === 'Realm_milkflow_amcu_db');
        if (hasLegacy) {
          const DexieMod = await import('dexie');
          const DexieClass = DexieMod.default;
          const legacyDb = new DexieClass('Realm_milkflow_amcu_db');
          await legacyDb.open();
          const backup: Record<string, any[]> = {};
          for (const table of legacyDb.tables) {
            backup[table.name] = await table.toArray();
          }
          await legacyDb.close();
          if (Object.values(backup).some((arr) => arr.length > 0)) {
            await this.importBackupData(backup);
            console.log('[SQLite] Migrated legacy offline records from IndexedDB to SQLite.');
          }
        }
      }
    } catch (err) {
      console.warn('[SQLite] Legacy IndexedDB migration skipped:', err);
    } finally {
      await this.setMetadata('migrated_from_dexie', '1').catch(() => {});
    }
  }
}

export const sqliteDb = new SqliteDatabaseService();
