/**
 * MongoRepositories
 * 
 * Implements the Repository Pattern for MongoDB data access.
 * Each repository uses the 'dbManager' to get a tenant-specific model
 * based on the current request's 'databaseId'.
 */

import { IFarmerRepository, ICollectionRepository, IRateChartRepository, ILedgerRepository, ISaleRepository, ICustomerRepository, IUserRepository, IDairyRepository, ISettingsRepository, IShiftSummaryRepository, ILoginAuditRepository } from '../../Application/Interfaces/IRepositories';
import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry, ShiftSummary } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../Core/Entities/Sale';
import { LoginAudit } from '../../Core/Entities/Audit';
import { dbManager } from '../Persistence/Mongo/DatabaseManager';
import { getDatabaseId } from '../../Core/RequestContext';

/**
 * Helper to map a Mongoose document to a plain TypeScript object.
 * Converts _id to id and removes versioning fields.
 */
function mapDoc<T>(doc: any): T {
  if (!doc) return null as any;
  const obj = doc.toObject();
  obj.id = doc._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj as T;
}

// --- Farmer Repository ---
export class MongoFarmerRepository implements IFarmerRepository {
  async getById(id: string): Promise<Farmer | null> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    
    // Try finding by MongoDB _id first if it's a valid ObjectId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      const doc = await model.findById(id);
      if (doc) return mapDoc<Farmer>(doc);
    }
    
    // Fallback: Try finding by user-assigned farmerId
    const docByFarmerId = await model.findOne({ farmerId: id });
    return docByFarmerId ? mapDoc<Farmer>(docByFarmerId) : null;
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
    
    let doc;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      doc = await model.findByIdAndUpdate(id, farmer, { new: true });
    }
    
    if (!doc) {
      doc = await model.findOneAndUpdate({ farmerId: id }, farmer, { new: true });
    }
    
    if (!doc) throw new Error('Farmer not found');
    return mapDoc<Farmer>(doc);
  }

  async delete(id: string): Promise<void> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      const deleted = await model.findByIdAndDelete(id);
      if (deleted) return;
    }
    await model.findOneAndDelete({ farmerId: id });
  }

  /**
   * Aggregates summary data for a specific farmer.
   */
  async getSummary(id: string): Promise<FarmerSummary> {
    const databaseId = getDatabaseId();
    const farmerModel = await dbManager.getFarmerModel(databaseId);
    const collectionModel = await dbManager.getCollectionModel(databaseId);
    const ledgerModel = await dbManager.getLedgerModel(databaseId);

    // Resolve internal ID if id is a farmerId
    let farmerInternalId = id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const farmer = await farmerModel.findOne({ farmerId: id });
      if (farmer) {
        farmerInternalId = farmer._id.toString();
      }
    }

    const collections = await collectionModel.find({ farmerInternalId });
    const ledgers = await ledgerModel.find({ farmerInternalId });

    const totalMilkSupplied = collections.reduce((sum, c) => sum + c.quantity, 0);
    const totalEarnings = collections.reduce((sum, c) => sum + c.amount, 0);
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

// --- Collection Repository ---
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

  async getByFarmerInternalId(id: string): Promise<MilkCollection[]> {
    const databaseId = getDatabaseId();
    const model = await dbManager.getCollectionModel(databaseId);
    
    // Resolve internal ID if id is a farmerId
    let farmerInternalId = id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const farmerModel = await dbManager.getFarmerModel(databaseId);
      const farmer = await farmerModel.findOne({ farmerId: id });
      if (farmer) {
        farmerInternalId = farmer._id.toString();
      }
    }

    const docs = await model.find({ farmerInternalId }).sort({ date: -1 });
    return docs.map(doc => mapDoc<MilkCollection>(doc));
  }
}

// --- Rate Chart Repository ---
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

// --- Ledger Repository ---
export class MongoLedgerRepository implements ILedgerRepository {
  async addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const doc = await model.create(entry);
    return mapDoc<LedgerEntry>(doc);
  }

  async getByFarmerInternalId(id: string): Promise<LedgerEntry[]> {
    const databaseId = getDatabaseId();
    const model = await dbManager.getLedgerModel(databaseId);

    // Resolve internal ID if id is a farmerId
    let farmerInternalId = id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      const farmerModel = await dbManager.getFarmerModel(databaseId);
      const farmer = await farmerModel.findOne({ farmerId: id });
      if (farmer) {
        farmerInternalId = farmer._id.toString();
      }
    }

    const docs = await model.find({ farmerInternalId });
    return docs.map(doc => mapDoc<LedgerEntry>(doc));
  }

  async getAll(): Promise<LedgerEntry[]> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1 });
    return docs.map(doc => mapDoc<LedgerEntry>(doc));
  }
}

// --- Shift Summary Repository ---
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

// --- Sale Repository ---
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

// --- Customer Repository ---
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

// --- User Repository ---
export class MongoUserRepository implements IUserRepository {
  async getByUsername(username: string): Promise<User | null> {
    // User registry is global (stored in the default database)
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

  async update(id: string, user: Partial<User>): Promise<User> {
    const model = await dbManager.getUserModel('(default)');
    const doc = await model.findByIdAndUpdate(id, user, { new: true });
    if (!doc) throw new Error('User not found');
    return mapDoc<User>(doc);
  }

  async delete(id: string): Promise<void> {
    const model = await dbManager.getUserModel('(default)');
    await model.findByIdAndDelete(id);
  }
}

// --- Settings Repository ---
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

// --- Dairy Repository ---
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

  async getAll(): Promise<any[]> {
    const model = await dbManager.getDairyModel('(default)');
    const docs = await model.find();
    return docs.map(doc => mapDoc<any>(doc));
  }
}

// --- Login Audit Repository ---
export class MongoLoginAuditRepository implements ILoginAuditRepository {
  // Audit logs are stored in a dedicated superadmin database for security
  private readonly SUPERADMIN_DB = 'dugdhaset.superadmin';

  async create(audit: Omit<LoginAudit, 'id'>): Promise<LoginAudit> {
    const model = await dbManager.getLoginAuditModel(this.SUPERADMIN_DB);
    const doc = await model.create(audit);
    return mapDoc<LoginAudit>(doc);
  }

  async getAll(): Promise<LoginAudit[]> {
    const model = await dbManager.getLoginAuditModel(this.SUPERADMIN_DB);
    const docs = await model.find().sort({ loginAt: -1 });
    return docs.map(doc => mapDoc<LoginAudit>(doc));
  }

  async getByUserId(userId: string): Promise<LoginAudit[]> {
    const model = await dbManager.getLoginAuditModel(this.SUPERADMIN_DB);
    const docs = await model.find({ userId }).sort({ loginAt: -1 });
    return docs.map(doc => mapDoc<LoginAudit>(doc));
  }
}
