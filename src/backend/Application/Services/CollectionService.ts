import { ICollectionRepository, IRateChartRepository, ILedgerRepository, IFarmerRepository } from '../Interfaces/IRepositories';
import { MilkCollection } from '../../Core/Entities/Collection';

export class CollectionService {
  constructor(
    private collectionRepo: ICollectionRepository,
    private rateChartRepo: IRateChartRepository,
    private ledgerRepo: ILedgerRepository,
    private farmerRepo: IFarmerRepository
  ) {}

  async createCollection(data: any): Promise<MilkCollection> {
    // 1. Calculate Rate based on FAT and SNF
    let rate = data.rate;
    if (!rate) {
      rate = await this.rateChartRepo.getRate(data.fat, data.snf);
    }
    
    if (rate === 0) {
      // Fallback to a default rate if not provided and not found in chart
      rate = 40; 
    }

    const totalAmount = data.quantity * rate;

    // 2. Create Collection Record
    const collection = await this.collectionRepo.create({
      ...data,
      rate,
      totalAmount,
    });

    // 3. Update Farmer Balance
    const farmer = await this.farmerRepo.getById(data.farmerId);
    if (farmer) {
      const newBalance = (farmer.balance || 0) + totalAmount;
      await this.farmerRepo.update(data.farmerId, { balance: newBalance });
      
      // 4. Update Ledger (CREDIT → we owe farmer)
      await this.ledgerRepo.addEntry({
        farmerId: data.farmerId,
        type: 'credit',
        amount: totalAmount,
        referenceId: collection.id,
        date: data.date || new Date(),
        balanceAfter: newBalance,
        description: `Milk Collection: ${data.quantity}kg @ ₹${rate}/kg`,
        dairyId: data.dairyId
      });
    }

    return collection;
  }

  async getDailyReport(date: Date): Promise<MilkCollection[]> {
    return this.collectionRepo.getDailyReport(date);
  }
}
