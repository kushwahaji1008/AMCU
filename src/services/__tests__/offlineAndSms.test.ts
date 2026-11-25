import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';

vi.mock('capacitor-sms-sender', () => ({
  SmsSender: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    send: vi.fn(),
    addListener: vi.fn(),
    removeAllListeners: vi.fn(),
    getAvailableSims: vi.fn(),
  },
}));

import { SmsSender } from 'capacitor-sms-sender';
import { sqliteDb, SQLiteDriverAdapter, SQLITE_MIGRATIONS } from '../sqliteDatabase';
import { offlineService } from '../offlineService';
import { smsService } from '../smsService';
import axiosInstance from '../axiosInstance';
import { farmerApi, authApi, clearApiCache } from '../api';

class InMemorySQLiteDriver implements SQLiteDriverAdapter {
  public tables = new Map<string, any[]>();
  private snapshot: Map<string, any[]> | null = null;
  public executedDdl: string[] = [];

  private ensureTable(name: string): any[] {
    if (!this.tables.has(name)) {
      this.tables.set(name, []);
    }
    return this.tables.get(name)!;
  }

  async execute(statements: string): Promise<any> {
    this.executedDdl.push(statements);
    const regex = /CREATE TABLE IF NOT EXISTS\s+(\w+)/gi;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(statements)) !== null) {
      this.ensureTable(m[1]);
    }
    return { changes: { changes: 0 } };
  }

  async beginTransaction(): Promise<any> {
    this.snapshot = new Map(
      Array.from(this.tables.entries()).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])
    );
    return { changes: { changes: 0 } };
  }

  async commitTransaction(): Promise<any> {
    this.snapshot = null;
    return { changes: { changes: 0 } };
  }

  async rollbackTransaction(): Promise<any> {
    if (this.snapshot) {
      this.tables = this.snapshot;
      this.snapshot = null;
    }
    return { changes: { changes: 0 } };
  }

  async run(statement: string, values: any[] = []): Promise<any> {
    const sql = statement.trim();
    const insertMatch = sql.match(
      /^INSERT\s+(?:OR\s+(REPLACE|IGNORE)\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
    );
    if (insertMatch) {
      const mode = (insertMatch[1] || '').toUpperCase();
      const table = insertMatch[2];
      const cols = insertMatch[3].split(',').map((s) => s.trim());
      const placeholderTokens = insertMatch[4].split(',').map((s) => s.trim());
      const row: Record<string, any> = {};
      let vIdx = 0;
      cols.forEach((col, i) => {
        const tok = placeholderTokens[i];
        if (tok === '?') row[col] = values[vIdx++];
        else if (tok === 'NULL') row[col] = null;
        else if (/^\d+$/.test(tok)) row[col] = Number(tok);
        else row[col] = tok.replace(/^'|'$/g, '');
      });

      const rows = this.ensureTable(table);
      const pkCol = table === 'audit_outbox' ? 'log_id' : table === 'kv_metadata' ? 'key' : 'id';
      const uniqueCol = table === 'sms_queue' ? 'idempotency_key' : null;
      const existingIdx = rows.findIndex(
        (r) => r[pkCol] === row[pkCol] || (uniqueCol && r[uniqueCol] === row[uniqueCol])
      );

      if (existingIdx >= 0) {
        if (mode === 'IGNORE') return { changes: { changes: 0 } };
        rows[existingIdx] = row;
      } else {
        rows.push(row);
      }
      return { changes: { changes: 1 } };
    }

    const delMatch = sql.match(/^DELETE FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
    if (delMatch) {
      const table = delMatch[1];
      const where = delMatch[2];
      const rows = this.ensureTable(table);
      if (!where) {
        this.tables.set(table, []);
        return { changes: { changes: rows.length } };
      }
      if (/id = \? AND sync_status = 'synced'/i.test(where)) {
        this.tables.set(
          table,
          rows.filter((r) => !(r.id === values[0] && r.sync_status === 'synced'))
        );
      } else if (/^id = \?/i.test(where)) {
        this.tables.set(
          table,
          rows.filter((r) => r.id !== values[0])
        );
      }
      return { changes: { changes: 1 } };
    }

    const updMatch = sql.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
    if (updMatch) {
      const table = updMatch[1];
      const setPairs = updMatch[2].split(',').map((p) => p.trim());
      const whereClause = updMatch[3].trim();
      const rows = this.ensureTable(table);
      let vIdx = 0;
      const updates: Record<string, any> = {};
      for (const pair of setPairs) {
        const [col, valExpr] = pair.split('=').map((s) => s.trim());
        if (valExpr === '?') updates[col] = values[vIdx++];
        else if (/^'[^']*'$/.test(valExpr)) updates[col] = valExpr.slice(1, -1);
        else if (/^\d+$/.test(valExpr)) updates[col] = Number(valExpr);
      }
      const whereCol = whereClause.split('=')[0].trim();
      const whereVal = values[vIdx];
      rows.forEach((r, i) => {
        if (r[whereCol] === whereVal) {
          rows[i] = { ...r, ...updates };
        }
      });
      return { changes: { changes: 1 } };
    }

    return { changes: { changes: 0 } };
  }

  async query(statement: string, values: any[] = []): Promise<{ values?: any[] }> {
    const sql = statement.trim();
    const countMatch = sql.match(/^SELECT COUNT\(\*\) AS cnt FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
    if (countMatch) {
      const rows = this.ensureTable(countMatch[1]);
      const where = countMatch[2] || '';
      let filtered = rows;
      if (/status IN \('pending', 'in_progress'\)/.test(where)) {
        filtered = rows.filter((r) => r.status === 'pending' || r.status === 'in_progress');
      } else if (/status = 'failed'/.test(where)) {
        filtered = rows.filter((r) => r.status === 'failed');
      } else if (/status = 'unresolved'/.test(where)) {
        filtered = rows.filter((r) => r.status === 'unresolved');
      } else if (/status = 'queued'/.test(where)) {
        filtered = rows.filter((r) => r.status === 'queued');
      } else if (/synced = 0/.test(where)) {
        filtered = rows.filter((r) => r.synced === 0);
      }
      return { values: [{ cnt: filtered.length }] };
    }

    const fromMatch = sql.match(/FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(\d+|\?))?$/i);
    if (!fromMatch) return { values: [] };
    const table = fromMatch[1];
    const where = fromMatch[2] || '';
    let rows = [...this.ensureTable(table)];

    if (where) {
      if (/id = \? OR idempotency_key = \? OR provider_message_id = \?/.test(where)) {
        rows = rows.filter(
          (r) => r.id === values[0] || r.idempotency_key === values[1] || r.provider_message_id === values[2]
        );
      } else if (/status IN \('pending', 'failed', 'in_progress'\) AND next_retry_at <= \?/.test(where)) {
        rows = rows.filter(
          (r) => ['pending', 'failed', 'in_progress'].includes(r.status) && Number(r.next_retry_at) <= values[0]
        );
      } else if (/status IN \('queued', 'failed'\) AND attempts < 3 AND next_retry_at <= \?/.test(where)) {
        rows = rows.filter(
          (r) =>
            ['queued', 'failed'].includes(r.status) && Number(r.attempts) < 3 && Number(r.next_retry_at) <= values[0]
        );
      } else if (/synced = 0/.test(where)) {
        rows = rows.filter((r) => Number(r.synced) === 0);
      } else if (/synced_to_server = 0/.test(where)) {
        rows = rows.filter((r) => Number(r.synced_to_server) === 0);
      } else {
        const simpleEq = where.match(/^(\w+)\s*=\s*\?/);
        if (simpleEq) {
          rows = rows.filter((r) => r[simpleEq[1]] === values[0]);
        }
      }
    }

    if (fromMatch[3]) {
      const desc = /DESC/i.test(fromMatch[3]);
      const col = fromMatch[3].replace(/\s+(ASC|DESC)/i, '').trim();
      rows.sort((a, b) => (desc ? Number(b[col]) - Number(a[col]) : Number(a[col]) - Number(b[col])));
    }

    return { values: rows.map((r) => ({ ...r })) };
  }
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k) {
      return store.get(k) ?? null;
    },
    key(i) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k) {
      store.delete(k);
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
  };
}

