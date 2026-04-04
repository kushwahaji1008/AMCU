import { ICollectionRepository, ISaleRepository, IFarmerRepository } from '../Interfaces/IRepositories';

export interface DailyReport {
  date: Date;
  totalCollection: number;
  totalCollectionAmount: number;
  totalSales: number;
  totalSalesAmount: number;
  profit: number;
}

export class ReportingService {
  constructor(
    private collectionRepo: ICollectionRepository,
    private saleRepo: ISaleRepository,
    private farmerRepo: IFarmerRepository
  ) {}

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
