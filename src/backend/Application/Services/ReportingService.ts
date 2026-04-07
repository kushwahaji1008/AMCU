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
}
