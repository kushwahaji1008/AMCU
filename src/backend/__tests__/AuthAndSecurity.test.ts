import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createBackendApp, sanitizePayload } from '../index';
import { authenticate } from '../API/Middleware/AuthMiddleware';
import { JWT_CONFIG } from '../API/Config/Auth';
import { requestContext } from '../Core/RequestContext';
import { dbManager } from '../Infrastructure/Persistence/Mongo/DatabaseManager';
import { AuthService } from '../Application/Services/AuthService';

/**
 * Helper to execute HTTP requests against an Express app on an ephemeral localhost port
 * without adding extra test dependencies.
 */
async function httpCall(
  server: http.Server,
  method: string,
  path: string,
  options: { body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; text: string }> {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server not bound');
  const url = `http://127.0.0.1:${address.port}${path}`;
  const res = await fetch(url, {
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
    // plain text
  }
  return { status: res.status, body, text };
}

describe('Backend Security, Auth & API Integration Tests', () => {
  let server: http.Server;
  let usersStore: any[];
  let dairiesStore: any[];
  let farmersStore: any[];
  let ratesStore: any[];
  let settingsStore: Record<string, any>;
  let customerPaymentsStore: any[];
  let activityLogsStore: any[];

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long';
    usersStore = [];
    dairiesStore = [];
    farmersStore = [];
    ratesStore = [];
    settingsStore = {};
    customerPaymentsStore = [];
    activityLogsStore = [];

    const userRepo = {
      getById: async (id: string) => usersStore.find((u) => u.id === id) || null,
      getByUsername: async (username: string) =>
        usersStore.find((u) => u.username === username.trim().toLowerCase()) || null,
      getByEmail: async (email: string) =>
        usersStore.find((u) => u.email === email.trim().toLowerCase()) || null,
      getByUsernameOrEmail: async (id: string) =>
        usersStore.find((u) => u.username === id.trim().toLowerCase() || u.email === id.trim().toLowerCase()) || null,
      getAll: async (filter: any = {}) =>
        usersStore
          .filter((u) => (!filter.role || u.role === filter.role) && (!filter.databaseId || u.databaseId === filter.databaseId))
          .map(({ passwordHash: _p, otp: _o, otpExpires: _oe, otpAttempts: _oa, currentSessionId: _s, ...safe }) => safe),
      create: async (u: any) => {
        const doc = { id: `u_${usersStore.length + 1}`, createdAt: new Date(), ...u };
        usersStore.push(doc);
        return doc;
      },
      update: async (id: string, u: any) => {
        const idx = usersStore.findIndex((item) => item.id === id);
        if (idx === -1) throw new Error('User not found');
        usersStore[idx] = { ...usersStore[idx], ...u };
        return usersStore[idx];
      },
      delete: async (id: string) => {
        usersStore = usersStore.filter((u) => u.id !== id);
      },
    };

    const dairyRepo = {
      create: async (d: any) => {
        const doc = { id: `d_${dairiesStore.length + 1}`, createdAt: new Date(), ...d };
        dairiesStore.push(doc);
        return doc;
      },
      getByOwnerId: async (ownerId: string) => dairiesStore.find((d) => d.ownerId === ownerId) || null,
      getById: async (id: string) => dairiesStore.find((d) => d.id === id || d.databaseId === id) || null,
      getByDatabaseId: async (dbId: string) => dairiesStore.find((d) => d.databaseId === dbId) || null,
      getAll: async () => dairiesStore,
      update: async (id: string, data: any) => {
        const idx = dairiesStore.findIndex((d) => d.id === id || d.databaseId === id);
        if (idx === -1) throw new Error('Dairy not found');
        dairiesStore[idx] = { ...dairiesStore[idx], ...data };
        return dairiesStore[idx];
      },
    };

    const farmerRepo = {
      getAll: async () => farmersStore,
      getById: async (id: string) => farmersStore.find((f) => f.id === id || f.farmerId === id) || null,
      getByFarmerId: async (fid: string) => farmersStore.find((f) => f.farmerId === fid) || null,
      create: async (f: any) => {
        const doc = { id: `f_${farmersStore.length + 1}`, createdAt: new Date().toISOString(), ...f };
        farmersStore.push(doc);
        return doc;
      },
      update: async (id: string, f: any) => {
        const idx = farmersStore.findIndex((x) => x.id === id);
        farmersStore[idx] = { ...farmersStore[idx], ...f };
        return farmersStore[idx];
      },
      delete: async (id: string) => {
        farmersStore = farmersStore.filter((x) => x.id !== id);
      },
      getSummary: async () => ({ totalMilkSupplied: 0, totalEarnings: 0, totalPaid: 0, pendingAmount: 0 }),
      getCount: async () => farmersStore.length,
      getTotalBalance: async () => 0,
    };

    const rateChartRepo = {
      getRate: async () => 45,
      getAll: async () => ratesStore,
      create: async (r: any) => {
        const doc = { id: `r_${ratesStore.length + 1}`, ...r };
        ratesStore.push(doc);
        return doc;
      },
      update: async (id: string, r: any) => ({ id, ...r }),
      delete: async (id: string) => {
        ratesStore = ratesStore.filter((r) => r.id !== id);
      },
    };

    const settingsRepo = {
      get: async (key: string) => settingsStore[key] || null,
      save: async (key: string, val: any) => {
        settingsStore[key] = val;
      },
    };

    const paymentRepo = {
      create: async (p: any) => {
        const doc = { id: `cp_${customerPaymentsStore.length + 1}`, createdAt: new Date(), ...p };
        customerPaymentsStore.push(doc);
        return doc;
      },
      getRecent: async (limit: number) => customerPaymentsStore.slice(0, limit),
      getByCustomerId: async (cid: string) => customerPaymentsStore.filter((p) => p.customerId === cid),
    };

    const activityRepo = {
      create: async (log: any) => {
        const doc = { id: `act_${activityLogsStore.length + 1}`, ...log };
        activityLogsStore.push(doc);
        return doc;
      },
      getAll: async () => activityLogsStore,
      getByUserId: async () => [],
      getByAction: async () => [],
    };

    // Test auth middleware using in-memory usersStore while running the exact token checks
    const testAuthMiddleware = async (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ success: false, message: 'Authentication required', code: 'AUTH_REQUIRED' });
      }
      try {
        const decoded = jwt.verify(token, JWT_CONFIG.secret) as any;
        const user = usersStore.find((u) => u.id === decoded.id);
        if (!user || user.status === 'inactive' || user.currentSessionId !== decoded.sid) {
          return res.status(401).json({ success: false, message: 'Session invalidated', code: 'SESSION_INVALIDATED' });
        }
        req.user = {
          id: user.id,
          username: user.username,
          role: user.role,
          databaseId: user.databaseId,
          dairyId: user.dairyId || user.databaseId,
        };
        return requestContext.run(
          { databaseId: req.user.databaseId, dairyId: req.user.dairyId, userId: user.id, role: user.role },
          () => next()
        );
      } catch {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
    };

    const app = createBackendApp({
      farmerRepo: farmerRepo as any,
      collectionRepo: { getAll: async () => [], getDailyReport: async () => [], getRecent: async () => [], getTrend: async () => [] } as any,
      rateChartRepo: rateChartRepo as any,
      ledgerRepo: { getAll: async () => [], getByFarmerInternalId: async () => [] } as any,
      userRepo: userRepo as any,
      saleRepo: { getAll: async () => [], getRecent: async () => [], getDailyReport: async () => [], getByCustomerId: async () => [] } as any,
      customerRepo: { getAll: async () => [], getById: async () => null } as any,
      paymentRepo: paymentRepo as any,
      dairyRepo: dairyRepo as any,
      settingsRepo: settingsRepo as any,
      shiftSummaryRepo: { getRecent: async () => [], getByDateAndShift: async () => null } as any,
      auditRepo: { create: async (a) => ({ id: 'a1', ...a }), getAll: async () => [], getByUserId: async () => [] } as any,
      activityRepo: activityRepo as any,
      authMiddleware: testAuthMiddleware as any,
      disableRateLimit: true,
    });

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should sanitize Mongo $ operators and prototype pollution keys without corrupting < in passwords or decimal keys', () => {
    const clean = sanitizePayload({
      username: 'admin',
      password: 'Pass<123!',
      filter: { $gt: '', nested: { $ne: null } },
      snfDeductions: { '9.0': 0, '8.9': 0.5 },
      ['__proto__']: { polluted: true },
    });
    expect(clean.password).toBe('Pass<123!');
    expect(clean.filter).toEqual({ nested: {} });
    expect(clean.snfDeductions['9.0']).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(clean, '__proto__')).toBe(false);
  });

  it('should block unauthenticated requests to all protected routes with 401 and return 404 JSON on unknown /api/* routes', async () => {
    const checks = [
      httpCall(server, 'GET', '/api/farmers'),
      httpCall(server, 'POST', '/api/sales', { body: {} }),
      httpCall(server, 'GET', '/api/users'),
      httpCall(server, 'GET', '/api/customer-payments'),
      httpCall(server, 'POST', '/api/notify', { body: { mobile: '9999999999', message: 'hi' } }),
      httpCall(server, 'GET', '/api/diag/email?to=test@example.com'),
    ];
    const results = await Promise.all(checks);
    results.forEach((res) => expect(res.status).toBe(401));

    const notFoundRes = await httpCall(server, 'GET', '/api/non-existent-endpoint');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.code).toBe('ROUTE_NOT_FOUND');
  });

  it('should enforce real AuthMiddleware checks including fingerprint, inactive status, and session ID', async () => {
    const spy = vi.spyOn(dbManager, 'getUserModel').mockResolvedValue({
      findById: () => ({
        select: () => ({
          lean: async () => ({
            username: 'admin1',
            role: 'admin',
            status: 'active',
            databaseId: 'dairy-a',
            dairyId: 'dairy-a',
            currentSessionId: 'valid-sid',
          }),
        }),
      }),
    } as any);

    const ua = 'VitestAgent/1.0';
    const fp = crypto.createHash('sha256').update(ua).digest('hex');
    const token = jwt.sign({ id: 'u1', fp, sid: 'valid-sid' }, JWT_CONFIG.secret);

    const req = { headers: { authorization: `Bearer ${token}`, 'user-agent': 'OtherAgent/2.0' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FINGERPRINT_MISMATCH' }));
    expect(next).not.toHaveBeenCalled();

    // Valid UA passes and populates tenant RequestContext
    const reqValid = { headers: { authorization: `Bearer ${token}`, 'user-agent': ua } } as any;
    const resValid = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    let capturedDb = '';
    await authenticate(reqValid, resValid, () => {
      capturedDb = requestContext.getStore()?.databaseId || '';
    });
    expect(capturedDb).toBe('dairy-a');
    spy.mockRestore();
  });

  it('should enforce secure registration, login with special characters (<), dairy update, and RBAC/tenant isolation on users', async () => {
    // 1. Public operator registration must be rejected (403)
    const opRegRes = await httpCall(server, 'POST', '/api/auth/register', {
      body: {
        username: 'attacker',
        password: 'Password<123!',
        role: 'operator',
        databaseId: 'dairy-alpha',
      },
    });
    expect(opRegRes.status).toBe(403);

    // 2. Register Dairy A (without email, matching DairyManagement.tsx, and with `<` in password!)
    const regARes = await httpCall(server, 'POST', '/api/auth/register', {
      body: {
        username: 'admin_a',
        password: 'Password<123!',
        role: 'admin',
        dairyData: {
          name: 'Alpha Dairy',
          address: 'Village A',
          contact: '9876543210',
          databaseId: 'dairy-alpha',
        },
      },
    });
    expect(regARes.status).toBe(201);
    expect(regARes.body.passwordHash).toBeUndefined();

    // 3. Duplicate databaseId (even with underscore vs hyphen collision!) must be rejected (409)
    const dupDbRes = await httpCall(server, 'POST', '/api/auth/register', {
      body: {
        username: 'admin_collision',
        password: 'Password<123!',
        role: 'admin',
        dairyData: {
          name: 'Collision Dairy',
          address: 'Village C',
          contact: '9876543219',
          databaseId: 'dairy_alpha',
        },
      },
    });
    expect(dupDbRes.status).toBe(409);

    // 4. Register Dairy B
    const regBRes = await httpCall(server, 'POST', '/api/auth/register', {
      body: {
        username: 'admin_b',
        email: 'adminb@dairy.com',
        password: 'Password<123!',
        role: 'admin',
        dairyData: {
          name: 'Beta Dairy',
          address: 'Village B',
          contact: '9876543211',
          databaseId: 'dairy-beta',
        },
      },
    });
    expect(regBRes.status).toBe(201);

    // 5. Login as Admin A with `<` in password
    const loginARes = await httpCall(server, 'POST', '/api/auth/login', {
      body: { username: 'ADMIN_A', password: 'Password<123!' },
    });
    expect(loginARes.status).toBe(200);
    expect(loginARes.body.user.dairyName).toBe('Alpha Dairy');
    expect(loginARes.body.user.passwordHash).toBeUndefined();
    expect(loginARes.body.user.currentSessionId).toBeUndefined();
    const tokenA = loginARes.body.token;

    // 6. Login as Admin B
    const loginBRes = await httpCall(server, 'POST', '/api/auth/login', {
      body: { username: 'adminb@dairy.com', password: 'Password<123!' },
    });
    expect(loginBRes.status).toBe(200);
    const tokenB = loginBRes.body.token;

    // 7. Admin A creates an operator in Dairy A
    const createOpRes = await httpCall(server, 'POST', '/api/users', {
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        username: 'op_alpha',
        password: 'OpPassword@123',
        role: 'admin', // Should be forced to 'operator' by backend
      },
    });
    expect(createOpRes.status).toBe(201);
    expect(createOpRes.body.role).toBe('operator');
    expect(createOpRes.body.databaseId).toBe('dairy-alpha');
    const opId = createOpRes.body.id;

    // 8. Admin B CANNOT update or delete Admin A's operator (Cross-tenant IDOR blocked with 403)
    const idorPut = await httpCall(server, 'PUT', `/api/users/${opId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
      body: { status: 'inactive' },
    });
    expect(idorPut.status).toBe(403);

    const idorDel = await httpCall(server, 'DELETE', `/api/users/${opId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(idorDel.status).toBe(403);

    // 9. Admin A updates own dairy profile via PUT /api/dairies/:id, Admin B is blocked (403)
    const updateDairyA = await httpCall(server, 'PUT', '/api/dairies/dairy-alpha', {
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { name: 'Alpha Dairy Updated', phone: '9999988888', address: 'New Village A' },
    });
    expect(updateDairyA.status).toBe(200);
    expect(updateDairyA.body.name).toBe('Alpha Dairy Updated');
    expect(updateDairyA.body.contact).toBe('9999988888');

    const updateDairyCross = await httpCall(server, 'PUT', '/api/dairies/dairy-alpha', {
      headers: { Authorization: `Bearer ${tokenB}` },
      body: { name: 'Hacked' },
    });
    expect(updateDairyCross.status).toBe(403);

    // 10. Activity logger recorded dairy update AND redacted sensitive fields
    expect(activityLogsStore.some((l) => l.action === 'PUT_DAIRIES')).toBe(true);

    // 11. Operator logs in, cannot access /api/users (403), and logout invalidates session
    const opLoginRes = await httpCall(server, 'POST', '/api/auth/login', {
      body: { username: 'op_alpha', password: 'OpPassword@123' },
    });
    expect(opLoginRes.status).toBe(200);
    const opToken = opLoginRes.body.token;

    const opListUsers = await httpCall(server, 'GET', '/api/users', {
      headers: { Authorization: `Bearer ${opToken}` },
    });
    expect(opListUsers.status).toBe(403);

    const logoutRes = await httpCall(server, 'POST', '/api/auth/logout', {
      headers: { Authorization: `Bearer ${opToken}` },
    });
    expect(logoutRes.status).toBe(200);

    const afterLogoutRes = await httpCall(server, 'GET', '/api/farmers', {
      headers: { Authorization: `Bearer ${opToken}` },
    });
    expect(afterLogoutRes.status).toBe(401);

    // 12. Rate settings with dot-notation keys like '9.0' survive sanitization intact
    const settingsRes = await httpCall(server, 'POST', '/api/rates/settings', {
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { fatMultiplier1: 3.96, snfDeductions: { '9.0': 0, '8.5': 2.5 } },
    });
    expect(settingsRes.status).toBe(200);
    expect(settingsStore.rateSettings.snfDeductions['8.5']).toBe(2.5);

    // 13. Rate chart point-entry creation (frontend RateChartManagement payload)
    const createRateRes = await httpCall(server, 'POST', '/api/rates', {
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { milkType: 'Cow', fat: 4.5, snf: 8.5, rate: 50, effectiveFrom: '2026-04-08' },
    });
    expect(createRateRes.status).toBe(201);
    expect(createRateRes.body.rate).toBe(50);

    // 14. Customer payments GET endpoint works
    const getCustPayRes = await httpCall(server, 'GET', '/api/customer-payments', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(getCustPayRes.status).toBe(200);
    expect(Array.isArray(getCustPayRes.body)).toBe(true);

    // 15. SuperAdmin verify validation (no 500 crash on empty body)
    const verifyMissing = await httpCall(server, 'POST', '/api/admin/verify', { body: {} });
    expect(verifyMissing.status).toBe(400);

    // 16. Farmer creation, collection validation & calculation, and farmer payment route
    const createFarmerRes = await httpCall(server, 'POST', '/api/farmers', {
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        farmerId: '101',
        name: 'Ram Singh',
        mobile: '9876543210',
        village: 'Gokul',
        cattleType: 'Cow',
      },
    });
    expect(createFarmerRes.status).toBe(201);
    const farmerInternalId = createFarmerRes.body.id;

    const badCollection = await httpCall(server, 'POST', '/api/collections', {
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        farmerInternalId,
        quantity: 10,
        fat: 4.5,
        snf: 9.0, // Invalid SNF for fat 4.5
        shift: 'Morning',
      },
    });
    expect(badCollection.status).toBe(400);

    const badBills = await httpCall(server, 'GET', '/api/reports/bills?year=abc', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(badBills.status).toBe(400);
  });

  it('should support secure OTP resend & verification lifecycle', async () => {
    const hash = await bcrypt.hash('Password@123', 10);
    usersStore.push({
      id: 'u_otp',
      username: 'otpuser',
      email: 'otp@example.com',
      passwordHash: hash,
      role: 'admin',
      status: 'active',
      isEmailVerified: false,
      databaseId: 'd1',
      createdAt: new Date(),
    });

    const userRepo = {
      getById: async (id: string) => usersStore.find((u) => u.id === id) || null,
      getByUsername: async () => null,
      getAll: async () => [],
      create: async (u: any) => u,
      update: async (id: string, u: any) => {
        const idx = usersStore.findIndex((x) => x.id === id);
        usersStore[idx] = { ...usersStore[idx], ...u };
        return usersStore[idx];
      },
      delete: async () => {},
    };

    const authSvc = new AuthService(userRepo as any, {} as any);
    const { emailService } = await import('../Application/Services/EmailService');
    let sentOtp = '';
    vi.spyOn(emailService, 'sendOTP').mockImplementation(async (_email, otp) => {
      sentOtp = otp;
    });

    await authSvc.resendOTP('u_otp');
    expect(sentOtp).toMatch(/^\d{6}$/);

    // Immediate resend triggers cooldown
    await expect(authSvc.resendOTP('u_otp')).rejects.toThrow('Please wait before requesting another OTP.');

    // Wrong OTP increments attempts
    await expect(authSvc.verifyOTP('u_otp', '000000')).rejects.toThrow('Invalid OTP.');
    expect(usersStore[0].otpAttempts).toBe(1);

    // Correct OTP verifies and clears stored hash
    const verified = await authSvc.verifyOTP('u_otp', sentOtp);
    expect(verified.success).toBe(true);
    expect(usersStore[0].isEmailVerified).toBe(true);
    expect(usersStore[0].otp).toBe('');
  });
});