describe('Platform Isolation, Android SQLite Sync, Conflict & SMS Engine Tests', () => {
  let driver: InMemorySQLiteDriver;
  let originalAdapter: any;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('window', {
      location: { pathname: '/', href: '' },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    clearApiCache();
    driver = new InMemorySQLiteDriver();
    originalAdapter = axiosInstance.defaults.adapter;
  });

  afterEach(() => {
    sqliteDb.setTestDriver(null);
    axiosInstance.defaults.adapter = originalAdapter;
    offlineService.isOnline = true;
    vi.restoreAllMocks();
  });

  it('strictly disables SQLite, offline queues, offline auth, and simulates SMS cleanly on Website', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    sqliteDb.setTestDriver(null);

    expect(await sqliteDb.init()).toBe(false);
    expect(await sqliteDb.getAllEntities('farmers')).toEqual([]);

    offlineService.isOnline = false;
    await expect(authApi.login({ username: 'admin', password: 'pw' })).rejects.toThrow(
      'You must be online to log in from a web browser.'
    );

    offlineService.isOnline = true;
    let calledPost = false;
    axiosInstance.defaults.adapter = async (config) => {
      if (config.method === 'post' && config.url === '/farmers') {
        calledPost = true;
        return { data: { id: 'web_f1', name: 'Web Farmer' }, status: 201, statusText: 'Created', headers: {}, config };
      }
      throw new Error(`Unexpected: ${config.url}`);
    };
    const res = await farmerApi.create({
      farmerId: '999',
      name: 'Web Farmer',
      mobile: '9999999999',
      village: 'A',
      cattleType: 'Cow',
    });
    expect(calledPost).toBe(true);
    expect(res.data.id).toBe('web_f1');

    const smsRes = await smsService.sendDirectSMS('9876543210', 'Test SMS on Web');
    expect(smsRes.simulated).toBe(true);
    expect(smsRes.status).toBe('simulated');
  });

  it('runs SQLite migrations, rolls back failed atomic transactions, remaps temp IDs in FIFO sync, and handles backoff + 409 conflicts', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    sqliteDb.setTestDriver(driver);
    await sqliteDb.init();

    expect(SQLITE_MIGRATIONS.map((m) => m.toVersion)).toEqual([1, 2]);
    for (const tbl of ['farmers', 'collections', 'sync_queue', 'sync_conflicts', 'sms_queue', 'audit_outbox']) {
      expect(driver.tables.has(tbl)).toBe(true);
    }

    await sqliteDb.upsertEntity(
      'farmers',
      { id: 'f_real', farmerId: '101', name: 'Hari', balance: 100, version: 1 },
      'synced'
    );
    await expect(
      sqliteDb.withTransaction(async (tx) => {
        await sqliteDb.upsertEntityInTx(
          tx,
          'farmers',
          { id: 'f_real', farmerId: '101', name: 'Hari', balance: 999, version: 1 },
          'synced'
        );
        throw new Error('Simulated crash mid-transaction');
      })
    ).rejects.toThrow('Simulated crash mid-transaction');
    const intact = await sqliteDb.getEntityById<any>('farmers', 'f_real');
    expect(intact.balance).toBe(100);

    // Simulate offline work without triggering premature auto-sync
    offlineService.isOnline = false;
    localStorage.setItem('token', 'valid-jwt');
    await sqliteDb.upsertEntity(
      'farmers',
      { id: 'temp_f1', farmerId: '501', name: 'Offline Farmer', mobile: '9999988888', village: 'B', cattleType: 'Cow', balance: 0, version: 1 },
      'pending'
    );
    await offlineService.queueTask(
      'CREATE_FARMER',
      { id: 'temp_f1', farmerId: '501', name: 'Offline Farmer', mobile: '9999988888', village: 'B', cattleType: 'Cow' },
      { entityId: 'temp_f1' }
    );

    const offlineColl = await offlineService.recordCollectionOffline({
      farmerInternalId: 'temp_f1',
      farmerId: '501',
      farmerName: 'Offline Farmer',
      shift: 'Morning',
      quantity: 10,
      fat: 4.5,
      snf: 8.5,
      rate: 45,
      amount: 450,
    });
    expect(offlineColl.id).toBeTruthy();

    // Reconnect and fail 503 on parent -> dependent collection must be skipped in this pass
    offlineService.isOnline = true;
    const callOrder: string[] = [];
    axiosInstance.defaults.adapter = async (config) => {
      callOrder.push(`${config.method}:${config.url}`);
      return Promise.reject({ response: { status: 503, data: { message: 'Service Unavailable' } }, config });
    };
    const failPass = await offlineService.processSyncQueue(true);
    expect(failPass.failed).toBe(1);
    expect(callOrder).toEqual(['post:/farmers']);

    // Retry succeeds: parent temp_f1 remapped to srv_f_501 on dependent collection
    const syncedBodies: any[] = [];
    axiosInstance.defaults.adapter = async (config) => {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      syncedBodies.push({ url: config.url, headers: config.headers, body });
      if (config.url === '/farmers') {
        return {
          data: { id: 'srv_f_501', farmerId: '501', name: 'Offline Farmer', version: 1 },
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
        };
      }
      if (config.url === '/collections') {
        return {
          data: { id: 'srv_c_1', farmerInternalId: body.farmerInternalId, amount: 450, version: 1 },
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
        };
      }
      if (config.url === '/audit/sync') {
        return { data: { success: true, acceptedIds: body.logs.map((l: any) => l.logId) }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    const okPass = await offlineService.processSyncQueue(true);
    expect(okPass.synced).toBe(2);
    expect(syncedBodies[0].headers['Idempotency-Key']).toBeTruthy();
    expect(syncedBodies[1].url).toBe('/collections');
    expect(syncedBodies[1].body.farmerInternalId).toBe('srv_f_501');

    // 409 Conflict captured without silent overwrite
    offlineService.isOnline = false;
    await offlineService.queueTask(
      'UPDATE_FARMER',
      { id: 'f_real', data: { name: 'Hari Offline' } },
      { entityId: 'f_real', baseVersion: 1 }
    );
    offlineService.isOnline = true;
    axiosInstance.defaults.adapter = async (config) => {
      return Promise.reject({
        response: {
          status: 409,
          data: {
            message: 'Sync conflict',
            details: {
              conflictId: 'srv_conf_1',
              serverRecord: { id: 'f_real', name: 'Hari Server', version: 2 },
              serverVersion: 2,
              localVersion: 1,
            },
          },
        },
        config,
      });
    };
    const confPass = await offlineService.processSyncQueue(true);
    expect(confPass.conflicts).toBe(1);
    const localConflicts = await sqliteDb.getConflicts('unresolved');
    expect(localConflicts).toHaveLength(1);

    axiosInstance.defaults.adapter = async (config) => ({
      data: { success: true, appliedRecord: { id: 'f_real', name: 'Hari Server', version: 2 } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
    await offlineService.resolveConflictOffline(localConflicts[0].id, 'keep_server');
    expect(await sqliteDb.getConflicts('unresolved')).toHaveLength(0);
  });

  it('queues, deduplicates, handles permissions, and tracks Unicode multipart SMS delivery on native Android', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    sqliteDb.setTestDriver(driver);
    await sqliteDb.init();

    vi.mocked(SmsSender.checkPermissions).mockResolvedValue({
      send_sms: 'granted',
      read_phone_state: 'denied',
    } as any);
    let statusCallback: ((res: any) => void) | undefined;
    vi.mocked(SmsSender.addListener).mockImplementation(((_ev: any, cb: any) => {
      statusCallback = cb;
      return Promise.resolve({ remove: async () => {} }) as any;
    }) as any);
    vi.mocked(SmsSender.send).mockImplementation(async (opts) => ({ id: opts.id, status: 'PENDING' }));

    axiosInstance.defaults.adapter = async (config) => ({ data: {}, status: 201, statusText: 'OK', headers: {}, config });

    const unicodeMsg = 'नमस्ते किसान भाई, आपका दूध 12.5L दर्ज किया गया। कुल राशि ₹562.50 - DugdhaSetu';
    const firstSend = await smsService.sendDirectSMS('9876543210', unicodeMsg, {
      recipientType: 'farmer',
      recipientId: 'f1',
      recipientName: 'Ramesh',
      triggerType: 'milk_collection',
      idempotencyKey: 'sms_dedupe_key_1',
    });
    expect(firstSend.success).toBe(true);
    expect(firstSend.status).toBe('submitted');
    expect(SmsSender.send).toHaveBeenCalledTimes(1);

    const dupSend = await smsService.sendDirectSMS('9876543210', unicodeMsg, {
      idempotencyKey: 'sms_dedupe_key_1',
    });
    expect(dupSend.message).toContain('deduplicated');
    expect(SmsSender.send).toHaveBeenCalledTimes(1);

    const sentNumericId = vi.mocked(SmsSender.send).mock.calls[0][0].id;
    statusCallback?.({ id: sentNumericId, status: 'DELIVERED' });
    await new Promise((r) => setTimeout(r, 20));
    const history = await smsService.getLocalSmsHistory();
    expect(history[0].status).toBe('delivered');
  });
});
