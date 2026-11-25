import { ICollectionRepository, ISaleRepository, IFarmerRepository, ILedgerRepository } from '../Interfaces/IRepositories';
import { format } from 'date-fns';
import { ValidationError } from '../../Core/Errors';
import { getDairyId } from '../../Core/RequestContext';

export interface DailyReport {
  date: Date;
  totalCollection: number;
  collectionAmount: number;
  totalSales: number;
  salesAmount: number;
  profit: number;
}

export interface DashboardStats {
  todayQty: number;
  morningQty: number;
  eveningQty: number;
  todayAmount: number;
  totalFarmers: number;
  avgFat: number;
  avgSnf: number;
  pendingPayments: number;
  recentTxns: any[];
  trendData: any[];
}

export class ReportingService {
  constructor(
    private collectionRepo: ICollectionRepository,
    private saleRepo: ISaleRepository,
    private farmerRepo: IFarmerRepository,
    private ledgerRepo: ILedgerRepository
  ) {}

  async getDashboardStats(days: number = 7): Promise<DashboardStats> {
    const clampedDays = Number.isFinite(days) ? Math.min(Math.max(Math.floor(days), 1), 365) : 7;
    const today = new Date();
    const [todayCollections, totalFarmers, recentTxns, trendData, pendingPayments] = await Promise.all([
      this.collectionRepo.getDailyReport(today),
      this.farmerRepo.getCount(),
      this.collectionRepo.getRecent(10),
      this.collectionRepo.getTrend(clampedDays),
      this.farmerRepo.getTotalBalance(),
    ]);

    let todayQty = 0;
    let morningQty = 0;
    let eveningQty = 0;
    let todayAmount = 0;
    let fatSum = 0;
    let snfSum = 0;

    for (const c of todayCollections) {
      const qty = c.quantity || 0;
      todayQty += qty;
      const shift = (c.shift || '').toLowerCase();
      if (shift === 'morning') morningQty += qty;
      else if (shift === 'evening') eveningQty += qty;

      todayAmount += c.amount || 0;
      fatSum += (c.fat || 0) * qty;
      snfSum += (c.snf || 0) * qty;
    }

    return {
      todayQty: Math.round(todayQty * 100) / 100,
      morningQty: Math.round(morningQty * 100) / 100,
      eveningQty: Math.round(eveningQty * 100) / 100,
      todayAmount: Math.round(todayAmount * 100) / 100,
      totalFarmers,
      avgFat: todayQty > 0 ? Math.round((fatSum / todayQty) * 100) / 100 : 0,
      avgSnf: todayQty > 0 ? Math.round((snfSum / todayQty) * 100) / 100 : 0,
      pendingPayments: Math.round(pendingPayments * 100) / 100,
      recentTxns,
      trendData,
    };
  }

  async getDailyReport(date: Date): Promise<DailyReport> {
    const [collections, sales] = await Promise.all([
      this.collectionRepo.getDailyReport(date),
      this.saleRepo.getDailyReport(date),
    ]);

    const totalCollection = Math.round(collections.reduce((sum, c) => sum + (c.quantity || 0), 0) * 100) / 100;
    const collectionAmount = Math.round(collections.reduce((sum, c) => sum + (c.amount || 0), 0) * 100) / 100;
    const totalSales = Math.round(sales.reduce((sum, s) => sum + (s.quantity || 0), 0) * 100) / 100;
    const salesAmount = Math.round(sales.reduce((sum, s) => sum + (s.amount || 0), 0) * 100) / 100;

    return {
      date,
      totalCollection,
      collectionAmount,
      totalSales,
      salesAmount,
      profit: Math.round((salesAmount - collectionAmount) * 100) / 100,
    };
  }

  async getFarmerWiseReport(id: string) {
    return this.farmerRepo.getSummary(id);
  }

