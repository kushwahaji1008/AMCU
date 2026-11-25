import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionService } from '../Application/Services/CollectionService';
import { PaymentService } from '../Application/Services/PaymentService';
import { ReportingService } from '../Application/Services/ReportingService';
import { FarmerService } from '../Application/Services/FarmerService';
import { ConflictError, NotFoundError, ValidationError } from '../Core/Errors';
import { getUtcDayBounds } from '../Infrastructure/Repositories/MongoRepositories';

describe('Business Services & Data Integrity Tests', () => {
  describe('getUtcDayBounds', () => {
    it('should parse YYYY-MM-DD strings into exact UTC day boundaries', () => {
      const { start, end } = getUtcDayBounds('2026-04-08');
      expect(start.toISOString()).toBe('2026-04-08T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-04-08T23:59:59.999Z');
    });

    it('should throw ValidationError on invalid date inputs', () => {
      expect(() => getUtcDayBounds('not-a-date')).toThrow(ValidationError);
    });
  });

  describe('FarmerService', () => {
    it('should prevent duplicate farmerId creation and protect balance on update', async () => {
      const farmerRepo = {
        getById: vi.fn(),
        getByFarmerId: vi.fn(),
        getAll: vi.fn(),
        create: vi.fn().mockImplementation(async (f) => ({ id: 'f1', createdAt: '2026-04-08', ...f })),
        update: vi.fn().mockImplementation(async (id, f) => ({ id, ...f })),
        delete: vi.fn(),
        getSummary: vi.fn(),
        getCount: vi.fn(),
        getTotalBalance: vi.fn(),
      };
      const service = new FarmerService(farmerRepo as any);

      vi.mocked(farmerRepo.getByFarmerId).mockResolvedValueOnce({ id: 'existing', farmerId: '101' } as any);
      await expect(
        service.createFarmer({
          farmerId: '101',
          name: 'Ram',
          mobile: '9876543210',
          village: 'Gokul',
          cattleType: 'Cow',
          status: 'Active',
          balance: 5000,
          dairyId: 'd1',
        })
      ).rejects.toThrow(ConflictError);

      vi.mocked(farmerRepo.getByFarmerId).mockResolvedValueOnce(null);
      const created = await service.createFarmer({
        farmerId: '102',
        name: 'Shyam',
        mobile: '9876543211',
        village: 'Gokul',
        cattleType: 'Buffalo',
        status: 'Active',
        balance: 5000, // Should be forced to 0
        dairyId: 'd1',
      });
      expect(created.balance).toBe(0);

      vi.mocked(farmerRepo.getById).mockResolvedValueOnce(created);
      await service.updateFarmer('f1', { name: 'Shyam Updated', balance: 9999 } as any);
      expect(farmerRepo.update).toHaveBeenCalledWith('f1', { name: 'Shyam Updated' });
    });
  });

  describe('CollectionService', () => {
    let collectionRepo: any;
    let rateChartRepo: any;
    let ledgerRepo: any;
    let farmerRepo: any;
    let shiftSummaryRepo: any;
    let settingsRepo: any;
    let service: CollectionService;

    beforeEach(() => {
      collectionRepo = {
        getById: vi.fn(),
        getAll: vi.fn(),
        create: vi.fn().mockImplementation(async (d) => ({ id: 'c1', createdAt: new Date(), ...d })),
        getDailyReport: vi.fn(),
        getRecent: vi.fn(),
        getTrend: vi.fn(),
        update: vi.fn().mockImplementation(async (id, d) => ({ id, ...d })),
        getByFarmerInternalId: vi.fn(),
        findDuplicatePour: vi.fn().mockResolvedValue(null),
      };
      rateChartRepo = { getRate: vi.fn().mockResolvedValue(0) };
      ledgerRepo = {};
      farmerRepo = {
        getById: vi.fn().mockResolvedValue({
          id: 'farmerInternal1',
          farmerId: '101',
          farmerCode: '101',
          name: 'Ram Singh',
          cattleType: 'Cow',
        }),
        getByFarmerId: vi.fn(),
      };
      shiftSummaryRepo = {
        create: vi.fn().mockImplementation(async (d) => ({ id: 's1', ...d })),
        getByDateAndShift: vi.fn().mockResolvedValue(null),
        getRecent: vi.fn(),
      };
      settingsRepo = {
        get: vi.fn().mockResolvedValue({
          fatMultiplier1: 4.0,
          snfMultiplier1: 3.0,
          maxFatForFormula1: 6.0,
          fatMultiplier2: 8.0,
          snfDeductions: { '8.5': 2.0 },
        }),
      };

      service = new CollectionService(
        collectionRepo,
        rateChartRepo,
        ledgerRepo,
        farmerRepo,
        shiftSummaryRepo,
        settingsRepo
      );
    });

    it('should resolve farmer via farmerId and calculate rate from RateSettings Formula 1 & Formula 2', async () => {
      const coll1 = await service.createCollection({
        farmerId: '101',
        date: '2026-04-08',
        shift: 'Morning',
        quantity: 10,
        fat: 4.0,
        snf: 8.5,
      });
      // Formula 1: 4.0 * 4.0 + 8.5 * 3.0 = 16 + 25.5 = 41.5
      expect(coll1.rate).toBe(41.5);
      expect(coll1.amount).toBe(415);
      expect(coll1.farmerInternalId).toBe('farmerInternal1');

      const coll2 = await service.createCollection({
        farmerId: '101',
        date: '2026-04-08',
        shift: 'Evening',
        quantity: 5,
        fat: 6.5,
        snf: 8.5,
      });
      // Formula 2: 6.5 * 8.0 - 2.0 = 50.0
      expect(coll2.rate).toBe(50);
      expect(coll2.amount).toBe(250);
    });

    it('should throw NotFoundError for unknown farmer and ConflictError for duplicate shift pour', async () => {
      farmerRepo.getById.mockResolvedValueOnce(null);
      farmerRepo.getByFarmerId.mockResolvedValueOnce(null);
      await expect(
        service.createCollection({ farmerId: '999', shift: 'Morning', quantity: 5, fat: 4, snf: 8.2 })
      ).rejects.toThrow(NotFoundError);

      collectionRepo.findDuplicatePour.mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.createCollection({ farmerId: '101', shift: 'Morning', quantity: 5, fat: 4, snf: 8.2 })
      ).rejects.toThrow(ConflictError);
    });

    it('should recalculate amount on updateCollection and prevent duplicate shift summary', async () => {
      collectionRepo.getById.mockResolvedValueOnce({ id: 'c1', quantity: 10, rate: 40, amount: 400 });
      await service.updateCollection('c1', { quantity: 12 });
      expect(collectionRepo.update).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ quantity: 12, amount: 480 })
      );

      shiftSummaryRepo.getByDateAndShift.mockResolvedValueOnce({ id: 's1' });
      await expect(
        service.createShiftSummary({
          date: '2026-04-08',
          shift: 'Morning',
          totalFarmers: 5,
          totalQuantity: 50,
          avgFat: 4.5,
          avgSnf: 8.5,
          amount: 2000,
          closedAt: new Date(),
          closedBy: 'admin',
          dairyId: 'd1',
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('PaymentService', () => {
    it('should enforce positive amount, duplicate referenceId, and atomic balance decrement with rollback', async () => {
      const ledgerRepo = {
        getByReferenceId: vi.fn().mockResolvedValue(null),
        addEntry: vi.fn().mockImplementation(async (e) => ({ id: 'l1', ...e })),
      };
      const farmerRepo = {
        getById: vi.fn().mockResolvedValue({ id: 'f1', farmerId: '101', balance: 1000 }),
        getByFarmerId: vi.fn(),
        incrementBalance: vi.fn().mockResolvedValue({ id: 'f1', balance: 600 }),
        update: vi.fn(),
        getSummary: vi.fn(),
      };
      const service = new PaymentService(ledgerRepo as any, farmerRepo as any);

      await expect(service.recordPayment({ farmerInternalId: 'f1', amount: 0 })).rejects.toThrow(ValidationError);

      const entry = await service.recordPayment({
        farmerInternalId: 'f1',
        amount: 400,
        referenceId: 'PAY-1',
        dairyId: 'd1',
      });
      expect(entry.balanceAfter).toBe(600);
      expect(farmerRepo.incrementBalance).toHaveBeenCalledWith('f1', -400);

      // Duplicate referenceId
      ledgerRepo.getByReferenceId.mockResolvedValueOnce({ id: 'l1' });
      await expect(
        service.recordPayment({ farmerInternalId: 'f1', amount: 400, referenceId: 'PAY-1', dairyId: 'd1' })
      ).rejects.toThrow(ConflictError);

      // Rollback on ledger failure
      ledgerRepo.addEntry.mockRejectedValueOnce(new Error('Ledger write failed'));
      await expect(
        service.recordPayment({ farmerInternalId: 'f1', amount: 100, referenceId: 'PAY-2', dairyId: 'd1' })
      ).rejects.toThrow('Ledger write failed');
      expect(farmerRepo.incrementBalance).toHaveBeenLastCalledWith('f1', 100);
    });
  });

  describe('ReportingService', () => {
    it('should generate UTC periodic bills and finalize idempotently without double-crediting', async () => {
      const insertedRefs = new Set<string>();
      const farmerBalances: Record<string, number> = { f1: 100 };

      const collectionRepo = {
        getDailyReport: vi.fn().mockResolvedValue([
          {
            id: 'c1',
            farmerInternalId: 'f1',
            farmerId: '101',
            farmerName: 'Ram',
            date: new Date('2026-04-05T00:00:00.000Z'),
            shift: 'Morning',
            quantity: 10,
            fat: 4.5,
            snf: 8.5,
            amount: 450,
          },
        ]),
      };
      const farmerRepo = {
        getAll: vi.fn().mockResolvedValue([
          { id: 'f1', farmerId: '101', name: 'Ram', village: 'Gokul', balance: 100 },
        ]),
        incrementBalance: vi.fn().mockImplementation(async (id, delta) => {
          farmerBalances[id] += delta;
          return { id, balance: farmerBalances[id] };
        }),
      };
      const ledgerRepo = {
        getByReferenceIds: vi.fn().mockImplementation(async (refs: string[]) =>
          refs.filter((r) => insertedRefs.has(r)).map((r) => ({ referenceId: r }))
        ),
        addEntryIfNotExists: vi.fn().mockImplementation(async (entry) => {
          if (insertedRefs.has(entry.referenceId)) {
            return { entry, created: false };
          }
          insertedRefs.add(entry.referenceId);
          return { entry: { id: 'l1', ...entry }, created: true };
        }),
      };

      const reporting = new ReportingService(collectionRepo as any, {} as any, farmerRepo as any, ledgerRepo as any);

      // Concurrent finalization should only credit once!
      const [res1, res2] = await Promise.all([
        reporting.finalizePeriodicBills(2026, 3, 1, 'd1'),
        reporting.finalizePeriodicBills(2026, 3, 1, 'd1'),
      ]);

      expect(res1.count + res2.count).toBe(1);
      expect(farmerBalances.f1).toBe(550);
    });
  });
});
