import { IFarmerRepository, ICollectionRepository, IRateChartRepository, ILedgerRepository, ISaleRepository, ICustomerRepository, IUserRepository, IDairyRepository, ISettingsRepository, IShiftSummaryRepository } from '../../Application/Interfaces/IRepositories';
import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry, ShiftSummary } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../Core/Entities/Sale';
import { dbManager } from '../Persistence/Mongo/DatabaseManager';
import { getDatabaseId } from '../../Core/RequestContext';

function mapDoc<T>(doc: any): T {
  if (!doc) return null as any;
  const obj = doc.toObject();
  obj.id = doc._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj as T;
}

export class MongoFarmerRepository implements IFarmerRepository {
  async getById(id: string): Promise<Farmer | null> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.findById(id);
    return doc ? mapDoc<Farmer>(doc) : null;
  }

  async getByFarmerId(farmerId: string): Promise<Farmer | null> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.findOne({ farmerId });
    return doc ? mapDoc<Farmer>(doc) : null;
  }

  async getAll(): Promise<Farmer[]> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const docs = await model.find();
    return docs.map(doc => mapDoc<Farmer>(doc));
  }

  async create(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.create(farmer);
    return mapDoc<Farmer>(doc);
  }

  async update(id: string, farmer: Partial<Farmer>): Promise<Farmer> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.findByIdAndUpdate(id, farmer, { new: true });
    if (!doc) throw new Error('Farmer not found');
    return mapDoc<Farmer>(doc);
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

  async getCount(): Promise<number> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    return model.countDocuments();
  }
}

export class MongoCollectionRepository implements ICollectionRepository {
  async getById(id: string): Promise<MilkCollection | null> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const doc = await model.findById(id);
    return doc ? mapDoc<MilkCollection>(doc) : null;
  }

  async getAll(): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const docs = await model.find();
    return docs.map(doc => mapDoc<MilkCollection>(doc));
  }

  async create(collection: Omit<MilkCollection, 'id' | 'createdAt'>): Promise<MilkCollection> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const doc = await model.create(collection);
    return mapDoc<MilkCollection>(doc);
  }

  async getDailyReport(date: Date, endDate?: Date): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date(date);
    end.setHours(23, 59, 59, 999);
    const docs = await model.find({ date: { $gte: start, $lte: end } }).sort({ date: -1 });
    return docs.map(doc => mapDoc<MilkCollection>(doc));
  }

  async getRecent(limit: number): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1 }).limit(limit);
    return docs.map(doc => mapDoc<MilkCollection>(doc));
  }

  async getTrend(days: number): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const start = new Date();
    start.setDate(start.getDate() - days);
    const docs = await model.find({ date: { $gte: start } }).sort({ date: 1 });
    return docs.map(doc => mapDoc<MilkCollection>(doc));
  }

  async update(id: string, collection: Partial<MilkCollection>): Promise<MilkCollection> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const doc = await model.findByIdAndUpdate(id, collection, { new: true });
    if (!doc) throw new Error('Collection record not found');
    return mapDoc<MilkCollection>(doc);
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
    return docs.map(doc => mapDoc<RateChart>(doc));
  }

  async create(rate: Omit<RateChart, 'id'>): Promise<RateChart> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const doc = await model.create(rate);
    return mapDoc<RateChart>(doc);
  }

  async update(id: string, rate: Partial<RateChart>): Promise<RateChart> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const doc = await model.findByIdAndUpdate(id, rate, { new: true });
    if (!doc) throw new Error('Rate chart entry not found');
    return mapDoc<RateChart>(doc);
  }

  async delete(id: string): Promise<void> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    await model.findByIdAndDelete(id);
  }
}

export class MongoLedgerRepository implements ILedgerRepository {
  async addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const doc = await model.create(entry);
    return mapDoc<LedgerEntry>(doc);
  }

  async getByFarmerId(farmerId: string): Promise<LedgerEntry[]> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const docs = await model.find({ farmerId });
    return docs.map(doc => mapDoc<LedgerEntry>(doc));
  }

  async getAll(): Promise<LedgerEntry[]> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1 });
    return docs.map(doc => mapDoc<LedgerEntry>(doc));
  }
}

export class MongoShiftSummaryRepository implements IShiftSummaryRepository {
  async create(summary: Omit<ShiftSummary, 'id'>): Promise<ShiftSummary> {
    const model = await dbManager.getShiftSummaryModel(getDatabaseId());
    const doc = await model.create(summary);
    return mapDoc<ShiftSummary>(doc);
  }

  async getByDateAndShift(date: string, shift: string): Promise<ShiftSummary | null> {
    const model = await dbManager.getShiftSummaryModel(getDatabaseId());
    const doc = await model.findOne({ date, shift });
    return doc ? mapDoc<ShiftSummary>(doc) : null;
  }

  async getRecent(limit: number): Promise<ShiftSummary[]> {
    const model = await dbManager.getShiftSummaryModel(getDatabaseId());
    const docs = await model.find().sort({ closedAt: -1 }).limit(limit);
    return docs.map(doc => mapDoc<ShiftSummary>(doc));
  }
}

export class MongoSaleRepository implements ISaleRepository {
  async create(sale: Omit<MilkSale, 'id' | 'createdAt'>): Promise<MilkSale> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const doc = await model.create(sale);
    return mapDoc<MilkSale>(doc);
  }

  async getDailyReport(date: Date): Promise<MilkSale[]> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const docs = await model.find({ date: { $gte: start, $lte: end } });
    return docs.map(doc => mapDoc<MilkSale>(doc));
  }
}

export class MongoCustomerRepository implements ICustomerRepository {
  async create(customer: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const doc = await model.create(customer);
    return mapDoc<Customer>(doc);
  }

  async getAll(): Promise<Customer[]> {
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const docs = await model.find();
    return docs.map(doc => mapDoc<Customer>(doc));
  }
}

export class MongoUserRepository implements IUserRepository {
  async getByUsername(username: string): Promise<User | null> {
    const model = await dbManager.getUserModel('(default)');
    const doc = await model.findOne({ username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    return doc ? mapDoc<User>(doc) : null;
  }

  async getAll(role?: string): Promise<User[]> {
    const model = await dbManager.getUserModel('(default)');
    const filter = role ? { role } : {};
    const docs = await model.find(filter);
    return docs.map(doc => mapDoc<User>(doc));
  }

  async create(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const model = await dbManager.getUserModel('(default)');
    const doc = await model.create(user);
    return mapDoc<User>(doc);
  }
}

export class MongoSettingsRepository implements ISettingsRepository {
  async get(key: string): Promise<any> {
    const model = await dbManager.getSettingsModel(getDatabaseId());
    const doc = await model.findOne({ key });
    return doc ? doc.value : null;
  }

  async save(key: string, value: any): Promise<void> {
    const model = await dbManager.getSettingsModel(getDatabaseId());
    await model.findOneAndUpdate(
      { key },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    );
  }
}

export class MongoDairyRepository implements IDairyRepository {
  async create(dairy: any): Promise<any> {
    const model = await dbManager.getDairyModel('(default)');
    const doc = await model.create(dairy);
    return mapDoc<any>(doc);
  }

  async getByOwnerId(ownerId: string): Promise<any | null> {
    const model = await dbManager.getDairyModel('(default)');
    const doc = await model.findOne({ ownerId });
    return doc ? mapDoc<any>(doc) : null;
  }

  async getById(id: string): Promise<any | null> {
    const model = await dbManager.getDairyModel('(default)');
    const doc = await model.findById(id);
    return doc ? mapDoc<any>(doc) : null;
  }
}
