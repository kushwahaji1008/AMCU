import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

let axiosInstance: typeof import('../axiosInstance').default;
let onLoadingChange: typeof import('../axiosInstance').onLoadingChange;
let farmerApi: typeof import('../api').farmerApi;
let rateApi: typeof import('../api').rateApi;
let clearApiCache: typeof import('../api').clearApiCache;
let offlineService: typeof import('../offlineService').offlineService;
let originalAdapter: any;
const mockWindow = {
  location: { pathname: '/dashboard', href: '' },
  addEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
};

describe('Frontend Core Services', () => {
  beforeAll(async () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('window', mockWindow);

    const axiosMod = await import('../axiosInstance');
    axiosInstance = axiosMod.default;
    onLoadingChange = axiosMod.onLoadingChange;
    originalAdapter = axiosInstance.defaults.adapter;

    const apiMod = await import('../api');
    farmerApi = apiMod.farmerApi;
    rateApi = apiMod.rateApi;
    clearApiCache = apiMod.clearApiCache;

    const offlineMod = await import('../offlineService');
    offlineService = offlineMod.offlineService;
  }, 15000);

  beforeEach(() => {
    localStorage.clear();
    clearApiCache();
    mockWindow.location = { pathname: '/dashboard', href: '' };
  });

  afterEach(() => {
    axiosInstance.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  it('tracks active loading state and attaches auth headers in axiosInstance', async () => {
    const states: boolean[] = [];
    const unsubscribe = onLoadingChange((loading) => states.push(loading));

    localStorage.setItem('token', 'jwt-abc');
    localStorage.setItem('databaseId', 'dairy_one');

    axiosInstance.defaults.adapter = async (config) => {
      expect(config.headers['Authorization']).toBe('Bearer jwt-abc');
      expect(config.headers['x-database-id']).toBe('dairy_one');
      expect(config.baseURL).toBe('/api');
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const res = await axiosInstance.get('/farmers');
    expect(res.data).toEqual({ ok: true });
    expect(states).toEqual([true, false]);
    unsubscribe();
  });

  it('clears tenant auth storage on 401 and preserves error.response metadata', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('profile', '{"uid":"1"}');
    localStorage.setItem('databaseId', 'dairy_one');

    axiosInstance.defaults.adapter = async (config) => {
      const err: any = new Error('Unauthorized');
      err.config = config;
      err.response = {
        status: 401,
        data: { message: 'Session expired' },
      };
      return Promise.reject(err);
    };

    await expect(axiosInstance.get('/farmers')).rejects.toMatchObject({
      message: 'Session expired',
      status: 401,
      response: { status: 401, data: { message: 'Session expired' } },
    });

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('profile')).toBeNull();
    expect(localStorage.getItem('databaseId')).toBeNull();
    expect(mockWindow.location.href).toContain('/login?reason=');
  });

  it('caches reads and invalidates cache on farmer and rate mutations', async () => {
    let farmerGets = 0;
    let rateGets = 0;

    axiosInstance.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/farmers') {
        farmerGets++;
        return { data: [{ id: 'f1', farmerId: '101', name: 'Ramesh' }], status: 200, statusText: 'OK', headers: {}, config };
      }
      if (config.method === 'post' && config.url === '/farmers') {
        return { data: { id: 'f2', farmerId: '102', name: 'Suresh' }, status: 201, statusText: 'Created', headers: {}, config };
      }
      if (config.method === 'get' && config.url === '/rates') {
        rateGets++;
        return { data: [{ id: 'r1', milkType: 'Cow', fat: 4.0, snf: 8.5, rate: 36 }], status: 200, statusText: 'OK', headers: {}, config };
      }
      if (config.method === 'put' && config.url === '/rates/r1') {
        return { data: { id: 'r1', rate: 38 }, status: 200, statusText: 'OK', headers: {}, config };
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    };

    await farmerApi.getAll();
    await farmerApi.getAll();
    expect(farmerGets).toBe(1);

    await farmerApi.create({ farmerId: '102', name: 'Suresh', mobile: '9999999999', village: 'Rampur', cattleType: 'Cow' });
    await farmerApi.getAll();
    expect(farmerGets).toBe(2);

    await rateApi.getAll();
    await rateApi.getAll();
    expect(rateGets).toBe(1);

    await rateApi.update('r1', { rate: 38 });
    await rateApi.getAll();
    expect(rateGets).toBe(2);
  });

  it('calculates 10-day cycle bills accurately with weighted quality averages', async () => {
    const farmers = [
      { id: 'mongo-f1', farmerId: '101', name: 'Ramesh', village: 'Rampur' },
      { id: 'mongo-f2', farmerId: '102', name: 'Suresh', village: 'Sitapur' },
    ];
    const collections = [
      { farmerInternalId: 'mongo-f1', farmerId: '101', date: '2026-05-01T00:00:00.000Z', quantity: 10, fat: 4.0, snf: 8.5, amount: 350 },
      { farmerInternalId: 'mongo-f1', farmerId: '101', date: '2026-05-05T00:00:00.000Z', quantity: 20, fat: 5.5, snf: 8.8, amount: 800 },
      // Outside period 1 (day 12 -> period 2)
      { farmerInternalId: 'mongo-f1', farmerId: '101', date: '2026-05-12T00:00:00.000Z', quantity: 15, fat: 5.0, snf: 8.5, amount: 550 },
      { farmerInternalId: 'mongo-f2', farmerId: '102', date: '2026-05-03T00:00:00.000Z', quantity: 12, fat: 6.0, snf: 9.0, amount: 540 },
    ];

    const bills = offlineService.calculateBills(farmers, collections, 2026, 4, 1, 'mongo-f1');
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({
      id: 'mongo-f1',
      farmerId: '101',
      farmerName: 'Ramesh',
      village: 'Rampur',
      totalQuantity: 30,
      amount: 1150,
      avgFat: 5,
      avgSnf: 8.7,
    });
    expect(bills[0].collections).toHaveLength(2);
  });
});
