import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { createBackendApp } from '../index';

async function httpCall(
  server: http.Server,
  method: string,
  path: string,
  options: { body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; headers: Headers }> {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server not bound');
  const res = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON
  }
  return { status: res.status, body, headers: res.headers };
}

describe('Offline Sync Idempotency, Conflict Resolution & Superadmin Audit Tests', () => {
  let server: http.Server;
  let farmersStore: any[];
  let collectionsStore: any[];
  let conflictsStore: any[];
  let idempotencyStore: Map<string, any>;
  let activityLogsStore: any[];
  let loginLogsStore: any[];
  let smsLogsStore: any[];

  beforeEach(async () => {
    farmersStore = [
      {
        id: 'f1',
        farmerId: '101',
        farmerCode: '101',
        name: 'Ramesh Kumar',
        mobile: '9876543210',
        village: 'Rampur',
        cattleType: 'Cow',
        balance: 500,
        status: 'Active',
        version: 2,
        dairyId: 'dairy-a',
      },
    ];
    collectionsStore = [];
    conflictsStore = [];
    idempotencyStore = new Map();
    activityLogsStore = [];
    loginLogsStore = [];
    smsLogsStore = [];

    const mockAuth = (req: any, _res: any, next: any) => {
      const role = (req.headers['x-test-role'] as any) || 'admin';
      const userId = (req.headers['x-test-userid'] as string) || 'u_admin';
      const username = (req.headers['x-test-username'] as string) || 'admin_a';
      req.user = {
        id: userId,
        username,
        role,
        databaseId: 'dairy-a',
        dairyId: 'dairy-a',
      };
      next();
    };

    const farmerRepo = {
      getById: async (id: string) => farmersStore.find((f) => f.id === id) || null,
      getByFarmerId: async (fid: string) => farmersStore.find((f) => f.farmerId === fid) || null,
      getAll: async () => farmersStore,
      create: async (f: any) => {
        const created = { id: `f_${farmersStore.length + 1}`, createdAt: new Date(), version: 1, ...f };
        farmersStore.push(created);
        return created;
      },
      update: async (id: string, patch: any) => {
        const idx = farmersStore.findIndex((f) => f.id === id);
        if (idx === -1) throw new Error('Not found');
        farmersStore[idx] = {
          ...farmersStore[idx],
          ...patch,
          version: (farmersStore[idx].version ?? 1) + 1,
          updatedAt: new Date(),
        };
        return farmersStore[idx];
      },
      delete: async () => {},
      getSummary: async () => ({ totalMilkSupplied: 0, totalEarnings: 0, totalPaid: 0, pendingAmount: 0 }),
      getCount: async () => farmersStore.length,
      getTotalBalance: async () => 0,
    };

    const collectionRepo = {
      getById: async (id: string) => collectionsStore.find((c) => c.id === id) || null,
      getAll: async () => collectionsStore,
      create: async (c: any) => {
        const created = { id: `c_${collectionsStore.length + 1}`, createdAt: new Date(), version: 1, ...c };
        collectionsStore.push(created);
        return created;
      },
      getDailyReport: async () => [],
      getRecent: async () => [],
      getTrend: async () => [],
      update: async (id: string, patch: any) => {
        const idx = collectionsStore.findIndex((c) => c.id === id);
        collectionsStore[idx] = { ...collectionsStore[idx], ...patch, version: (collectionsStore[idx].version ?? 1) + 1 };
        return collectionsStore[idx];
      },
      getByFarmerInternalId: async () => [],
      findDuplicatePour: async (fid: string, _date: any, shift: string) =>
        collectionsStore.find((c) => c.farmerInternalId === fid && c.shift === shift) || null,
    };

    const idempotencyRepo = {
      getByKey: async (key: string) => idempotencyStore.get(key) || null,
      acquire: async (key: string, method: string, path: string, requestHash: string, userId?: string) => {
        const existing = idempotencyStore.get(key);
        if (!existing) {
          idempotencyStore.set(key, { key, method, path, requestHash, userId, status: 'in_progress' });
          return 'acquired';
        }
        if (existing.requestHash !== requestHash) return 'hash_mismatch';
        return existing.status === 'completed' ? 'completed' : 'in_progress';
      },
      complete: async (key: string, responseStatus: number, responseBody: any) => {
        const existing = idempotencyStore.get(key);
        if (existing) {
          existing.status = 'completed';
          existing.responseStatus = responseStatus;
          existing.responseBody = responseBody;
        }
      },
      release: async (key: string) => {
        const existing = idempotencyStore.get(key);
        if (existing && existing.status === 'in_progress') {
          idempotencyStore.delete(key);
        }
      },
    };

    const conflictRepo = {
      create: async (c: any) => {
        const created = { id: `conf_${conflictsStore.length + 1}`, createdAt: new Date(), ...c };
        conflictsStore.push(created);
        return created;
      },
      getById: async (id: string) => conflictsStore.find((c) => c.id === id) || null,
      getAll: async (status?: string) => (status ? conflictsStore.filter((c) => c.status === status) : conflictsStore),
      resolve: async (id: string, status: any, resolvedBy: string) => {
        const c = conflictsStore.find((item) => item.id === id);
        c.status = status;
        c.resolvedBy = resolvedBy;
        c.resolvedAt = new Date();
        return c;
      },
    };

    const activityRepo = {
      create: async (log: any) => {
        const created = { id: `act_${activityLogsStore.length + 1}`, ...log };
        activityLogsStore.push(created);
        return created;
      },
      createManyIdempotent: async (logs: any[]) => {
        let inserted = 0;
        let deduplicated = 0;
        const acceptedIds: string[] = [];
        for (const log of logs) {
          if (log.logId && activityLogsStore.some((x) => x.logId === log.logId)) {
            deduplicated++;
            acceptedIds.push(log.logId);
            continue;
          }
          activityLogsStore.push({ id: `act_${activityLogsStore.length + 1}`, ...log });
          inserted++;
          if (log.logId) acceptedIds.push(log.logId);
        }
        return { inserted, deduplicated, acceptedIds };
      },
      getAll: async (limit = 200) => activityLogsStore.slice(-limit).reverse(),
      getById: async (id: string) => activityLogsStore.find((l) => l.id === id || l.logId === id) || null,
      getFiltered: async (filter: any) => {
        let items = [...activityLogsStore];
        if (filter.action) items = items.filter((i) => String(i.action).includes(filter.action));
        if (filter.status) items = items.filter((i) => i.operationStatus === filter.status);
        if (filter.syncStatus) items = items.filter((i) => i.syncStatus === filter.syncStatus);
        if (filter.search) {
          const q = filter.search.toLowerCase();
          items = items.filter((i) => JSON.stringify(i).toLowerCase().includes(q));
        }
        const page = filter.page || 1;
        const limit = filter.limit || 50;
        const total = items.length;
        const paged = items.reverse().slice((page - 1) * limit, page * limit);
        return { items: paged, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
      },
    };

    const auditRepo = {
      create: async (a: any) => {
        const created = { id: `login_${loginLogsStore.length + 1}`, ...a };
        loginLogsStore.push(created);
        return created;
      },
      getAll: async () => loginLogsStore,
      getFiltered: async (filter: any) => ({
        items: loginLogsStore,
        total: loginLogsStore.length,
        page: filter.page || 1,
        limit: filter.limit || 50,
        totalPages: 1,
      }),
      getByUserId: async () => [],
    };

    const smsLogRepo = {
      upsertByIdempotencyKey: async (log: any) => {
        const idx = smsLogsStore.findIndex((s) => s.idempotencyKey === log.idempotencyKey);
        if (idx >= 0) {
          smsLogsStore[idx] = { ...smsLogsStore[idx], ...log };
          return smsLogsStore[idx];
        }
        const created = { id: `sms_${smsLogsStore.length + 1}`, ...log };
        smsLogsStore.push(created);
        return created;
      },
      getAll: async (filter: any = {}) =>
        smsLogsStore.filter((s) => (!filter.status || s.status === filter.status)),
      getByIdempotencyKey: async (key: string) => smsLogsStore.find((s) => s.idempotencyKey === key) || null,
    };

    const app = createBackendApp({
      farmerRepo: farmerRepo as any,
      collectionRepo: collectionRepo as any,
      rateChartRepo: { getRate: async () => 45, getAll: async () => [] } as any,
      ledgerRepo: {
        addEntry: async (e) => ({ id: 'l1', ...e }),
        getAll: async () => [],
        getByFarmerInternalId: async () => [],
        getByReferenceId: async () => null,
      } as any,
      customerRepo: { getAll: async () => [], getById: async () => null } as any,
      saleRepo: { getAll: async () => [], getRecent: async () => [], getDailyReport: async () => [], getByCustomerId: async () => [] } as any,
      paymentRepo: { getRecent: async () => [] } as any,
      userRepo: { getAll: async () => [] } as any,
      dairyRepo: { getAll: async () => [] } as any,
      settingsRepo: { get: async () => ({}) } as any,
      shiftSummaryRepo: { getRecent: async () => [], getByDateAndShift: async () => null } as any,
      auditRepo: auditRepo as any,
      activityRepo: activityRepo as any,
      idempotencyRepo: idempotencyRepo as any,
      conflictRepo: conflictRepo as any,
      smsLogRepo: smsLogRepo as any,
      authMiddleware: mockAuth as any,
      disableRateLimit: true,
    });

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('replays identical responses on repeated Idempotency-Key and rejects mismatched payloads', async () => {
    const payload = {
      farmerId: '202',
      name: 'Sita Devi',
      mobile: '9876500001',
      village: 'Mathura',
      cattleType: 'Buffalo',
    };

    const first = await httpCall(server, 'POST', '/api/farmers', {
      headers: { 'Idempotency-Key': 'idem_farmer_202' },
      body: payload,
    });
    expect(first.status).toBe(201);
    expect(farmersStore).toHaveLength(2);

    const replay = await httpCall(server, 'POST', '/api/farmers', {
      headers: { 'Idempotency-Key': 'idem_farmer_202' },
      body: payload,
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get('X-Idempotent-Replay')).toBe('true');
    expect(replay.body.id).toBe(first.body.id);
    expect(farmersStore).toHaveLength(2);

    const tampered = await httpCall(server, 'POST', '/api/farmers', {
      headers: { 'Idempotency-Key': 'idem_farmer_202' },
      body: { ...payload, name: 'Different Name' },
    });
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });

  it('detects version mismatches, prevents silent overwrite, and resolves conflicts via apply_local and merged', async () => {
    // Client has stale v1 while server holds v2
    const staleUpdate = await httpCall(server, 'PUT', '/api/farmers/f1', {
      headers: { 'X-Expected-Version': '1' },
      body: { name: 'Ramesh Offline', village: 'Gokul' },
    });
    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.code).toBe('VERSION_CONFLICT');
    expect(staleUpdate.body.details.serverVersion).toBe(2);
    expect(farmersStore[0].name).toBe('Ramesh Kumar');
    expect(conflictsStore).toHaveLength(1);

    const conflictId = staleUpdate.body.details.conflictId;
    const resolved = await httpCall(server, 'POST', `/api/sync/conflicts/${conflictId}/resolve`, {
      body: {
        resolution: 'merged',
        mergedData: { name: 'Ramesh Merged', village: 'Gokul' },
      },
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.appliedRecord.name).toBe('Ramesh Merged');
    expect(resolved.body.appliedRecord.version).toBe(3);
    expect(conflictsStore[0].status).toBe('resolved_merged');
  });

  it('logs offline duplicate pours as sync conflicts instead of silent failure', async () => {
    const first = await httpCall(server, 'POST', '/api/collections', {
      body: { farmerInternalId: 'f1', quantity: 5, fat: 4.5, snf: 8.5, shift: 'Morning' },
    });
    expect(first.status).toBe(201);

    const offlineDup = await httpCall(server, 'POST', '/api/collections', {
      headers: { 'X-Offline-Sync': 'true' },
      body: { farmerInternalId: 'f1', quantity: 6, fat: 4.5, snf: 8.5, shift: 'Morning' },
    });
    expect(offlineDup.status).toBe(409);
    expect(offlineDup.body.code).toBe('DUPLICATE_POUR');
    expect(offlineDup.body.details.conflictId).toBeTruthy();
    expect(conflictsStore.some((c) => c.entityType === 'collection')).toBe(true);
  });

  it('enforces strict superadmin RBAC, immutability (405), secret redaction, filtering, pagination, and audit sync', async () => {
    // Non-superadmin blocked on audit log routes
    const adminBlocked = await httpCall(server, 'GET', '/api/admin/activity-logs', {
      headers: { 'x-test-role': 'admin' },
    });
    expect(adminBlocked.status).toBe(403);

    const opBlocked = await httpCall(server, 'GET', '/api/admin/login-logs', {
      headers: { 'x-test-role': 'operator' },
    });
    expect(opBlocked.status).toBe(403);

    // Tamper prevention on audit log endpoints
    const deleteBlocked = await httpCall(server, 'DELETE', '/api/admin/activity-logs/1', {
      headers: { 'x-test-role': 'super_admin' },
    });
    expect(deleteBlocked.status).toBe(405);
    expect(deleteBlocked.body.code).toBe('AUDIT_IMMUTABLE');

    // Sync offline audit batch twice with duplicate logId + spoofed user attempt
    const syncRes1 = await httpCall(server, 'POST', '/api/audit/sync', {
      headers: { 'x-test-role': 'operator', 'x-test-userid': 'u_real_op', 'x-test-username': 'real_op' },
      body: {
        logs: [
          {
            logId: 'offline_log_1',
            userId: 'spoofed_superadmin',
            username: 'spoofed',
            action: 'OFFLINE_CREATE_COLLECTION',
            details: { password: 'should_be_redacted', amount: 180 },
            operationStatus: 'queued',
          },
          {
            logId: 'offline_log_2',
            action: 'OFFLINE_LOGIN_SUCCESS',
            operationStatus: 'success',
          },
        ],
      },
    });
    expect(syncRes1.status).toBe(200);
    expect(syncRes1.body.inserted).toBe(2);

    const syncRes2 = await httpCall(server, 'POST', '/api/audit/sync', {
      headers: { 'x-test-role': 'operator', 'x-test-userid': 'u_real_op', 'x-test-username': 'real_op' },
      body: {
        logs: [{ logId: 'offline_log_1', action: 'OFFLINE_CREATE_COLLECTION' }],
      },
    });
    expect(syncRes2.status).toBe(200);
    expect(syncRes2.body.inserted).toBe(0);
    expect(syncRes2.body.deduplicated).toBe(1);

    const syncedEntry = activityLogsStore.find((l) => l.logId === 'offline_log_1');
    expect(syncedEntry.userId).toBe('u_real_op');
    expect(syncedEntry.username).toBe('real_op');
    expect(syncedEntry.details.password).toBe('[REDACTED]');

    // Superadmin paginated + filtered access logs meta-audit event
    const logsRes = await httpCall(server, 'GET', '/api/admin/activity-logs?paginated=true&page=1&limit=2', {
      headers: { 'x-test-role': 'super_admin', 'x-test-username': 'boss_super' },
    });
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.items).toHaveLength(2);
    expect(logsRes.body.total).toBeGreaterThanOrEqual(2);
    expect(activityLogsStore.some((l) => l.action === 'AUDIT_LOG_ACCESSED' && l.username === 'boss_super')).toBe(true);
  });

  it('tracks SMS status updates idempotently via /api/sms/logs', async () => {
    const first = await httpCall(server, 'POST', '/api/sms/logs', {
      body: {
        idempotencyKey: 'sms_key_1',
        recipientType: 'farmer',
        recipientName: 'Ramesh Kumar',
        phone: '+919876543210',
        message: 'Milk collected',
        triggerType: 'milk_collection',
        deliveryChannel: 'native_sim',
        status: 'submitted',
        attempts: 1,
      },
    });
    expect(first.status).toBe(201);
    expect(smsLogsStore).toHaveLength(1);

    const delivered = await httpCall(server, 'POST', '/api/sms/logs', {
      body: {
        idempotencyKey: 'sms_key_1',
        phone: '+919876543210',
        message: 'Milk collected',
        status: 'delivered',
        attempts: 1,
      },
    });
    expect(delivered.status).toBe(201);
    expect(smsLogsStore).toHaveLength(1);
    expect(smsLogsStore[0].status).toBe('delivered');

    const fetched = await httpCall(server, 'GET', '/api/sms/logs?status=delivered');
    expect(fetched.status).toBe(200);
    expect(fetched.body).toHaveLength(1);
  });
});
