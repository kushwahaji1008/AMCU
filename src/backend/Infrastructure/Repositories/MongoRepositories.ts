import { IFarmerRepository, ICollectionRepository, IRateChartRepository, ILedgerRepository, ISaleRepository, ICustomerRepository, IUserRepository, IDairyRepository } from '../../Application/Interfaces/IRepositories';
import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../Core/Entities/Sale';
import { dbManager } from '../Persistence/Mongo/DatabaseManager';
import { getDatabaseId } from '../../Core/RequestContext';

export class MongoFarmerRepository implements IFarmerRepository {
  async getById(id: string): Promise<Farmer | null> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.findById(id);
    return doc ? (doc.toObject() as Farmer) : null;
  }

  async getAll(): Promise<Farmer[]> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const docs = await model.find();
    return docs.map(doc => doc.toObject() as Farmer);
  }

  async create(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.create(farmer);
    return doc.toObject() as Farmer;
  }

  async update(id: string, farmer: Partial<Farmer>): Promise<Farmer> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.findByIdAndUpdate(id, farmer, { new: true });
    if (!doc) throw new Error('Farmer not found');
    return doc.toObject() as Farmer;
  }

  async delete(id: string): Promise<void> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    await model.findByIdAndDelete(id);
  }

  async getSummary(farmerId: string): Promise<FarmerSummary> {
    const databaseId = getDatabaseId();
    const collectionModel = await dbManager.getCollectionModel(databaseId);
    const ledgerModel = await dbManager.getLedgerModel(databaseId);

    const collections = await collectionModel.find({ farmerId });
    const ledgers = await ledgerModel.find({ farmerId });

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
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const doc = await model.findById(id);
    return doc ? (doc.toObject() as MilkCollection) : null;
  }

  async getAll(): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const docs = await model.find();
    return docs.map(doc => doc.toObject() as MilkCollection);
  }

  async create(collection: Omit<MilkCollection, 'id' | 'createdAt'>): Promise<MilkCollection> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const doc = await model.create(collection);
    return doc.toObject() as MilkCollection;
  }

  async getDailyReport(date: Date): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const docs = await model.find({ date: { $gte: start, $lte: end } });
    return docs.map(doc => doc.toObject() as MilkCollection);
  }
}

export class MongoRateChartRepository implements IRateChartRepository {
  async getRate(fat: number, snf: number): Promise<number> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const doc = await model.findOne({
      fatMin: { $lte: fat },
      fatMax: { $gte: fat },
      snfMin: { $lte: snf },
      snfMax: { $gte: snf },
    });
    return doc ? doc.ratePerLiter : 0;
  }

  async getAll(): Promise<RateChart[]> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const docs = await model.find();
    return docs.map(doc => doc.toObject() as RateChart);
  }

  async create(rate: Omit<RateChart, 'id'>): Promise<RateChart> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const doc = await model.create(rate);
    return doc.toObject() as RateChart;
  }
}

export class MongoLedgerRepository implements ILedgerRepository {
  async addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const doc = await model.create(entry);
    return doc.toObject() as LedgerEntry;
  }

  async getByFarmerId(farmerId: string): Promise<LedgerEntry[]> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const docs = await model.find({ farmerId });
    return docs.map(doc => doc.toObject() as LedgerEntry);
  }
}

export class MongoSaleRepository implements ISaleRepository {
  async create(sale: Omit<MilkSale, 'id' | 'createdAt'>): Promise<MilkSale> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const doc = await model.create(sale);
    return doc.toObject() as MilkSale;
  }

  async getDailyReport(date: Date): Promise<MilkSale[]> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const docs = await model.find({ date: { $gte: start, $lte: end } });
    return docs.map(doc => doc.toObject() as MilkSale);
  }
}

export class MongoCustomerRepository implements ICustomerRepository {
  async create(customer: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const doc = await model.create(customer);
    return doc.toObject() as Customer;
  }

  async getAll(): Promise<Customer[]> {
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const docs = await model.find();
    return docs.map(doc => doc.toObject() as Customer);
  }
}

export class MongoUserRepository implements IUserRepository {
  async getByUsername(username: string): Promise<User | null> {
    const model = await dbManager.getUserModel('(default)');
    const doc = await model.findOne({ username });
    return doc ? (doc.toObject() as User) : null;
  }

  async getAll(role?: string): Promise<User[]> {
    const model = await dbManager.getUserModel('(default)');
    const filter = role ? { role } : {};
    const docs = await model.find(filter);
    return docs.map(doc => doc.toObject() as User);
  }

  async create(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const model = await dbManager.getUserModel('(default)');
    const doc = await model.create(user);
    return doc.toObject() as User;
  }
}

export class MongoDairyRepository implements IDairyRepository {
  async create(dairy: any): Promise<any> {
    const model = await dbManager.getDairyModel('(default)');
    const doc = await model.create(dairy);
    return doc.toObject();
  }

  async getByOwnerId(ownerId: string): Promise<any | null> {
    const model = await dbManager.getDairyModel('(default)');
    const doc = await model.findOne({ ownerId });
    return doc ? doc.toObject() : null;
  }

  async getById(id: string): Promise<any | null> {
    const model = await dbManager.getDairyModel('(default)');
    const doc = await model.findById(id);
    return doc ? doc.toObject() : null;
  }
}
