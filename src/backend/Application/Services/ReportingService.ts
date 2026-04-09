import { ICollectionRepository, ISaleRepository, IFarmerRepository } from '../Interfaces/IRepositories';

export interface DailyReport {
  date: Date;
  totalCollection: number;
  totalCollectionAmount: number;
  totalSales: number;
  totalSalesAmount: number;
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
    private farmerRepo: IFarmerRepository
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
      todayAmount += c.totalAmount;
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
    const totalCollectionAmount = collections.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalSales = sales.reduce((sum, s) => sum + s.quantity, 0);
    const totalSalesAmount = sales.reduce((sum, s) => sum + s.totalAmount, 0);

    return {
      date,
      totalCollection,
      totalCollectionAmount,
      totalSales,
      totalSalesAmount,
      profit: totalSalesAmount - totalCollectionAmount,
    };
  }

  async getFarmerWiseReport(farmerId: string) {
    return this.farmerRepo.getSummary(farmerId);
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
      if (!acc[c.farmerId]) acc[c.farmerId] = [];
      acc[c.farmerId].push(c);
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
      const totalAmount = farmerCollections.reduce((sum, c) => sum + c.totalAmount, 0);
      const avgFat = farmerCollections.length > 0 
        ? farmerCollections.reduce((sum, c) => sum + c.fat, 0) / farmerCollections.length 
        : 0;
      const avgSnf = farmerCollections.length > 0 
        ? farmerCollections.reduce((sum, c) => sum + c.snf, 0) / farmerCollections.length 
        : 0;

      bills.push({
        farmerId: farmer.farmerId,
        farmerName: farmer.name || 'Unknown',
        village: farmer.village || '',
        startDate,
        endDate,
        totalQuantity,
        totalAmount,
        avgFat,
        avgSnf,
        collections: farmerCollections.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      });
    }

    return bills;
  }
}