  async getPeriodicBills(year: number, month: number, period: 1 | 2 | 3, farmerId?: string) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ValidationError('Invalid year parameter', 'INVALID_YEAR');
    }
    if (!Number.isInteger(month) || month < 0 || month > 11) {
      throw new ValidationError('Invalid month parameter (expected 0-11)', 'INVALID_MONTH');
    }
    if (period !== 1 && period !== 2 && period !== 3) {
      throw new ValidationError('Invalid period parameter (expected 1, 2, or 3)', 'INVALID_PERIOD');
    }

    let startDate: Date;
    let endDate: Date;

    if (period === 1) {
      startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, 10, 23, 59, 59, 999));
    } else if (period === 2) {
      startDate = new Date(Date.UTC(year, month, 11, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, 20, 23, 59, 59, 999));
    } else {
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      startDate = new Date(Date.UTC(year, month, 21, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999));
    }

    const [collections, farmers] = await Promise.all([
      this.collectionRepo.getDailyReport(startDate, endDate),
      this.farmerRepo.getAll(),
    ]);

    const grouped = collections.reduce((acc, c) => {
      if (!acc[c.farmerInternalId]) acc[c.farmerInternalId] = [];
      acc[c.farmerInternalId].push(c);
      return acc;
    }, {} as Record<string, any[]>);

    const targetFarmers = farmerId
      ? farmers.filter((f) => f.farmerId === farmerId || f.id === farmerId)
      : farmers;

    const bills: any[] = [];
    for (const farmer of targetFarmers) {
      const internalId = farmer.id;
      const farmerCollections = grouped[internalId] || [];

      if (farmerCollections.length === 0) continue;

      const totalQuantity = farmerCollections.reduce((sum, c) => sum + (c.quantity || 0), 0);
      const amount = farmerCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
      const fatSum = farmerCollections.reduce((sum, c) => sum + (c.fat || 0) * (c.quantity || 0), 0);
      const snfSum = farmerCollections.reduce((sum, c) => sum + (c.snf || 0) * (c.quantity || 0), 0);
      const avgFat = totalQuantity > 0 ? fatSum / totalQuantity : 0;
      const avgSnf = totalQuantity > 0 ? snfSum / totalQuantity : 0;

      bills.push({
        id: internalId,
        farmerId: farmer.farmerId,
        farmerCode: farmer.farmerCode,
        farmerName: farmer.name || 'Unknown',
        village: farmer.village || '',
        currentBalance: farmer.balance || 0,
        startDate,
        endDate,
        totalQuantity: Math.round(totalQuantity * 100) / 100,
        amount: Math.round(amount * 100) / 100,
        avgFat: Math.round(avgFat * 100) / 100,
        avgSnf: Math.round(avgSnf * 100) / 100,
        collections: farmerCollections.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      });
    }

    return bills;
  }

  async finalizePeriodicBills(year: number, month: number, period: 1 | 2 | 3, dairyId?: string) {
    const bills = await this.getPeriodicBills(year, month, period);
    const periodStr = `${period === 1 ? '01-10' : period === 2 ? '11-20' : '21-End'} ${format(
      new Date(Date.UTC(year, month, 1)),
      'MMM yyyy'
    )}`;
    const resolvedDairyId = dairyId || getDairyId();

    const refIds = bills.map((b) => `BILL-${year}-${month}-${period}-${b.id}`);
    const existingEntries = this.ledgerRepo.getByReferenceIds
      ? await this.ledgerRepo.getByReferenceIds(refIds)
      : [];
    const finalizedSet = new Set(existingEntries.map((e) => e.referenceId));

    let processedCount = 0;

    for (const bill of bills) {
      const uniqueReferenceId = `BILL-${year}-${month}-${period}-${bill.id}`;
      if (finalizedSet.has(uniqueReferenceId)) {
        continue;
      }

      // Fast path when atomic upsert is supported by the repository
      if (this.ledgerRepo.addEntryIfNotExists && this.farmerRepo.incrementBalance) {
        const expectedBalanceAfter = Math.round(((bill.currentBalance || 0) + bill.amount) * 100) / 100;
        const { created } = await this.ledgerRepo.addEntryIfNotExists({
          farmerInternalId: bill.id,
          farmerId: bill.farmerId,
          type: 'credit',
          amount: bill.amount,
          referenceId: uniqueReferenceId,
          date: new Date(),
          description: `Milk Bill: Period ${periodStr}`,
          balanceAfter: expectedBalanceAfter,
          dairyId: resolvedDairyId,
        });

        if (!created) {
          continue;
        }

        await this.farmerRepo.incrementBalance(bill.id, bill.amount);
        processedCount++;
      } else {
        const existingEntry = await this.ledgerRepo.getByReferenceId(uniqueReferenceId);
        if (existingEntry) continue;

        const farmer = await this.farmerRepo.getById(bill.id);
        if (!farmer) continue;

        const newBalance = Math.round(((farmer.balance || 0) + bill.amount) * 100) / 100;
        await this.farmerRepo.update(bill.id, { balance: newBalance });
        await this.ledgerRepo.addEntry({
          farmerInternalId: bill.id,
          farmerId: bill.farmerId,
          type: 'credit',
          amount: bill.amount,
          referenceId: uniqueReferenceId,
          date: new Date(),
          description: `Milk Bill: Period ${periodStr}`,
          balanceAfter: newBalance,
          dairyId: resolvedDairyId,
        });
        processedCount++;
      }
    }

    return { success: true, count: processedCount, totalBills: bills.length };
  }
}
