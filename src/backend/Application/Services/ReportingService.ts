import { ICollectionRepository, ISaleRepository, IFarmerRepository, ILedgerRepository } from '../Interfaces/IRepositories';
import { format } from 'date-fns';

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

  async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date();
    const todayCollections = await this.collectionRepo.getDailyReport(today);
    const totalFarmers = await this.farmerRepo.getCount();
    const recentTxns = await this.collectionRepo.getRecent(5);
    const trendData = await this.collectionRepo.getTrend(7);

    let todayQty = 0;
    let morningQty = 0;
    let eveningQty = 0;
    let todayAmount = 0;
    let fatSum = 0;
    let snfSum = 0;

    todayCollections.forEach(c => {
      todayQty += c.quantity;
      if (c.shift === 'Morning') morningQty += c.quantity;
      else eveningQty += c.quantity;
      todayAmount += c.amount;
      fatSum += c.fat;
      snfSum += c.snf;
    });

    return {
      todayQty,
      morningQty,
      eveningQty,
      todayAmount,
      totalFarmers,
      avgFat: todayCollections.length > 0 ? fatSum / todayCollections.length : 0,
      avgSnf: todayCollections.length > 0 ? snfSum / todayCollections.length : 0,
      recentTxns,
      trendData
    };
  }

  async getDailyReport(date: Date): Promise<DailyReport> {
    const collections = await this.collectionRepo.getDailyReport(date);
    const sales = await this.saleRepo.getDailyReport(date);

    const totalCollection = collections.reduce((sum, c) => sum + c.quantity, 0);
    const collectionAmount = collections.reduce((sum, c) => sum + c.amount, 0);
    const totalSales = sales.reduce((sum, s) => sum + s.quantity, 0);
    const salesAmount = sales.reduce((sum, s) => sum + s.amount, 0);

    return {
      date,
      totalCollection,
      collectionAmount,
      totalSales,
      salesAmount,
      profit: salesAmount - collectionAmount,
    };
  }

  async getFarmerWiseReport(id: string) {
    return this.farmerRepo.getSummary(id);
  }

  async getPeriodicBills(year: number, month: number, period: 1 | 2 | 3, farmerId?: string) {
    let startDate: Date;
    let endDate: Date;

    if (period === 1) {
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month, 10);
    } else if (period === 2) {
      startDate = new Date(year, month, 11);
      endDate = new Date(year, month, 20);
    } else {
      startDate = new Date(year, month, 21);
      endDate = new Date(year, month + 1, 0); // Last day of month
    }

    const collections = await this.collectionRepo.getDailyReport(startDate, endDate);
    const farmers = await this.farmerRepo.getAll();
    
    const bills: any[] = [];

    // Group collections by farmer
    const grouped = collections.reduce((acc, c) => {
      if (!acc[c.farmerInternalId]) acc[c.farmerInternalId] = [];
      acc[c.farmerInternalId].push(c);
      return acc;
    }, {} as Record<string, any[]>);

    const targetFarmers = farmerId 
      ? farmers.filter(f => f.farmerId === farmerId)
      : farmers;

    for (const farmer of targetFarmers) {
      const internalId = farmer.id;
      const farmerCollections = grouped[internalId] || [];
      
      // Skip farmers who haven't provided milk in this period
      if (farmerCollections.length === 0) continue;
      
      const totalQuantity = farmerCollections.reduce((sum, c) => sum + c.quantity, 0);
      const amount = farmerCollections.reduce((sum, c) => sum + c.amount, 0);
      const avgFat = farmerCollections.length > 0 
        ? farmerCollections.reduce((sum, c) => sum + c.fat, 0) / farmerCollections.length 
        : 0;
      const avgSnf = farmerCollections.length > 0 
        ? farmerCollections.reduce((sum, c) => sum + c.snf, 0) / farmerCollections.length 
        : 0;

      bills.push({
        id: internalId,
        farmerId: farmer.farmerId, // This is the user-assigned ID
        farmerCode: farmer.farmerCode, // Fallback
        farmerName: farmer.name || 'Unknown',
        village: farmer.village || '',
        startDate,
        endDate,
        totalQuantity,
        amount,
        avgFat,
        avgSnf,
        collections: farmerCollections.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      });
    }

    return bills;
  }

  async finalizePeriodicBills(year: number, month: number, period: 1 | 2 | 3, dairyId: string) {
    const bills = await this.getPeriodicBills(year, month, period);
    const periodStr = `${period === 1 ? '01-10' : period === 2 ? '11-20' : '21-End'} ${format(new Date(year, month, 1), 'MMM yyyy')}`;
    let processedCount = 0;

    for (const bill of bills) {
      const farmer = await this.farmerRepo.getById(bill.id);
      if (!farmer) continue;

      // Create a unique reference ID for this farmer and period
      const uniqueReferenceId = `BILL-${year}-${month}-${period}-${bill.id}`;

      // Check if this bill has already been finalized for this farmer
      const existingEntry = await this.ledgerRepo.getByReferenceId(uniqueReferenceId);
      if (existingEntry) {
        continue; // Skip if already finalized
      }

      const newBalance = (farmer.balance || 0) + bill.amount;
      
      // 1. Update Farmer Balance
      await this.farmerRepo.update(bill.id, { balance: newBalance });

      // 2. Add Ledger Entry
      await this.ledgerRepo.addEntry({
        farmerInternalId: bill.id,
        farmerId: bill.farmerId,
        type: 'credit',
        amount: bill.amount,
        referenceId: uniqueReferenceId,
        date: new Date(),
        description: `Milk Bill: Period ${periodStr}`,
        balanceAfter: newBalance,
        dairyId: dairyId
      });
      
      processedCount++;
    }

    return { success: true, count: processedCount, totalBills: bills.length };
  }
}
