import { ICollectionRepository, IRateChartRepository, ILedgerRepository } from '../Interfaces/IRepositories';
import { MilkCollection } from '../../Core/Entities/Collection';

export class CollectionService {
  constructor(
    private collectionRepo: ICollectionRepository,
    private rateChartRepo: IRateChartRepository,
    private ledgerRepo: ILedgerRepository
  ) {}

  async createCollection(data: {
    farmerId: string;
    date: Date;
    shift: 'Morning' | 'Evening';
    quantity: number;
    fat: number;
    snf: number;
  }): Promise<MilkCollection> {
    // 1. Calculate Rate based on FAT and SNF
    const rate = await this.rateChartRepo.getRate(data.fat, data.snf);
    if (rate === 0) {
      throw new Error('No matching rate found for the given FAT and SNF values.');
    }

    const totalAmount = data.quantity * rate;

    // 2. Create Collection Record
    const collection = await this.collectionRepo.create({
      ...data,
      rate,
      totalAmount,
    });

    // 3. Update Ledger (CREDIT → we owe farmer)
    await this.ledgerRepo.addEntry({
      farmerId: data.farmerId,
      type: 'credit',
      amount: totalAmount,
      referenceId: collection.id,
      date: data.date,
    });

    return collection;
  }

  async getDailyReport(date: Date): Promise<MilkCollection[]> {
    return this.collectionRepo.getDailyReport(date);
  }
}
