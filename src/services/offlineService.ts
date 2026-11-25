import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import api from './axiosInstance';
import { realmInstance } from './realm';
import { CLIENT_APP_VERSION, isNativeApp } from './platform';
import { backgroundSyncBridge } from './backgroundSyncPlugin';
import {
  ALL_ENTITY_TABLES,
  EntityTableName,
  LocalSyncConflict,
  PersistedAuditOutboxEntry,
  PersistedSyncTask,
  sqliteDb,
} from './sqliteDatabase';

const ENTITY_TABLE_SET = new Set<string>(ALL_ENTITY_TABLES);

/**
 * Custom drop-in collection wrapper backed by Capacitor SQLite on Android APK
 * and completely inert on Website (`!sqliteDb.isEnabled()`).
 */
const createCollectionWrapper = (schemaName: string) => {
  return {
    allDocs: async () => {
      if (!sqliteDb.isEnabled()) return { rows: [] };
      try {
        const objects =
          schemaName === 'sync_queue'
            ? await sqliteDb.getAllSyncTasks()
            : ENTITY_TABLE_SET.has(schemaName)
            ? await sqliteDb.getAllEntities<any>(schemaName as EntityTableName)
            : [];
        return {
          rows: objects.map((item: any) => ({
            id: item.id || item._id,
            key: item.id || item._id,
            value: { rev: String(item.version ?? 1) },
            doc: { ...item, _id: item.id || item._id },
          })),
        };
      } catch {
        return { rows: [] };
      }
    },
    get: async (id: string) => {
      if (!sqliteDb.isEnabled()) throw { status: 404, message: 'Offline storage disabled on web' };
      const item = ENTITY_TABLE_SET.has(schemaName)
        ? await sqliteDb.getEntityById<any>(schemaName as EntityTableName, id)
        : null;
      if (!item) {
        throw { status: 404, message: 'missing', error: true };
      }
      return { ...item, _id: item.id || item._id };
    },
    put: async (doc: any) => {
      if (!sqliteDb.isEnabled()) return doc;
      const id = doc.id || doc._id;
      if (!id) return doc;
      const itemToSave = { ...doc, id };
      return await realmInstance.create(schemaName, itemToSave, 'all');
    },
    remove: async (doc: any) => {
      if (!sqliteDb.isEnabled()) return;
      const id = typeof doc === 'string' ? doc : doc?.id || doc?._id;
      if (!id) return;
      await realmInstance.delete(schemaName, id);
    },
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
  syncQueue: createCollectionWrapper('sync_queue'),
};

export interface SyncTask {
  _id: string;
  id?: string;
  type:
    | 'CREATE_FARMER'
    | 'UPDATE_FARMER'
    | 'DELETE_FARMER'
    | 'CREATE_COLLECTION'
    | 'UPDATE_COLLECTION'
    | 'CREATE_SHIFT'
    | 'SAVE_SHIFT_SUMMARY'
    | 'CREATE_SALE_CUSTOMER'
    | 'UPDATE_CUSTOMER'
    | 'DELETE_CUSTOMER'
    | 'RECORD_SALE'
    | 'RECORD_CUSTOMER_PAYMENT'
    | 'CREATE_RATE'
    | 'UPDATE_RATE'
    | 'DELETE_RATE'
    | 'SAVE_RATE_SETTINGS'
    | 'RECORD_PAYMENT'
    | 'CREATE_USER'
    | 'UPDATE_USER'
    | 'DELETE_USER'
    | 'UPDATE_DAIRY'
    | 'FINALIZE_BILLS';
  payload: any;
  timestamp: number;
  idempotencyKey?: string;
  baseVersion?: number;
  status?: PersistedSyncTask['status'];
  retryCount?: number;
  nextRetryAt?: number;
  lastError?: string;
}

export interface SyncStateSnapshot {
  isNative: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  queuedSmsCount: number;
  failedSmsCount: number;
  pendingAuditCount: number;
  lastSyncAt?: number;
  lastError?: string;
}

function generateId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // Fallback
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function computeExponentialBackoffMs(retryCount: number): number {
  const base = Math.min(15 * 60 * 1000, 5000 * Math.pow(2, Math.max(0, retryCount)));
  const jitter = Math.floor(Math.random() * 1500);
  return base + jitter;
}

function stripLocalMetadata(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;
  const {
    _id: _omitMongoId,
    _rev: _omitRev,
    _syncStatus: _omitSync,
    sync_status: _omitSyncSnake,
    ...rest
  } = payload;
  if (typeof rest.id === 'string' && /^(temp_|cust_|coll_|sale_|cust_pay_|payment_|rate_|shift_|user_)/.test(rest.id)) {
    delete rest.id;
  }
  return rest;
}

const TASK_ENTITY_META: Record<
  SyncTask['type'],
  { table?: EntityTableName; entityType?: string; operation: 'create' | 'update' | 'delete' }
> = {
  CREATE_FARMER: { table: 'farmers', entityType: 'farmer', operation: 'create' },
  UPDATE_FARMER: { table: 'farmers', entityType: 'farmer', operation: 'update' },
  DELETE_FARMER: { table: 'farmers', entityType: 'farmer', operation: 'delete' },
  CREATE_COLLECTION: { table: 'collections', entityType: 'collection', operation: 'create' },
  UPDATE_COLLECTION: { table: 'collections', entityType: 'collection', operation: 'update' },
  CREATE_SHIFT: { table: 'shifts', entityType: 'shift', operation: 'create' },
  SAVE_SHIFT_SUMMARY: { table: 'shifts', entityType: 'shift', operation: 'create' },
  CREATE_SALE_CUSTOMER: { table: 'sales_customers', entityType: 'customer', operation: 'create' },
  UPDATE_CUSTOMER: { table: 'sales_customers', entityType: 'customer', operation: 'update' },
  DELETE_CUSTOMER: { table: 'sales_customers', entityType: 'customer', operation: 'delete' },
  RECORD_SALE: { table: 'sales_records', entityType: 'sale', operation: 'create' },
  RECORD_CUSTOMER_PAYMENT: { table: 'customer_payments', entityType: 'payment', operation: 'create' },
  CREATE_RATE: { table: 'rates', entityType: 'rate', operation: 'create' },
  UPDATE_RATE: { table: 'rates', entityType: 'rate', operation: 'update' },
  DELETE_RATE: { table: 'rates', entityType: 'rate', operation: 'delete' },
  SAVE_RATE_SETTINGS: { table: 'rate_settings', entityType: 'settings', operation: 'update' },
  RECORD_PAYMENT: { table: 'ledgers', entityType: 'payment', operation: 'create' },
  CREATE_USER: { table: 'users', entityType: 'user', operation: 'create' },
  UPDATE_USER: { table: 'users', entityType: 'user', operation: 'update' },
  DELETE_USER: { table: 'users', entityType: 'user', operation: 'delete' },
  UPDATE_DAIRY: { table: 'dairies', entityType: 'dairy', operation: 'update' },
  FINALIZE_BILLS: { entityType: 'collection', operation: 'update' },
};

class OfflineService {
  public isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncInProgress: boolean = false;
  private pullInProgress: Promise<void> | null = null;
  private lastPullAt: number = 0;
  private initialized: boolean = false;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private smsFlushHandler: (() => Promise<void>) | null = null;
  private listeners = new Set<(state: SyncStateSnapshot) => void>();

  private state: SyncStateSnapshot = {
    isNative: isNativeApp(),
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    queuedSmsCount: 0,
    failedSmsCount: 0,
    pendingAuditCount: 0,
  };

  constructor() {
    this.initNetworkStatus();
  }

  public setSmsFlushHandler(handler: () => Promise<void>) {
    this.smsFlushHandler = handler;
  }

  public getSyncState(): SyncStateSnapshot {
    return {
      ...this.state,
      isNative: sqliteDb.isEnabled(),
      isOnline: this.isOnline,
      isSyncing: this.syncInProgress,
    };
  }

  public subscribeSyncState(listener: (state: SyncStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSyncState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitSyncState() {
    const snap = this.getSyncState();
    this.listeners.forEach((cb) => {
      try {
        cb(snap);
      } catch {
        // Ignore subscriber error
      }
    });
  }

  public async refreshSyncStatus(): Promise<SyncStateSnapshot> {
    this.state.isNative = sqliteDb.isEnabled();
    this.state.isOnline = this.isOnline;
    this.state.isSyncing = this.syncInProgress;

    if (sqliteDb.isEnabled()) {
      try {
        const stats = await sqliteDb.getDiagnosticsStats();
        this.state.pendingCount = stats.pendingSyncCount;
        this.state.failedCount = stats.failedSyncCount;
        this.state.conflictCount = stats.conflictCount;
        this.state.queuedSmsCount = stats.queuedSmsCount;
        this.state.failedSmsCount = stats.failedSmsCount;
        this.state.pendingAuditCount = stats.pendingAuditCount;
      } catch (err) {
        console.warn('[OfflineService] Failed to refresh SQLite status:', err);
      }
    }

    this.emitSyncState();
    return this.getSyncState();
  }

  private initNetworkStatus() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.state.isOnline = true;
      this.emitSyncState();
      if (isNativeApp()) {
        void this.triggerSyncCycle('network_online');
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.state.isOnline = false;
      this.emitSyncState();
    });
  }

  /**
   * Initializes Capacitor SQLite, Network, App Resume, and WorkManager listeners
   * strictly inside Capacitor Native APK runtime. Website remains 100% online-only.
   */
  public async initialize(): Promise<void> {
    if (!sqliteDb.isEnabled()) {
      return;
    }

    await sqliteDb.init();

    if (!this.initialized) {
      this.initialized = true;

      if (isNativeApp()) {
        try {
          Network.addListener('networkStatusChange', (status) => {
            const wasOnline = this.isOnline;
            this.isOnline = status.connected;
            this.state.isOnline = status.connected;
            if (wasOnline !== this.isOnline && typeof window !== 'undefined') {
              window.dispatchEvent(new Event(this.isOnline ? 'online' : 'offline'));
            }
            this.emitSyncState();
            if (this.isOnline) {
              void this.triggerSyncCycle('capacitor_network_change');
            }
          });

          const netStatus = await Network.getStatus();
          this.isOnline = netStatus.connected;
          this.state.isOnline = netStatus.connected;
        } catch (err) {
          console.warn('[OfflineService] Network listener init failed:', err);
        }

        try {
          App.addListener('appStateChange', ({ isActive }) => {
            if (isActive && this.isOnline) {
              void this.triggerSyncCycle('app_resume');
            }
          });
        } catch (err) {
          console.warn('[OfflineService] App state listener failed:', err);
        }

        void backgroundSyncBridge.ensurePeriodicSync();
        void backgroundSyncBridge.addSyncListener(() => {
          if (this.isOnline) {
            void this.triggerSyncCycle('workmanager_trigger');
          }
        });

        this.configureWorkManagerAuth().catch(() => {});

        // Periodic retry timer while foregrounded
        if (!this.retryInterval) {
          this.retryInterval = setInterval(() => {
            if (this.isOnline && sqliteDb.isEnabled()) {
              void this.processSyncQueue();
              void this.flushSmsAndAudit();
            }
          }, 30000);
        }
      }
    }

    await this.refreshSyncStatus();
    if (this.isOnline) {
      void this.triggerSyncCycle('app_open');
    }
  }

  public async configureWorkManagerAuth(): Promise<void> {
    if (!isNativeApp() || typeof localStorage === 'undefined') return;
    const token = localStorage.getItem('token');
    const databaseId = localStorage.getItem('databaseId') || '(default)';
    if (!token || token.startsWith('offline_token_')) return;
    await backgroundSyncBridge.configure({
      serverUrl: (api.defaults.baseURL || 'https://amcu.onrender.com/api').toString(),
      token,
      databaseId,
      appVersion: CLIENT_APP_VERSION,
    });
  }

  public async triggerSyncCycle(reason: string = 'manual'): Promise<{
    synced: number;
    conflicts: number;
    failed: number;
  }> {
    if (!sqliteDb.isEnabled()) {
      return { synced: 0, conflicts: 0, failed: 0 };
    }

    await sqliteDb.init();
    const result = await this.processSyncQueue(reason === 'manual');
    await this.flushSmsAndAudit();
    if (this.isOnline) {
      await this.syncFromServer(reason === 'manual');
    }
    await this.refreshSyncStatus();
    return result;
  }

  private async flushSmsAndAudit(): Promise<void> {
    if (!this.isOnline || !sqliteDb.isEnabled()) return;
    if (this.smsFlushHandler) {
      await this.smsFlushHandler().catch((err) => console.warn('[SMS Flush] Error:', err));
    }
    await this.flushAuditOutbox().catch((err) => console.warn('[Audit Flush] Error:', err));
  }

  public async recordAuditEvent(entry: {
    action: string;
    targetId?: string;
    targetType?: string;
    beforeValue?: any;
    afterValue?: any;
    details?: any;
    operationStatus?: PersistedAuditOutboxEntry['operationStatus'];
    errorDetails?: string;
    syncStatus?: PersistedAuditOutboxEntry['syncStatus'];
    correlationId?: string;
  }): Promise<void> {
    if (!sqliteDb.isEnabled()) return;
    try {
      await sqliteDb.enqueueAuditOutbox({
        logId: generateId('audit'),
        action: entry.action,
        targetId: entry.targetId,
        targetType: entry.targetType,
        beforeValue: entry.beforeValue,
        afterValue: entry.afterValue,
        details: entry.details,
        operationStatus: entry.operationStatus || 'success',
        errorDetails: entry.errorDetails,
        syncStatus: entry.syncStatus || (this.isOnline ? 'online' : 'queued_offline'),
        correlationId: entry.correlationId || generateId('corr'),
        appVersion: CLIENT_APP_VERSION,
        createdAt: Date.now(),
      });
      await this.refreshSyncStatus();
      if (this.isOnline) {
        void this.flushAuditOutbox();
      }
    } catch (err) {
      console.warn('[OfflineService] Failed to enqueue local audit log:', err);
    }
  }

  public async flushAuditOutbox(): Promise<number> {
    if (!sqliteDb.isEnabled() || !this.isOnline) return 0;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token || token.startsWith('offline_token_')) return 0;

    const pending = await sqliteDb.getPendingAuditOutbox(100);
    if (pending.length === 0) return 0;

    try {
      const res = await api.post(
        '/audit/sync',
        { logs: pending },
        {
          headers: {
            'Idempotency-Key': `audit_batch_${pending[0].logId}_${pending.length}`,
            'X-Offline-Sync': 'true',
          },
        }
      );
      const acceptedIds: string[] = Array.isArray(res.data?.acceptedIds)
        ? res.data.acceptedIds
        : pending.map((p) => p.logId);
      await sqliteDb.markAuditsSynced(acceptedIds);
      await this.refreshSyncStatus();
      return acceptedIds.length;
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        console.warn('[Audit Flush] Auth required before flushing offline audit logs');
      }
      return 0;
    }
  }

  async queueTask(
    type: SyncTask['type'],
    payload: any,
    options?: { baseVersion?: number; entityId?: string; idempotencyKey?: string }
  ): Promise<PersistedSyncTask | null> {
    if (!sqliteDb.isEnabled()) return null;

    const meta = TASK_ENTITY_META[type];
    const entityId =
      options?.entityId ||
      (typeof payload === 'string' ? payload : payload?.id || payload?._id || payload?.data?.id);
    const idempotencyKey = options?.idempotencyKey || payload?.idempotencyKey || generateId(`idem_${type.toLowerCase()}`);

    const payloadWithIdem =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? { ...payload, idempotencyKey: payload.idempotencyKey || idempotencyKey }
        : payload;

    const task = await sqliteDb.enqueueSyncTask({
      id: generateId('sync'),
      type,
      entityType: meta?.entityType,
      entityId: entityId ? String(entityId) : undefined,
      payload: payloadWithIdem,
      idempotencyKey,
      baseVersion: options?.baseVersion ?? payload?.expectedVersion ?? payload?.data?.expectedVersion,
      status: 'pending',
    });

    await this.recordAuditEvent({
      action: `OFFLINE_QUEUED_${type}`,
      targetId: entityId ? String(entityId) : undefined,
      targetType: meta?.entityType?.toUpperCase(),
      afterValue: payloadWithIdem,
      operationStatus: 'queued',
      syncStatus: 'queued_offline',
      details: { idempotencyKey, queueTaskId: task.id },
    });

    if (isNativeApp()) {
      void backgroundSyncBridge.scheduleImmediateSync();
    }

    await this.refreshSyncStatus();

    if (this.isOnline) {
      void this.triggerSyncCycle('auto_queue');
    }

    return task;
  }

  async processSyncQueue(ignoreBackoff: boolean = false): Promise<{
    synced: number;
    conflicts: number;
    failed: number;
  }> {
    if (!sqliteDb.isEnabled() || this.syncInProgress || !this.isOnline) {
      return { synced: 0, conflicts: 0, failed: 0 };
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (token && token.startsWith('offline_token_')) {
      // Offline token cannot authenticate against online API endpoints until session refreshed
      return { synced: 0, conflicts: 0, failed: 0 };
    }

    this.syncInProgress = true;
    this.state.isSyncing = true;
    this.state.lastError = undefined;
    this.emitSyncState();

    let synced = 0;
    let conflicts = 0;
    let failed = 0;
    const blockedTempIds = new Set<string>();

    try {
      const now = Date.now();
      const tasks = ignoreBackoff
        ? (await sqliteDb.getAllSyncTasks()).filter((t) => t.status !== 'conflict')
        : await sqliteDb.getRunnableSyncTasks(now);

      for (const task of tasks) {
        // Respect parent-child ordering: skip dependent tasks whose offline temp parent hasn't synced yet
        const depRef =
          task.payload?.farmerInternalId ||
          task.payload?.customerId ||
          task.entityId ||
          (typeof task.payload === 'string' ? task.payload : undefined);

        if (depRef && blockedTempIds.has(String(depRef))) {
          continue;
        }

        // Always re-read latest payload so tempId remappings from earlier tasks in this loop take effect!
        const allLatest = await sqliteDb.getAllSyncTasks();
        const latestTask = allLatest.find((t) => t.id === task.id) || task;

        try {
          await sqliteDb.updateSyncTaskState(latestTask.id, { status: 'in_progress' });
          const { serverDoc, table, tempId } = await this.executeSyncTask(latestTask);
          await sqliteDb.completeSyncTask(latestTask.id, table, tempId, serverDoc);
          synced++;
        } catch (error: any) {
          const status = error?.status || error?.response?.status || 0;
          const errMsg = error?.data?.message || error?.response?.data?.message || error?.message || 'Sync failed';
          const errDetails = error?.data?.details || error?.response?.data?.details;
          const meta = TASK_ENTITY_META[latestTask.type as SyncTask['type']] || {
            entityType: latestTask.entityType || 'unknown',
            operation: 'update',
          };

          if (latestTask.entityId && /^(temp_|cust_|coll_|sale_|cust_pay_|payment_|rate_|shift_|user_)/.test(latestTask.entityId)) {
            blockedTempIds.add(latestTask.entityId);
          }

          if (status === 409) {
            conflicts++;
            await sqliteDb.recordConflict(
              {
                id: generateId('conflict'),
                serverConflictId: errDetails?.conflictId,
                entityType: meta.entityType || 'unknown',
                entityId: String(latestTask.entityId || latestTask.payload?.id || latestTask.id),
                operation: meta.operation,
                localPayload: latestTask.payload,
                serverPayload: errDetails?.serverRecord,
                localVersion: errDetails?.localVersion ?? latestTask.baseVersion,
                serverVersion: errDetails?.serverVersion,
                reason: errMsg,
                queueTaskId: latestTask.id,
              },
              meta.table
            );
            await this.recordAuditEvent({
              action: `SYNC_CONFLICT_${latestTask.type}`,
              targetId: latestTask.entityId,
              targetType: meta.entityType?.toUpperCase(),
              beforeValue: errDetails?.serverRecord,
              afterValue: latestTask.payload,
              operationStatus: 'conflict',
              errorDetails: errMsg,
              syncStatus: 'failed',
            });
          } else if (status === 401 || status === 403) {
            failed++;
            this.state.lastError = errMsg;
            await sqliteDb.updateSyncTaskState(latestTask.id, {
              status: 'failed',
              retryCount: latestTask.retryCount,
              nextRetryAt: Date.now() + 60000,
              lastError: errMsg,
            });
            // Stop loop on auth loss so queued items wait safely until login refresh
            break;
          } else if (status >= 400 && status < 500) {
            // Deterministic validation failure: preserve item in failed state for inspection, do not drop silently
            failed++;
            this.state.lastError = errMsg;
            await sqliteDb.updateSyncTaskState(latestTask.id, {
              status: 'failed',
              retryCount: latestTask.retryCount + 1,
              nextRetryAt: Number.MAX_SAFE_INTEGER,
              lastError: errMsg,
            });
            await this.recordAuditEvent({
              action: `SYNC_FAILED_${latestTask.type}`,
              targetId: latestTask.entityId,
              targetType: meta.entityType?.toUpperCase(),
              afterValue: latestTask.payload,
              operationStatus: 'failure',
              errorDetails: errMsg,
              syncStatus: 'failed',
            });
          } else {
            // Transient network or 5xx error -> exponential backoff
            failed++;
            const nextRetryCount = latestTask.retryCount + 1;
            const delayMs = computeExponentialBackoffMs(latestTask.retryCount);
            this.state.lastError = errMsg;
            await sqliteDb.updateSyncTaskState(latestTask.id, {
              status: 'failed',
              retryCount: nextRetryCount,
              nextRetryAt: Date.now() + delayMs,
              lastError: errMsg,
            });
          }
        }
      }

      if (synced > 0) {
        this.state.lastSyncAt = Date.now();
        await sqliteDb.setMetadata('last_sync_at', String(this.state.lastSyncAt));
      }
    } finally {
      this.syncInProgress = false;
      this.state.isSyncing = false;
      await this.refreshSyncStatus();
    }

    return { synced, conflicts, failed };
  }

  private async executeSyncTask(task: PersistedSyncTask): Promise<{
    serverDoc?: any;
    table?: EntityTableName;
    tempId?: string;
  }> {
    const headers: Record<string, string> = {
      'Idempotency-Key': task.idempotencyKey,
      'X-Offline-Sync': 'true',
    };
    if (task.baseVersion !== undefined) {
      headers['X-Expected-Version'] = String(task.baseVersion);
    }

    switch (task.type) {
      case 'CREATE_FARMER': {
        const res = await api.post('/farmers', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'farmers', tempId: task.payload?.id || task.entityId };
      }
      case 'UPDATE_FARMER': {
        const body = task.baseVersion !== undefined ? { ...task.payload.data, expectedVersion: task.baseVersion } : task.payload.data;
        const res = await api.put(`/farmers/${task.payload.id}`, body, { headers });
        return { serverDoc: res.data, table: 'farmers', tempId: task.payload.id };
      }
      case 'DELETE_FARMER': {
        const id = typeof task.payload === 'string' ? task.payload : task.payload.id;
        await api.delete(`/farmers/${id}`, { headers });
        return { table: 'farmers' };
      }
      case 'CREATE_COLLECTION': {
        const res = await api.post('/collections', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'collections', tempId: task.payload?.id || task.entityId };
      }
      case 'UPDATE_COLLECTION': {
        const body = task.baseVersion !== undefined ? { ...task.payload.data, expectedVersion: task.baseVersion } : task.payload.data;
        const res = await api.put(`/collections/${task.payload.id}`, body, { headers });
        return { serverDoc: res.data, table: 'collections', tempId: task.payload.id };
      }
      case 'CREATE_SHIFT':
      case 'SAVE_SHIFT_SUMMARY': {
        const res = await api.post('/shifts/summary', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'shifts', tempId: task.payload?.id || task.entityId };
      }
      case 'CREATE_SALE_CUSTOMER': {
        const res = await api.post('/customers', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'sales_customers', tempId: task.payload?.id || task.entityId };
      }
      case 'UPDATE_CUSTOMER': {
        const body = task.baseVersion !== undefined ? { ...task.payload.data, expectedVersion: task.baseVersion } : task.payload.data;
        const res = await api.put(`/customers/${task.payload.id}`, body, { headers });
        return { serverDoc: res.data, table: 'sales_customers', tempId: task.payload.id };
      }
      case 'DELETE_CUSTOMER': {
        const id = typeof task.payload === 'string' ? task.payload : task.payload.id;
        await api.delete(`/customers/${id}`, { headers });
        return { table: 'sales_customers' };
      }
      case 'RECORD_SALE': {
        const res = await api.post('/sales', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'sales_records', tempId: task.payload?.id || task.entityId };
      }
      case 'RECORD_CUSTOMER_PAYMENT': {
        const res = await api.post('/customer-payments', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'customer_payments', tempId: task.payload?.id || task.entityId };
      }
      case 'CREATE_RATE': {
        const res = await api.post('/rates', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'rates', tempId: task.payload?.id || task.entityId };
      }
      case 'UPDATE_RATE': {
        const body = task.baseVersion !== undefined ? { ...task.payload.data, expectedVersion: task.baseVersion } : task.payload.data;
        const res = await api.put(`/rates/${task.payload.id}`, body, { headers });
        return { serverDoc: res.data, table: 'rates', tempId: task.payload.id };
      }
      case 'DELETE_RATE': {
        const id = typeof task.payload === 'string' ? task.payload : task.payload.id;
        await api.delete(`/rates/${id}`, { headers });
        return { table: 'rates' };
      }
      case 'SAVE_RATE_SETTINGS': {
        await api.post('/rates/settings', task.payload, { headers });
        return {};
      }
      case 'RECORD_PAYMENT': {
        const res = await api.post('/payments', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'ledgers', tempId: task.payload?.id || task.entityId };
      }
      case 'CREATE_USER': {
        const res = await api.post('/users', stripLocalMetadata(task.payload), { headers });
        return { serverDoc: res.data, table: 'users', tempId: task.payload?.id || task.entityId };
      }
      case 'UPDATE_USER': {
        const res = await api.put(`/users/${task.payload.id}`, task.payload.data, { headers });
        return { serverDoc: res.data, table: 'users', tempId: task.payload.id };
      }
      case 'DELETE_USER': {
        const id = typeof task.payload === 'string' ? task.payload : task.payload.id;
        await api.delete(`/users/${id}`, { headers });
        return { table: 'users' };
      }
      case 'UPDATE_DAIRY': {
        const res = await api.put(`/dairies/${task.payload.id}`, task.payload.data, { headers });
        return { serverDoc: res.data, table: 'dairies', tempId: task.payload.id };
      }
      case 'FINALIZE_BILLS': {
        await api.post('/reports/finalize-bills', task.payload, { headers });
        return {};
      }
      default:
        return {};
    }
  }

  public async resolveConflictOffline(
    conflictId: string,
    resolution: 'keep_server' | 'apply_local' | 'merged',
    mergedData?: Record<string, any>
  ): Promise<void> {
    if (!sqliteDb.isEnabled()) return;
    const conflicts = await sqliteDb.getConflicts();
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    const entityToTable: Record<string, EntityTableName> = {
      farmer: 'farmers',
      collection: 'collections',
      customer: 'sales_customers',
      rate: 'rates',
    };
    const table = entityToTable[conflict.entityType];
    const resolutionStatus =
      resolution === 'keep_server'
        ? 'resolved_keep_server'
        : resolution === 'apply_local'
        ? 'resolved_apply_local'
        : 'resolved_merged';

    let finalRecord = conflict.serverPayload;
    if (this.isOnline && conflict.serverConflictId) {
      const res = await api.post(`/sync/conflicts/${conflict.serverConflictId}/resolve`, {
        resolution,
        mergedData,
      });
      if (res.data?.appliedRecord) {
        finalRecord = res.data.appliedRecord;
      }
    } else if (resolution === 'apply_local') {
      finalRecord = { ...conflict.serverPayload, ...(conflict.localPayload?.data || conflict.localPayload), version: (conflict.serverVersion || 1) };
    } else if (resolution === 'merged' && mergedData) {
      finalRecord = { ...conflict.serverPayload, ...mergedData, version: (conflict.serverVersion || 1) };
    }

    await sqliteDb.markConflictResolved(conflict.id, resolutionStatus, table, finalRecord);
    await this.recordAuditEvent({
      action: 'SYNC_CONFLICT_RESOLVED_CLIENT',
      targetId: conflict.entityId,
      targetType: conflict.entityType.toUpperCase(),
      beforeValue: conflict.serverPayload,
      afterValue: finalRecord,
      details: { conflictId: conflict.id, resolution },
      operationStatus: 'success',
      syncStatus: this.isOnline ? 'online' : 'queued_offline',
    });
    await this.refreshSyncStatus();
  }

  async syncFromServer(force: boolean = false) {
    if (!this.isOnline || !sqliteDb.isEnabled()) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token || token.startsWith('offline_token_')) return;

    if (this.pullInProgress) {
      return this.pullInProgress;
    }
    if (!force && Date.now() - this.lastPullAt < 5000) {
      return;
    }

    this.pullInProgress = (async () => {
      try {
        await sqliteDb.init();
        let role = 'operator';
        try {
          const savedProfile = typeof localStorage !== 'undefined' ? localStorage.getItem('profile') : null;
          if (savedProfile) {
            role = JSON.parse(savedProfile)?.role || 'operator';
          }
        } catch {
          // ignore
        }

        await this.syncCollection('farmers', '/farmers');
        await this.syncCollection('collections', '/collections');
        await this.syncCollection('shifts', '/shifts/recent?limit=50');
        await this.syncCollection('sales_customers', '/customers');
        await this.syncCollection('sales_records', '/sales');
        await this.syncCollection('customer_payments', '/customer-payments');
        await this.syncCollection('rates', '/rates');
        await this.syncSettings();
        await this.syncCollection('ledgers', '/ledger');

        if (role === 'admin' || role === 'super_admin') {
          await this.syncCollection('users', '/users');
        }
        if (role === 'super_admin') {
          await this.syncCollection('dairies', '/dairies');
        }

        this.lastPullAt = Date.now();
        this.state.lastSyncAt = this.lastPullAt;
      } catch (error) {
        console.error('Server sync failed:', error);
      } finally {
        this.pullInProgress = null;
        await this.refreshSyncStatus();
      }
    })();

    return this.pullInProgress;
  }

  private async syncSettings() {
    try {
      const res = await api.get('/rates/settings');
      if (res.data && !Array.isArray(res.data)) {
        await sqliteDb.upsertEntity('rate_settings', { ...res.data, id: 'current' }, 'synced');
      }
    } catch {
      // Best-effort settings pull
    }
  }

  public async syncCollection(schemaName: string, endpoint: string) {
    if (!sqliteDb.isEnabled() || !ENTITY_TABLE_SET.has(schemaName)) return;
    try {
      const res = await api.get(endpoint);
      const data = res.data?.data || res.data;
      if (Array.isArray(data)) {
        await sqliteDb.mergeServerEntities(schemaName as EntityTableName, data);
      }
    } catch {
      // Best-effort endpoint pull
    }
  }

  // --- Offline Read & Atomic Offline Mutation Methods ---

  async getFarmers(): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    return await sqliteDb.getAllEntities('farmers');
  }

  async getFarmerById(id: string) {
    if (!sqliteDb.isEnabled()) return null;
    return await sqliteDb.getEntityById('farmers', id);
  }

  async searchFarmer(farmerId: string) {
    if (!sqliteDb.isEnabled()) return null;
    const all = await sqliteDb.getAllEntities<any>('farmers');
    return all.find((f) => f.farmerId === farmerId || f.farmerCode === farmerId) || null;
  }

  async getCollectionsByDate(dateStr: string, endDate?: string) {
    if (!sqliteDb.isEnabled()) return [];
    const docs = await sqliteDb.getAllEntities<any>('collections');
    const startCompare = dateStr.split('T')[0];

    if (endDate) {
      const endCompare = endDate.split('T')[0];
      return docs.filter((doc) => {
        const d = typeof doc.date === 'string' ? doc.date.split('T')[0] : new Date(doc.date).toISOString().split('T')[0];
        return d >= startCompare && d <= endCompare;
      });
    }

    return docs.filter((doc) => {
      const d = typeof doc.date === 'string' ? doc.date.split('T')[0] : new Date(doc.date).toISOString().split('T')[0];
      return d === startCompare;
    });
  }

  async recordCollectionOffline(payload: any) {
    if (!sqliteDb.isEnabled()) throw new Error('Offline mode not available on web');

    const fatVal = parseFloat(payload.fat);
    const snfVal = parseFloat(payload.snf);

    let isValid = false;
    if (fatVal >= 3.0 && fatVal < 6.0) {
      if (snfVal >= 8.0 && snfVal <= 8.5) isValid = true;
    } else if (fatVal >= 6.0 && fatVal <= 10.0) {
      if (snfVal >= 8.3 && snfVal <= 9.0) isValid = true;
    }

    if (!isValid) {
      throw new Error('Invalid fat snf input');
    }

    // Prevent duplicate local pour on same farmer/date/shift
    const targetDay = (typeof payload.date === 'string' ? payload.date : new Date(payload.date || Date.now()).toISOString()).split('T')[0];
    const existingDayCollections = await this.getCollectionsByDate(targetDay);
    const dup = existingDayCollections.find(
      (c) =>
        (c.farmerInternalId === payload.farmerInternalId || c.farmerId === payload.farmerId) &&
        String(c.shift || '').toLowerCase() === String(payload.shift || '').toLowerCase()
    );
    if (dup) {
      throw new Error(`Farmer ${payload.farmerName || payload.farmerId} has already recorded a milk pour for ${payload.shift} shift on ${targetDay}.`);
    }

    const id = generateId('coll');
    const idempotencyKey = payload.idempotencyKey || generateId('idem_coll');
    const roundedRate = Math.round((Number(payload.rate) || 0) * 100) / 100;
    const roundedAmount = Math.round((Number(payload.amount) || Number(payload.quantity) * roundedRate || 0) * 100) / 100;

    const doc = {
      ...payload,
      id,
      idempotencyKey,
      rate: roundedRate,
      amount: roundedAmount,
      date: payload.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      version: 1,
      _syncStatus: 'pending',
    };

    const ledgerEntry = {
      id: generateId('ledger_cr'),
      farmerInternalId: payload.farmerInternalId,
      farmerId: payload.farmerId,
      type: 'credit',
      amount: roundedAmount,
      description: `Milk Collection (${payload.quantity}L @ ₹${roundedRate}/L, FAT ${fatVal}, SNF ${snfVal})`,
      referenceId: id,
      date: doc.date,
      balanceAfter: 0,
      dairyId: payload.dairyId || '',
      _syncStatus: 'pending',
    };

    // Atomic SQLite transaction updating collection, farmer balance, ledger, and sync queue together!
    await sqliteDb.withTransaction(async (tx) => {
      const farmer = await sqliteDb.getEntityById<any>('farmers', payload.farmerInternalId);
      if (farmer) {
        const nextBalance = Math.round(((Number(farmer.balance) || 0) + roundedAmount) * 100) / 100;
        ledgerEntry.balanceAfter = nextBalance;
        await sqliteDb.upsertEntityInTx(tx, 'farmers', { ...farmer, balance: nextBalance }, farmer._syncStatus || 'synced');
      }
      await sqliteDb.upsertEntityInTx(tx, 'collections', doc, 'pending');
      await sqliteDb.upsertEntityInTx(tx, 'ledgers', ledgerEntry, 'pending');
      await sqliteDb.enqueueSyncTaskInTx(tx, {
        id: generateId('sync'),
        type: 'CREATE_COLLECTION',
        entityType: 'collection',
        entityId: id,
        payload: doc,
        idempotencyKey,
      });
    });

    await this.recordAuditEvent({
      action: 'OFFLINE_CREATE_COLLECTION',
      targetId: id,
      targetType: 'COLLECTION',
      afterValue: doc,
      operationStatus: 'queued',
      syncStatus: 'queued_offline',
    });

    if (this.isOnline) {
      void this.triggerSyncCycle('collection_created');
    } else if (isNativeApp()) {
      void backgroundSyncBridge.scheduleImmediateSync();
    }

    return doc;
  }

  async getRecentShifts(limit: number = 10): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    const items = await sqliteDb.getAllEntities<any>('shifts');
    return [...items]
      .sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime())
      .slice(0, limit);
  }

  async getShiftSummaryOffline(dateStr: string, shift: string) {
    if (!sqliteDb.isEnabled()) return null;
    const collections = await this.getCollectionsByDate(dateStr);
    const shiftCollections = collections.filter((c) => c.shift?.toLowerCase() === shift.toLowerCase());

    const totalQty = shiftCollections.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const totalAmt = shiftCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
    const avgFat = totalQty
      ? shiftCollections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0) / totalQty
      : 0;
    const avgSnf = totalQty
      ? shiftCollections.reduce((sum, c) => sum + (c.snf || 0) * (c.quantity || 0), 0) / totalQty
      : 0;

    return {
      date: dateStr,
      shift,
      totalQty,
      totalAmt,
      avgFat,
      avgSnf,
      collectionsCount: shiftCollections.length,
      collections: shiftCollections,
    };
  }

  async getSalesCustomers(): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    return await sqliteDb.getAllEntities('sales_customers');
  }

  async addCustomerOffline(payload: any) {
    if (!sqliteDb.isEnabled()) throw new Error('Offline mode not available on web');
    const id = generateId('cust');
    const doc = {
      ...payload,
      id,
      createdAt: new Date().toISOString(),
      balance: 0,
      version: 1,
      _syncStatus: 'pending',
    };
    await sqliteDb.upsertEntity('sales_customers', doc, 'pending');
    await this.queueTask('CREATE_SALE_CUSTOMER', doc, { entityId: id });
    return doc;
  }

  async recordSaleOffline(payload: any) {
    if (!sqliteDb.isEnabled()) throw new Error('Offline mode not available on web');
    const id = generateId('sale');
    const idempotencyKey = payload.idempotencyKey || generateId('idem_sale');
    const roundedRate = Math.round((Number(payload.rate) || 0) * 100) / 100;
    const roundedAmount = Math.round((Number(payload.amount) || Number(payload.quantity) * roundedRate || 0) * 100) / 100;

    const isCredit = payload.paymentMode === 'Credit';
    const todayDue = isCredit ? roundedAmount : 0;

    const doc = {
      ...payload,
      id,
      idempotencyKey,
      rate: roundedRate,
      amount: roundedAmount,
      paymentStatus: isCredit ? 'Due' : 'Paid',
      date: payload.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      messageStatus: 'Queued',
      _syncStatus: 'pending',
    };

    await sqliteDb.withTransaction(async (tx) => {
      const customer = await sqliteDb.getEntityById<any>('sales_customers', payload.customerId);
      if (customer) {
        const updatedBalance = (Number(customer.balance) || 0) + todayDue;
        await sqliteDb.upsertEntityInTx(
          tx,
          'sales_customers',
          {
            ...customer,
            balance: updatedBalance,
            totalSales: (Number(customer.totalSales) || 0) + roundedAmount,
            totalPaid: (Number(customer.totalPaid) || 0) + (isCredit ? 0 : roundedAmount),
          },
          customer._syncStatus || 'synced'
        );
      }
      await sqliteDb.upsertEntityInTx(tx, 'sales_records', doc, 'pending');
      await sqliteDb.enqueueSyncTaskInTx(tx, {
        id: generateId('sync'),
        type: 'RECORD_SALE',
        entityType: 'sale',
        entityId: id,
        payload: doc,
        idempotencyKey,
      });
    });

    await this.recordAuditEvent({
      action: 'OFFLINE_RECORD_SALE',
      targetId: id,
      targetType: 'SALE',
      afterValue: doc,
      operationStatus: 'queued',
      syncStatus: 'queued_offline',
    });

    if (this.isOnline) {
      void this.triggerSyncCycle('sale_recorded');
    } else if (isNativeApp()) {
      void backgroundSyncBridge.scheduleImmediateSync();
    }

    return doc;
  }

  async getRecentSales(limit: number = 20): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    const items = await sqliteDb.getAllEntities<any>('sales_records');
    return [...items]
      .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
      .slice(0, limit);
  }

  async getSalesByDate(dateStr: string) {
    if (!sqliteDb.isEnabled()) return [];
    const docs = await sqliteDb.getAllEntities<any>('sales_records');
    const target = dateStr.split('T')[0];
    return docs.filter((doc) => {
      const d = typeof doc.date === 'string' ? doc.date.split('T')[0] : new Date(doc.date).toISOString().split('T')[0];
      return d === target;
    });
  }

  async getRates(): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    return await sqliteDb.getAllEntities('rates');
  }

  async getRateSettings() {
    if (sqliteDb.isEnabled()) {
      const settings = await sqliteDb.getEntityById<any>('rate_settings', 'current');
      if (settings) return settings;
    }
    return {
      id: 'current',
      fatMultiplier1: 3.96,
      snfMultiplier1: 2.64,
      maxFatForFormula1: 6.0,
      fatMultiplier2: 7.77,
      snfDeductions: {},
    };
  }

  async getLedger(): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    return await sqliteDb.getAllEntities('ledgers');
  }

  async getLedgerByFarmerId(farmerInternalId: string) {
    if (!sqliteDb.isEnabled()) return [];
    const items = await sqliteDb.getAllEntities<any>('ledgers');
    return items.filter((doc) => doc.farmerInternalId === farmerInternalId || doc.farmerId === farmerInternalId);
  }

  async recordPaymentOffline(payload: any) {
    if (!sqliteDb.isEnabled()) throw new Error('Offline mode not available on web');
    const id = generateId('payment');
    const idempotencyKey = payload.idempotencyKey || generateId('idem_pay');
    const roundedAmount = Math.round((Number(payload.amount) || 0) * 100) / 100;
    let balanceAfter = 0;

    const doc: any = {
      ...payload,
      id,
      idempotencyKey,
      type: 'debit',
      amount: roundedAmount,
      balanceAfter: 0,
      date: payload.date || new Date().toISOString(),
      _syncStatus: 'pending',
    };

    await sqliteDb.withTransaction(async (tx) => {
      const farmer = await sqliteDb.getEntityById<any>('farmers', payload.farmerInternalId);
      if (farmer) {
        balanceAfter = Math.round(((Number(farmer.balance) || 0) - roundedAmount) * 100) / 100;
        doc.balanceAfter = balanceAfter;
        await sqliteDb.upsertEntityInTx(tx, 'farmers', { ...farmer, balance: balanceAfter }, farmer._syncStatus || 'synced');
      }
      await sqliteDb.upsertEntityInTx(tx, 'ledgers', doc, 'pending');
      await sqliteDb.enqueueSyncTaskInTx(tx, {
        id: generateId('sync'),
        type: 'RECORD_PAYMENT',
        entityType: 'payment',
        entityId: id,
        payload: doc,
        idempotencyKey,
      });
    });

    await this.recordAuditEvent({
      action: 'OFFLINE_RECORD_PAYMENT',
      targetId: id,
      targetType: 'PAYMENT',
      afterValue: doc,
      operationStatus: 'queued',
      syncStatus: 'queued_offline',
    });

    if (this.isOnline) {
      void this.triggerSyncCycle('payment_recorded');
    } else if (isNativeApp()) {
      void backgroundSyncBridge.scheduleImmediateSync();
    }

    return doc;
  }

  async recordCustomerPaymentOffline(payload: any) {
    if (!sqliteDb.isEnabled()) throw new Error('Offline mode not available on web');
    const id = generateId('cust_pay');
    const idempotencyKey = payload.idempotencyKey || generateId('idem_cpay');
    const roundedAmount = Math.round((Number(payload.amount) || 0) * 100) / 100;

    const doc = {
      ...payload,
      id,
      idempotencyKey,
      amount: roundedAmount,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      _syncStatus: 'pending',
    };

    await sqliteDb.withTransaction(async (tx) => {
      const customer = await sqliteDb.getEntityById<any>('sales_customers', payload.customerId);
      if (customer) {
        await sqliteDb.upsertEntityInTx(
          tx,
          'sales_customers',
          {
            ...customer,
            balance: (Number(customer.balance) || 0) - roundedAmount,
            totalPaid: (Number(customer.totalPaid) || 0) + roundedAmount,
          },
          customer._syncStatus || 'synced'
        );
      }
      await sqliteDb.upsertEntityInTx(tx, 'customer_payments', doc, 'pending');
      await sqliteDb.enqueueSyncTaskInTx(tx, {
        id: generateId('sync'),
        type: 'RECORD_CUSTOMER_PAYMENT',
        entityType: 'payment',
        entityId: id,
        payload: doc,
        idempotencyKey,
      });
    });

    await this.recordAuditEvent({
      action: 'OFFLINE_RECORD_CUSTOMER_PAYMENT',
      targetId: id,
      targetType: 'CUSTOMER_PAYMENT',
      afterValue: doc,
      operationStatus: 'queued',
      syncStatus: 'queued_offline',
    });

    if (this.isOnline) {
      void this.triggerSyncCycle('customer_payment_recorded');
    } else if (isNativeApp()) {
      void backgroundSyncBridge.scheduleImmediateSync();
    }

    return doc;
  }

  async getCustomerHistoryOffline(customerId: string): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    try {
      const sales = await sqliteDb.getAllEntities<any>('sales_records');
      const payments = await sqliteDb.getAllEntities<any>('customer_payments');

      const filteredSales = sales.filter((s) => s.customerId === customerId);
      const filteredPayments = payments.filter((p) => p.customerId === customerId);

      const history = [
        ...filteredSales.map((s) => ({ ...s, entryType: 'sale' })),
        ...filteredPayments.map((p) => ({
          ...p,
          entryType: 'payment',
          date: p.date || p.timestamp || p.createdAt,
        })),
      ];

      return history.sort(
        (a, b) => new Date(b.date || b.timestamp || b.createdAt).getTime() - new Date(a.date || a.timestamp || a.createdAt).getTime()
      );
    } catch (e) {
      console.error('Failed to get customer offline history', e);
      return [];
    }
  }

  async getUsers(): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    return await sqliteDb.getAllEntities('users');
  }

  async getDairies(): Promise<any[]> {
    if (!sqliteDb.isEnabled()) return [];
    return await sqliteDb.getAllEntities('dairies');
  }

  async getBillsOffline(year: number, month: number, period: number, farmerId?: string) {
    if (!sqliteDb.isEnabled()) return [];
    const farmers = await this.getFarmers();
    const collections = await sqliteDb.getAllEntities<any>('collections');
    return this.calculateBills(farmers, collections, year, month, period, farmerId);
  }

  public calculateBills(farmers: any[], collections: any[], year: number, month: number, period: number, farmerId?: string) {
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

    const billsMap = new Map<string, any>();
    collections.forEach((c) => {
      const d = typeof c.date === 'string' ? c.date.split('T')[0] : new Date(c.date).toISOString().split('T')[0];
      if (d < startCompare || d > endCompare) return;

      const fId = c.farmerInternalId || c.farmerId;
      if (!fId || (farmerId && fId !== farmerId)) return;

      if (!billsMap.has(fId)) {
        const f = farmers.find((item) => item.id === fId || item.farmerId === fId);
        billsMap.set(fId, {
          id: f?.id || fId,
          farmerId: f?.farmerId || 'Unknown',
          farmerName: f?.name || 'Unknown',
          village: f?.village || '',
          quantity: 0,
          totalQuantity: 0,
          amount: 0,
          fatSum: 0,
          snfSum: 0,
          count: 0,
          startDate: startCompare,
          endDate: endCompare,
          collections: [],
        });
      }
      const b = billsMap.get(fId);
      b.quantity += c.quantity || 0;
      b.totalQuantity += c.quantity || 0;
      b.amount += c.amount || 0;
      b.fatSum += (c.fat || 0) * (c.quantity || 0);
      b.snfSum += (c.snf || 0) * (c.quantity || 0);
      b.count++;
      b.collections.push(c);
    });

    return Array.from(billsMap.values()).map((b) => ({
      ...b,
      totalQuantity: Math.round(b.totalQuantity * 100) / 100,
      amount: Math.round(b.amount * 100) / 100,
      avgFat: b.quantity ? Math.round((b.fatSum / b.quantity) * 100) / 100 : 0,
      avgSnf: b.quantity ? Math.round((b.snfSum / b.quantity) * 100) / 100 : 0,
    }));
  }

  async getDashboardOffline(days: number = 7) {
    if (!sqliteDb.isEnabled()) return null;
    const farmers = await this.getFarmers();
    const collections = await sqliteDb.getAllEntities<any>('collections');
    const todayStr = new Date().toISOString().split('T')[0];

    const today = collections.filter((c) => {
      const d = typeof c.date === 'string' ? c.date.split('T')[0] : new Date(c.date).toISOString().split('T')[0];
      return d === todayStr;
    });

    const qty = today.reduce((s, c) => s + (c.quantity || 0), 0);
    const morning = today.filter((c) => c.shift?.toLowerCase() === 'morning').reduce((s, c) => s + (c.quantity || 0), 0);
    const evening = today.filter((c) => c.shift?.toLowerCase() === 'evening').reduce((s, c) => s + (c.quantity || 0), 0);
    const amount = today.reduce((s, c) => s + (c.amount || 0), 0);
    const fat = qty ? today.reduce((s, c) => s + (c.fat || 0) * (c.quantity || 0), 0) / qty : 0;
    const snf = qty ? today.reduce((s, c) => s + (c.snf || 0) * (c.quantity || 0), 0) / qty : 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const trendData = collections.filter((c) => new Date(c.date) >= cutoffDate);

    return {
      todayQty: Math.round(qty * 100) / 100,
      morningQty: Math.round(morning * 100) / 100,
      eveningQty: Math.round(evening * 100) / 100,
      todayAmount: Math.round(amount * 100) / 100,
      avgFat: Math.round(fat * 100) / 100,
      avgSnf: Math.round(snf * 100) / 100,
      totalFarmers: farmers.length,
      recentTxns: collections.slice(0, 10),
      trendData,
    };
  }
}

export const offlineService = new OfflineService();
