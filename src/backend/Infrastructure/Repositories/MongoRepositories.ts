import { IFarmerRepository, ICollectionRepository, IRateChartRepository, ILedgerRepository, ISaleRepository, ICustomerRepository, IUserRepository } from '../../Application/Interfaces/IRepositories';
import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../Core/Entities/Sale';
import { FarmerModel, CollectionModel, RateChartModel, LedgerModel, SaleModel, CustomerModel, UserModel } from '../Persistence/Mongo/Models';

export class MongoFarmerRepository implements IFarmerRepository {
  async getById(id: string): Promise<Farmer | null> {
    const doc = await FarmerModel.findById(id);
    return doc ? (doc.toObject() as Farmer) : null;
  }

  async getAll(): Promise<Farmer[]> {
    const docs = await FarmerModel.find();
    return docs.map(doc => doc.toObject() as Farmer);
  }

  async create(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer> {
    const doc = await FarmerModel.create(farmer);
    return doc.toObject() as Farmer;
  }

  async update(id: string, farmer: Partial<Farmer>): Promise<Farmer> {
    const doc = await FarmerModel.findByIdAndUpdate(id, farmer, { new: true });
    if (!doc) throw new Error('Farmer not found');
    return doc.toObject() as Farmer;
  }

  async delete(id: string): Promise<void> {
    await FarmerModel.findByIdAndDelete(id);
  }

  async getSummary(farmerId: string): Promise<FarmerSummary> {
    const collections = await CollectionModel.find({ farmerId });
    const ledgers = await LedgerModel.find({ farmerId });

    const totalMilkSupplied = collections.reduce((sum, c) => sum + c.quantity, 0);
    const totalEarnings = collections.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalPaid = ledgers.filter(l => l.type === 'debit').reduce((sum, l) => sum + l.amount, 0);

    return {
      totalMilkSupplied,
      totalEarnings,
      totalPaid,
      pendingAmount: totalEarnings - totalPaid,
    };
  }
}

export class MongoCollectionRepository implements ICollectionRepository {
  async getById(id: string): Promise<MilkCollection | null> {
    const doc = await CollectionModel.findById(id);
    return doc ? (doc.toObject() as MilkCollection) : null;
  }

  async getAll(): Promise<MilkCollection[]> {
    const docs = await CollectionModel.find();
    return docs.map(doc => doc.toObject() as MilkCollection);
  }

  async create(collection: Omit<MilkCollection, 'id' | 'createdAt'>): Promise<MilkCollection> {
    const doc = await CollectionModel.create(collection);
    return doc.toObject() as MilkCollection;
  }

  async getDailyReport(date: Date): Promise<MilkCollection[]> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const docs = await CollectionModel.find({ date: { $gte: start, $lte: end } });
    return docs.map(doc => doc.toObject() as MilkCollection);
  }
}

export class MongoRateChartRepository implements IRateChartRepository {
  async getRate(fat: number, snf: number): Promise<number> {
    const doc = await RateChartModel.findOne({
      fatMin: { $lte: fat },
      fatMax: { $gte: fat },
      snfMin: { $lte: snf },
      snfMax: { $gte: snf },
    });
    return doc ? doc.ratePerLiter : 0;
  }

  async getAll(): Promise<RateChart[]> {
    const docs = await RateChartModel.find();
    return docs.map(doc => doc.toObject() as RateChart);
  }

  async create(rate: Omit<RateChart, 'id'>): Promise<RateChart> {
    const doc = await RateChartModel.create(rate);
    return doc.toObject() as RateChart;
  }
}

export class MongoLedgerRepository implements ILedgerRepository {
  async addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry> {
    const doc = await LedgerModel.create(entry);
    return doc.toObject() as LedgerEntry;
  }

  async getByFarmerId(farmerId: string): Promise<LedgerEntry[]> {
    const docs = await LedgerModel.find({ farmerId });
    return docs.map(doc => doc.toObject() as LedgerEntry);
  }
}

export class MongoSaleRepository implements ISaleRepository {
  async create(sale: Omit<MilkSale, 'id' | 'createdAt'>): Promise<MilkSale> {
    const doc = await SaleModel.create(sale);
    return doc.toObject() as MilkSale;
  }

  async getDailyReport(date: Date): Promise<MilkSale[]> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const docs = await SaleModel.find({ date: { $gte: start, $lte: end } });
    return docs.map(doc => doc.toObject() as MilkSale);
  }
}

export class MongoCustomerRepository implements ICustomerRepository {
  async create(customer: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
    const doc = await CustomerModel.create(customer);
    return doc.toObject() as Customer;
  }

  async getAll(): Promise<Customer[]> {
    const docs = await CustomerModel.find();
    return docs.map(doc => doc.toObject() as Customer);
  }
}

export class MongoUserRepository implements IUserRepository {
  async getByUsername(username: string): Promise<User | null> {
    const doc = await UserModel.findOne({ username });
    return doc ? (doc.toObject() as User) : null;
  }

  async create(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const doc = await UserModel.create(user);
    return doc.toObject() as User;
  }
}
