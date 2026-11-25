/**
 * MongoRepositories
 *
 * Implements the Repository Pattern for MongoDB data access.
 * Uses `lean()` queries for read paths, MongoDB aggregations for summaries,
 * atomic updates for financial balances, and UTC-safe date range queries.
 */

import mongoose from 'mongoose';
import {
  IFarmerRepository,
  ICollectionRepository,
  IRateChartRepository,
  ILedgerRepository,
  ISaleRepository,
  ICustomerRepository,
  IUserRepository,
  IDairyRepository,
  ISettingsRepository,
  IShiftSummaryRepository,
  ILoginAuditRepository,
  ICustomerPaymentRepository,
  IActivityLogRepository,
  AuditLogFilter,
  PaginatedResult,
} from '../../Application/Interfaces/IRepositories';
import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry, ShiftSummary } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User, CustomerPayment } from '../../Core/Entities/Sale';
import { Dairy } from '../../Core/Entities/Dairy';
import { LoginAudit, ActivityLog } from '../../Core/Entities/Audit';
import { dbManager } from '../Persistence/Mongo/DatabaseManager';
import {
  DEFAULT_DATABASE_ID,
  SUPERADMIN_DATABASE_ID,
  getDatabaseId,
} from '../../Core/RequestContext';
import { ConflictError, NotFoundError, ValidationError } from '../../Core/Errors';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Maps a Mongoose document or lean object to a plain domain object with string `id`.
 */
function mapDoc<T>(doc: any): T {
  if (!doc) return null as any;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (obj._id !== undefined) {
    obj.id = obj._id.toString();
    delete obj._id;
  }
  delete obj.__v;
  return obj as T;
}

function assertValidObjectId(id: string, entityName: string) {
  if (!id || !mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${entityName} identifier`, 'INVALID_ID');
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Computes UTC day bounds [00:00:00.000Z, 23:59:59.999Z] consistently
 * regardless of server local timezone.
 */
export function getUtcDayBounds(dateInput: Date | string, endDateInput?: Date | string): { start: Date; end: Date } {
  const parseBoundary = (input: Date | string, isEnd: boolean): Date => {
    if (typeof input === 'string') {
      const dateOnly = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateOnly) {
        const y = Number(dateOnly[1]);
        const m = Number(dateOnly[2]) - 1;
        const d = Number(dateOnly[3]);
        return new Date(
          isEnd ? Date.UTC(y, m, d, 23, 59, 59, 999) : Date.UTC(y, m, d, 0, 0, 0, 0)
        );
      }
    }
    const parsed = input instanceof Date ? new Date(input.getTime()) : new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError('Invalid date provided', 'INVALID_DATE');
    }
    return new Date(
      isEnd
        ? Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 23, 59, 59, 999)
        : Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0)
    );
  };

  const start = parseBoundary(dateInput, false);
  const end = parseBoundary(endDateInput ?? dateInput, true);
  return { start, end };
}

function clampLimit(limit: number | undefined, defaultVal: number = 50, maxVal: number = 500): number {
  if (limit === undefined || Number.isNaN(limit) || !Number.isFinite(limit)) return defaultVal;
  return Math.min(Math.max(Math.floor(limit), 1), maxVal);
}

// --- Farmer Repository ---
export class MongoFarmerRepository implements IFarmerRepository {
  async getById(id: string): Promise<Farmer | null> {
    if (!id) return null;
    const model = await dbManager.getFarmerModel(getDatabaseId());

    if (OBJECT_ID_REGEX.test(id)) {
      const doc = await model.findById(id).lean();
      if (doc) return mapDoc<Farmer>(doc);
    }

    const docByFarmerId = await model.findOne({ farmerId: id }).lean();
    return docByFarmerId ? mapDoc<Farmer>(docByFarmerId) : null;
  }

  async getByFarmerId(farmerId: string): Promise<Farmer | null> {
    if (!farmerId) return null;
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.findOne({ $or: [{ farmerId }, { farmerCode: farmerId }] }).lean();
    return doc ? mapDoc<Farmer>(doc) : null;
  }

  async getAll(): Promise<Farmer[]> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const docs = await model.find().lean();
    return docs.map((doc) => mapDoc<Farmer>(doc));
  }

  async create(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.create(farmer);
    return mapDoc<Farmer>(doc);
  }

  async update(id: string, farmer: Partial<Farmer>, expectedVersion?: number): Promise<Farmer> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const { version: _v, expectedVersion: _ev, baseVersion: _bv, ...cleanUpdates } = farmer as any;
    const setPayload = { ...cleanUpdates, updatedAt: new Date() };
    const versionMatch =
      expectedVersion !== undefined
        ? { $or: [{ version: expectedVersion }, { version: { $exists: false } }] }
        : {};

    let doc: any = null;
    if (OBJECT_ID_REGEX.test(id)) {
      doc = await model
        .findOneAndUpdate(
          { _id: id, ...versionMatch },
          { $set: setPayload, $inc: { version: 1 } },
          { new: true }
        )
        .lean();
    }

    if (!doc) {
      doc = await model
        .findOneAndUpdate(
          { farmerId: id, ...versionMatch },
          { $set: setPayload, $inc: { version: 1 } },
          { new: true }
        )
        .lean();
    }

    if (!doc) {
      if (expectedVersion !== undefined) {
        const current = await this.getById(id);
        if (current) {
          throw new ConflictError('Farmer record version conflict', 'VERSION_CONFLICT', {
            serverRecord: current,
            serverVersion: current.version ?? 1,
            localVersion: expectedVersion,
          });
        }
      }
      throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
    }
    return mapDoc<Farmer>(doc);
  }

  async incrementBalance(id: string, delta: number): Promise<Farmer> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    let doc: any = null;
    if (OBJECT_ID_REGEX.test(id)) {
      doc = await model.findByIdAndUpdate(id, { $inc: { balance: delta } }, { new: true }).lean();
    }
    if (!doc) {
      doc = await model.findOneAndUpdate({ farmerId: id }, { $inc: { balance: delta } }, { new: true }).lean();
    }
    if (!doc) throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
    return mapDoc<Farmer>(doc);
  }

  async delete(id: string): Promise<void> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    if (OBJECT_ID_REGEX.test(id)) {
      const deleted = await model.findByIdAndDelete(id).lean();
      if (deleted) return;
    }
    const deletedByFarmerId = await model.findOneAndDelete({ farmerId: id }).lean();
    if (!deletedByFarmerId) {
      throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
    }
  }

  async getSummary(id: string): Promise<FarmerSummary> {
    const databaseId = getDatabaseId();
    const farmerModel = await dbManager.getFarmerModel(databaseId);
    const collectionModel = await dbManager.getCollectionModel(databaseId);
    const ledgerModel = await dbManager.getLedgerModel(databaseId);

    let farmerInternalId = id;
    if (!OBJECT_ID_REGEX.test(id)) {
      const farmer = await farmerModel.findOne({ farmerId: id }).select('_id').lean();
      if (farmer) {
        farmerInternalId = farmer._id.toString();
      }
    }

    const [collectionAgg, ledgerAgg] = await Promise.all([
      collectionModel.aggregate([
        { $match: { farmerInternalId } },
        {
          $group: {
            _id: null,
            totalMilkSupplied: { $sum: '$quantity' },
            totalEarnings: { $sum: '$amount' },
          },
        },
      ]),
      ledgerModel.aggregate([
        { $match: { farmerInternalId, type: 'debit' } },
        {
          $group: {
            _id: null,
            totalPaid: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    const totalMilkSupplied = Math.round((collectionAgg[0]?.totalMilkSupplied || 0) * 100) / 100;
    const totalEarnings = Math.round((collectionAgg[0]?.totalEarnings || 0) * 100) / 100;
    const totalPaid = Math.round((ledgerAgg[0]?.totalPaid || 0) * 100) / 100;

    return {
      totalMilkSupplied,
      totalEarnings,
      totalPaid,
      pendingAmount: Math.round((totalEarnings - totalPaid) * 100) / 100,
    };
  }

  async getCount(): Promise<number> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    return model.countDocuments();
  }

  async getTotalBalance(): Promise<number> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const result = await model.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
    return result[0]?.total || 0;
  }
}

// --- Collection Repository ---
export class MongoCollectionRepository implements ICollectionRepository {
  async getById(id: string): Promise<MilkCollection | null> {
    assertValidObjectId(id, 'collection');
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const doc = await model.findById(id).lean();
    return doc ? mapDoc<MilkCollection>(doc) : null;
  }

  async getAll(): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<MilkCollection>(doc));
  }

  async create(collection: Omit<MilkCollection, 'id' | 'createdAt'>): Promise<MilkCollection> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const doc = await model.create(collection);
    return mapDoc<MilkCollection>(doc);
  }

  async getDailyReport(date: Date | string, endDate?: Date | string): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const { start, end } = getUtcDayBounds(date, endDate);
    const docs = await model.find({ date: { $gte: start, $lte: end } }).sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<MilkCollection>(doc));
  }

  async getRecent(limit: number): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1, createdAt: -1 }).limit(clampLimit(limit, 10, 200)).lean();
    return docs.map((doc) => mapDoc<MilkCollection>(doc));
  }

  async getTrend(days: number): Promise<MilkCollection[]> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const clampedDays = clampLimit(days, 7, 365);
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - clampedDays, 0, 0, 0, 0));
    const docs = await model
      .find({ date: { $gte: start } })
      .select('farmerInternalId farmerId farmerName date shift milkType quantity fat snf rate amount')
      .sort({ date: 1 })
      .lean();
    return docs.map((doc) => mapDoc<MilkCollection>(doc));
  }

  async update(id: string, collection: Partial<MilkCollection>, expectedVersion?: number): Promise<MilkCollection> {
    assertValidObjectId(id, 'collection');
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const { version: _v, expectedVersion: _ev, baseVersion: _bv, ...cleanUpdates } = collection as any;
    const versionMatch =
      expectedVersion !== undefined
        ? { $or: [{ version: expectedVersion }, { version: { $exists: false } }] }
        : {};
    const doc = await model
      .findOneAndUpdate(
        { _id: id, ...versionMatch },
        { $set: { ...cleanUpdates, updatedAt: new Date() }, $inc: { version: 1 } },
        { new: true }
      )
      .lean();
    if (!doc) {
      if (expectedVersion !== undefined) {
        const current = await this.getById(id);
        if (current) {
          throw new ConflictError('Collection record version conflict', 'VERSION_CONFLICT', {
            serverRecord: current,
            serverVersion: current.version ?? 1,
            localVersion: expectedVersion,
          });
        }
      }
      throw new NotFoundError('Collection record not found', 'COLLECTION_NOT_FOUND');
    }
    return mapDoc<MilkCollection>(doc);
  }

  async getByFarmerInternalId(id: string): Promise<MilkCollection[]> {
    const databaseId = getDatabaseId();
    const model = await dbManager.getCollectionModel(databaseId);

    let farmerInternalId = id;
    if (!OBJECT_ID_REGEX.test(id)) {
      const farmerModel = await dbManager.getFarmerModel(databaseId);
      const farmer = await farmerModel.findOne({ farmerId: id }).select('_id').lean();
      if (farmer) {
        farmerInternalId = farmer._id.toString();
      }
    }

    const docs = await model.find({ farmerInternalId }).sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<MilkCollection>(doc));
  }

  async findDuplicatePour(
    farmerInternalId: string,
    date: Date | string,
    shift: 'Morning' | 'Evening'
  ): Promise<MilkCollection | null> {
    const model = await dbManager.getCollectionModel(getDatabaseId());
    const { start, end } = getUtcDayBounds(date);
    const doc = await model
      .findOne({
        farmerInternalId,
        shift,
        date: { $gte: start, $lte: end },
      })
      .lean();
    return doc ? mapDoc<MilkCollection>(doc) : null;
  }
}

// --- Rate Chart Repository ---
export class MongoRateChartRepository implements IRateChartRepository {
  private normalizeRateInput(rate: Partial<RateChart>): Partial<RateChart> {
    const normalized: any = { ...rate };
    if (normalized.fat !== undefined) {
      if (normalized.fatMin === undefined) normalized.fatMin = normalized.fat;
      if (normalized.fatMax === undefined) normalized.fatMax = normalized.fat;
    }
    if (normalized.snf !== undefined) {
      if (normalized.snfMin === undefined) normalized.snfMin = normalized.snf;
      if (normalized.snfMax === undefined) normalized.snfMax = normalized.snf;
    }
    if (normalized.rate !== undefined && normalized.ratePerLiter === undefined) {
      normalized.ratePerLiter = normalized.rate;
    }
    if (normalized.ratePerLiter !== undefined && normalized.rate === undefined) {
      normalized.rate = normalized.ratePerLiter;
    }
    if (normalized.fatMin !== undefined && normalized.fat === undefined) {
      normalized.fat = normalized.fatMin;
    }
    if (normalized.snfMin !== undefined && normalized.snf === undefined) {
      normalized.snf = normalized.snfMin;
    }
    return normalized;
  }

  async getRate(fat: number, snf: number, milkType?: string): Promise<number> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const baseFilter = {
      fatMin: { $lte: fat },
      fatMax: { $gte: fat },
      snfMin: { $lte: snf },
      snfMax: { $gte: snf },
    };

    if (milkType === 'Cow' || milkType === 'Buffalo' || milkType === 'Mixed') {
      const typedDoc = await model.findOne({ ...baseFilter, milkType }).lean();
      if (typedDoc) return typedDoc.ratePerLiter ?? typedDoc.rate ?? 0;
    }

    const doc = await model.findOne(baseFilter).lean();
    return doc ? doc.ratePerLiter ?? doc.rate ?? 0 : 0;
  }

  async getAll(): Promise<RateChart[]> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const docs = await model.find().lean();
    return docs.map((doc) => {
      const mapped = mapDoc<RateChart>(doc);
      // Ensure compatibility with both UI and API consumers
      if (mapped.rate === undefined && mapped.ratePerLiter !== undefined) mapped.rate = mapped.ratePerLiter;
      if (mapped.ratePerLiter === undefined && mapped.rate !== undefined) mapped.ratePerLiter = mapped.rate;
      if (mapped.fat === undefined && mapped.fatMin !== undefined) mapped.fat = mapped.fatMin;
      if (mapped.snf === undefined && mapped.snfMin !== undefined) mapped.snf = mapped.snfMin;
      return mapped;
    });
  }

  async getById(id: string): Promise<RateChart | null> {
    assertValidObjectId(id, 'rate chart');
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const doc = await model.findById(id).lean();
    return doc ? mapDoc<RateChart>(doc) : null;
  }

  async create(rate: Omit<RateChart, 'id'>): Promise<RateChart> {
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const normalized = this.normalizeRateInput(rate);
    const doc = await model.create(normalized);
    return mapDoc<RateChart>(doc);
  }

  async update(id: string, rate: Partial<RateChart>, expectedVersion?: number): Promise<RateChart> {
    assertValidObjectId(id, 'rate chart');
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const normalized = this.normalizeRateInput(rate);
    const { version: _v, expectedVersion: _ev, baseVersion: _bv, ...cleanNormalized } = normalized as any;
    const versionMatch =
      expectedVersion !== undefined
        ? { $or: [{ version: expectedVersion }, { version: { $exists: false } }] }
        : {};
    const doc = await model
      .findOneAndUpdate(
        { _id: id, ...versionMatch },
        { $set: { ...cleanNormalized, updatedAt: new Date() }, $inc: { version: 1 } },
        { new: true }
      )
      .lean();
    if (!doc) {
      if (expectedVersion !== undefined) {
        const current = await this.getById(id);
        if (current) {
          throw new ConflictError('Rate chart version conflict', 'VERSION_CONFLICT', {
            serverRecord: current,
            serverVersion: current.version ?? 1,
            localVersion: expectedVersion,
          });
        }
      }
      throw new NotFoundError('Rate chart entry not found', 'RATE_NOT_FOUND');
    }
    return mapDoc<RateChart>(doc);
  }

  async delete(id: string): Promise<void> {
    assertValidObjectId(id, 'rate chart');
    const model = await dbManager.getRateChartModel(getDatabaseId());
    const deleted = await model.findByIdAndDelete(id).lean();
    if (!deleted) throw new NotFoundError('Rate chart entry not found', 'RATE_NOT_FOUND');
  }
}

// --- Ledger Repository ---
export class MongoLedgerRepository implements ILedgerRepository {
  async addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const doc = await model.create(entry);
    return mapDoc<LedgerEntry>(doc);
  }

  async addEntryIfNotExists(entry: Omit<LedgerEntry, 'id'>): Promise<{ entry: LedgerEntry; created: boolean }> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const result = await model.findOneAndUpdate(
      { referenceId: entry.referenceId },
      { $setOnInsert: entry },
      { upsert: true, new: true, includeResultMetadata: true }
    );
    const created = !result.lastErrorObject?.updatedExisting;
    return {
      entry: mapDoc<LedgerEntry>(result.value),
      created,
    };
  }

  async getByFarmerInternalId(id: string): Promise<LedgerEntry[]> {
    const databaseId = getDatabaseId();
    const model = await dbManager.getLedgerModel(databaseId);

    let farmerInternalId = id;
    if (!OBJECT_ID_REGEX.test(id)) {
      const farmerModel = await dbManager.getFarmerModel(databaseId);
      const farmer = await farmerModel.findOne({ farmerId: id }).select('_id').lean();
      if (farmer) {
        farmerInternalId = farmer._id.toString();
      }
    }

    const docs = await model.find({ farmerInternalId }).sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<LedgerEntry>(doc));
  }

  async getAll(): Promise<LedgerEntry[]> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<LedgerEntry>(doc));
  }

  async getByReferenceId(referenceId: string): Promise<LedgerEntry | null> {
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const doc = await model.findOne({ referenceId }).lean();
    return doc ? mapDoc<LedgerEntry>(doc) : null;
  }

  async getByReferenceIds(referenceIds: string[]): Promise<LedgerEntry[]> {
    if (referenceIds.length === 0) return [];
    const model = await dbManager.getLedgerModel(getDatabaseId());
    const docs = await model.find({ referenceId: { $in: referenceIds } }).lean();
    return docs.map((doc) => mapDoc<LedgerEntry>(doc));
  }
}

// --- Shift Summary Repository ---
export class MongoShiftSummaryRepository implements IShiftSummaryRepository {
  async create(summary: Omit<ShiftSummary, 'id'>): Promise<ShiftSummary> {
    const model = await dbManager.getShiftSummaryModel(getDatabaseId());
    const doc = await model.create(summary);
    return mapDoc<ShiftSummary>(doc);
  }

  async getByDateAndShift(date: string, shift: 'Morning' | 'Evening'): Promise<ShiftSummary | null> {
    const model = await dbManager.getShiftSummaryModel(getDatabaseId());
    const doc = await model.findOne({ date, shift }).lean();
    return doc ? mapDoc<ShiftSummary>(doc) : null;
  }

  async getRecent(limit: number): Promise<ShiftSummary[]> {
    const model = await dbManager.getShiftSummaryModel(getDatabaseId());
    const docs = await model.find().sort({ closedAt: -1 }).limit(clampLimit(limit, 10, 100)).lean();
    return docs.map((doc) => mapDoc<ShiftSummary>(doc));
  }
}

// --- Sale Repository ---
export class MongoSaleRepository implements ISaleRepository {
  async create(sale: Omit<MilkSale, 'id' | 'createdAt'>): Promise<MilkSale> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const doc = await model.create(sale);
    return mapDoc<MilkSale>(doc);
  }

  async getDailyReport(date: Date | string): Promise<MilkSale[]> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const { start, end } = getUtcDayBounds(date);
    const docs = await model.find({ date: { $gte: start, $lte: end } }).sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<MilkSale>(doc));
  }

  async getAll(): Promise<MilkSale[]> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<MilkSale>(doc));
  }

  async getRecent(limit: number): Promise<MilkSale[]> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1 }).limit(clampLimit(limit, 20, 200)).lean();
    return docs.map((doc) => mapDoc<MilkSale>(doc));
  }

  async getByCustomerId(customerId: string): Promise<MilkSale[]> {
    const model = await dbManager.getSaleModel(getDatabaseId());
    const docs = await model.find({ customerId }).sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<MilkSale>(doc));
  }

  async delete(id: string): Promise<void> {
    assertValidObjectId(id, 'sale');
    const model = await dbManager.getSaleModel(getDatabaseId());
    await model.findByIdAndDelete(id).lean();
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
    const docs = await model.find().lean();
    return docs.map((doc) => mapDoc<Customer>(doc));
  }

  async getById(id: string): Promise<Customer | null> {
    if (!id || !OBJECT_ID_REGEX.test(id)) return null;
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const doc = await model.findById(id).lean();
    return doc ? mapDoc<Customer>(doc) : null;
  }

  async update(id: string, customer: Partial<Customer>, expectedVersion?: number): Promise<Customer> {
    assertValidObjectId(id, 'customer');
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const { version: _v, expectedVersion: _ev, baseVersion: _bv, ...cleanUpdates } = customer as any;
    const versionMatch =
      expectedVersion !== undefined
        ? { $or: [{ version: expectedVersion }, { version: { $exists: false } }] }
        : {};
    const doc = await model
      .findOneAndUpdate(
        { _id: id, ...versionMatch },
        { $set: { ...cleanUpdates, updatedAt: new Date() }, $inc: { version: 1 } },
        { new: true }
      )
      .lean();
    if (!doc) {
      if (expectedVersion !== undefined) {
        const current = await this.getById(id);
        if (current) {
          throw new ConflictError('Customer record version conflict', 'VERSION_CONFLICT', {
            serverRecord: current,
            serverVersion: current.version ?? 1,
            localVersion: expectedVersion,
          });
        }
      }
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }
    return mapDoc<Customer>(doc);
  }

  async delete(id: string): Promise<void> {
    assertValidObjectId(id, 'customer');
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const deleted = await model.findByIdAndDelete(id).lean();
    if (!deleted) throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  async updateBalance(id: string, amount: number): Promise<void> {
    assertValidObjectId(id, 'customer');
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const field = amount > 0 ? 'totalSales' : 'totalPaid';
    const incObj: Record<string, number> = { balance: amount };
    if (amount !== 0) {
      incObj[field] = Math.abs(amount);
    }
    const updated = await model.findByIdAndUpdate(id, { $inc: incObj }).lean();
    if (!updated) throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  async applySale(
    id: string,
    impact: { balanceDelta: number; salesDelta: number; paidDelta: number }
  ): Promise<Customer | null> {
    assertValidObjectId(id, 'customer');
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const doc = await model
      .findByIdAndUpdate(
        id,
        {
          $inc: {
            balance: impact.balanceDelta,
            totalSales: impact.salesDelta,
            totalPaid: impact.paidDelta,
          },
        },
        { new: true }
      )
      .lean();
    return doc ? mapDoc<Customer>(doc) : null;
  }

  async recordPaymentBalance(id: string, amount: number): Promise<Customer | null> {
    assertValidObjectId(id, 'customer');
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const doc = await model
      .findByIdAndUpdate(
        id,
        {
          $inc: {
            balance: -amount,
            totalPaid: amount,
          },
        },
        { new: true }
      )
      .lean();
    return doc ? mapDoc<Customer>(doc) : null;
  }

  async getTotalBalance(): Promise<number> {
    const model = await dbManager.getCustomerModel(getDatabaseId());
    const result = await model.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
    return result[0]?.total || 0;
  }
}

export class MongoCustomerPaymentRepository implements ICustomerPaymentRepository {
  async create(payment: Omit<CustomerPayment, 'id' | 'createdAt'>): Promise<CustomerPayment> {
    const model = await dbManager.getCustomerPaymentModel(getDatabaseId());
    const doc = await model.create(payment);
    return mapDoc<CustomerPayment>(doc);
  }

  async getRecent(limit: number): Promise<CustomerPayment[]> {
    const model = await dbManager.getCustomerPaymentModel(getDatabaseId());
    const docs = await model.find().sort({ date: -1 }).limit(clampLimit(limit, 50, 500)).lean();
    return docs.map((doc) => mapDoc<CustomerPayment>(doc));
  }

  async getByCustomerId(customerId: string): Promise<CustomerPayment[]> {
    const model = await dbManager.getCustomerPaymentModel(getDatabaseId());
    const docs = await model.find({ customerId }).sort({ date: -1 }).lean();
    return docs.map((doc) => mapDoc<CustomerPayment>(doc));
  }

  async delete(id: string): Promise<void> {
    assertValidObjectId(id, 'customer payment');
    const model = await dbManager.getCustomerPaymentModel(getDatabaseId());
    await model.findByIdAndDelete(id).lean();
  }
}

// --- User Repository ---
export class MongoUserRepository implements IUserRepository {
  async getById(id: string): Promise<User | null> {
    if (!id || !OBJECT_ID_REGEX.test(id)) return null;
    const model = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const doc = await model.findById(id).lean();
    return doc ? mapDoc<User>(doc) : null;
  }

  async getByUsername(username: string): Promise<User | null> {
    if (!username) return null;
    const model = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const normalized = username.trim().toLowerCase();
    // Try indexed exact lowercase match first, then case-insensitive fallback for legacy data
    const exact = await model.findOne({ username: normalized }).lean();
    if (exact) return mapDoc<User>(exact);
    const regexDoc = await model
      .findOne({ username: { $regex: new RegExp(`^${escapeRegex(username.trim())}$`, 'i') } })
      .lean();
    return regexDoc ? mapDoc<User>(regexDoc) : null;
  }

  async getByEmail(email: string): Promise<User | null> {
    if (!email) return null;
    const model = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const normalized = email.trim().toLowerCase();
    const doc = await model.findOne({ email: normalized }).lean();
    return doc ? mapDoc<User>(doc) : null;
  }

  async getByUsernameOrEmail(identifier: string): Promise<User | null> {
    if (!identifier) return null;
    const model = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const normalized = identifier.trim().toLowerCase();
    const exact = await model.findOne({ $or: [{ username: normalized }, { email: normalized }] }).lean();
    if (exact) return mapDoc<User>(exact);
    const pattern = new RegExp(`^${escapeRegex(identifier.trim())}$`, 'i');
    const regexDoc = await model.findOne({ $or: [{ username: pattern }, { email: pattern }] }).lean();
    return regexDoc ? mapDoc<User>(regexDoc) : null;
  }

  async getAll(filter: { role?: 'admin' | 'operator' | 'super_admin'; dairyId?: string; databaseId?: string } = {}): Promise<User[]> {
    const model = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const docs = await model
      .find(filter)
      .select('-passwordHash -otp -otpExpires -otpAttempts -currentSessionId')
      .lean();
    return docs.map((doc) => mapDoc<User>(doc));
  }

  async create(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const model = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const doc = await model.create(user);
    return mapDoc<User>(doc);
  }

  async update(id: string, user: Partial<User>): Promise<User> {
    assertValidObjectId(id, 'user');
    const model = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const doc = await model.findByIdAndUpdate(id, { $set: user }, { new: true }).lean();
    if (!doc) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    return mapDoc<User>(doc);
  }

  async delete(id: string): Promise<void> {
    assertValidObjectId(id, 'user');
    const model = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const deleted = await model.findByIdAndDelete(id).lean();
    if (!deleted) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }
}

// --- Settings Repository ---
export class MongoSettingsRepository implements ISettingsRepository {
  async get(key: string): Promise<any> {
    const model = await dbManager.getSettingsModel(getDatabaseId());
    const doc = await model.findOne({ key }).lean();
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
  async create(dairy: Omit<Dairy, 'id' | 'createdAt'>): Promise<Dairy> {
    const model = await dbManager.getDairyModel(DEFAULT_DATABASE_ID);
    const doc = await model.create(dairy);
    return mapDoc<Dairy>(doc);
  }

  async getByOwnerId(ownerId: string): Promise<Dairy | null> {
    const model = await dbManager.getDairyModel(DEFAULT_DATABASE_ID);
    const doc = await model.findOne({ ownerId }).lean();
    return doc ? mapDoc<Dairy>(doc) : null;
  }

  async getById(id: string): Promise<Dairy | null> {
    if (!id) return null;
    const model = await dbManager.getDairyModel(DEFAULT_DATABASE_ID);
    if (OBJECT_ID_REGEX.test(id)) {
      const doc = await model.findById(id).lean();
      if (doc) return mapDoc<Dairy>(doc);
    }
    const docByDb = await model.findOne({ databaseId: id }).lean();
    return docByDb ? mapDoc<Dairy>(docByDb) : null;
  }

  async getByDatabaseId(databaseId: string): Promise<Dairy | null> {
    if (!databaseId) return null;
    const model = await dbManager.getDairyModel(DEFAULT_DATABASE_ID);
    const doc = await model.findOne({ databaseId }).lean();
    return doc ? mapDoc<Dairy>(doc) : null;
  }

  async getAll(): Promise<Dairy[]> {
    const model = await dbManager.getDairyModel(DEFAULT_DATABASE_ID);
    const docs = await model.find().lean();
    return docs.map((doc) => mapDoc<Dairy>(doc));
  }

  async update(id: string, dairy: Partial<Dairy>): Promise<Dairy> {
    const model = await dbManager.getDairyModel(DEFAULT_DATABASE_ID);
    let doc: any = null;
    if (OBJECT_ID_REGEX.test(id)) {
      doc = await model.findByIdAndUpdate(id, { $set: { ...dairy, updatedAt: new Date() } }, { new: true }).lean();
    }
    if (!doc) {
      doc = await model
        .findOneAndUpdate({ databaseId: id }, { $set: { ...dairy, updatedAt: new Date() } }, { new: true })
        .lean();
    }
    if (!doc) throw new NotFoundError('Dairy not found', 'DAIRY_NOT_FOUND');
    return mapDoc<Dairy>(doc);
  }
}

// --- Login Audit Repository ---
export class MongoLoginAuditRepository implements ILoginAuditRepository {
  async create(audit: Omit<LoginAudit, 'id'>): Promise<LoginAudit> {
    const model = await dbManager.getLoginAuditModel(SUPERADMIN_DATABASE_ID);
    const doc = await model.create(audit);
    return mapDoc<LoginAudit>(doc);
  }

  async getAll(limit: number = 200): Promise<LoginAudit[]> {
    const model = await dbManager.getLoginAuditModel(SUPERADMIN_DATABASE_ID);
    const docs = await model.find().sort({ loginAt: -1 }).limit(clampLimit(limit, 200, 1000)).lean();
    return docs.map((doc) => mapDoc<LoginAudit>(doc));
  }

  async getFiltered(filter: AuditLogFilter): Promise<PaginatedResult<LoginAudit>> {
    const model = await dbManager.getLoginAuditModel(SUPERADMIN_DATABASE_ID);
    const query: Record<string, any> = {};

    if (filter.userId) query.userId = filter.userId;
    if (filter.status) query.status = filter.status;
    if (filter.databaseId) query.databaseId = filter.databaseId;
    if (filter.startDate || filter.endDate) {
      query.loginAt = {};
      if (filter.startDate) query.loginAt.$gte = filter.startDate;
      if (filter.endDate) query.loginAt.$lte = filter.endDate;
    }
    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search.trim()), 'i');
      query.$or = [
        { username: rx },
        { role: rx },
        { ipAddress: rx },
        { 'device.model': rx },
        { failureReason: rx },
      ];
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = clampLimit(filter.limit, 50, 200);
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      model.find(query).sort({ loginAt: -1 }).skip(skip).limit(limit).lean(),
      model.countDocuments(query),
    ]);

    return {
      items: docs.map((doc) => mapDoc<LoginAudit>(doc)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getByUserId(userId: string, limit: number = 100): Promise<LoginAudit[]> {
    const model = await dbManager.getLoginAuditModel(SUPERADMIN_DATABASE_ID);
    const docs = await model.find({ userId }).sort({ loginAt: -1 }).limit(clampLimit(limit, 100, 500)).lean();
    return docs.map((doc) => mapDoc<LoginAudit>(doc));
  }
}

// --- Activity Log Repository ---
export class MongoActivityLogRepository implements IActivityLogRepository {
  async create(log: Omit<ActivityLog, 'id'>): Promise<ActivityLog> {
    const model = await dbManager.getActivityLogModel(SUPERADMIN_DATABASE_ID);
    const doc = await model.create(log);
    return mapDoc<ActivityLog>(doc);
  }

  async createManyIdempotent(logs: Array<Omit<ActivityLog, 'id'>>): Promise<{ inserted: number; skipped: number }> {
    if (logs.length === 0) return { inserted: 0, skipped: 0 };
    const model = await dbManager.getActivityLogModel(SUPERADMIN_DATABASE_ID);
    let inserted = 0;
    let skipped = 0;
    for (const log of logs) {
      if (log.logId) {
        const res = await model.updateOne(
          { logId: log.logId },
          { $setOnInsert: log },
          { upsert: true }
        );
        if (res.upsertedCount > 0) inserted++;
        else skipped++;
      } else {
        await model.create(log);
        inserted++;
      }
    }
    return { inserted, skipped };
  }

  async getAll(limit: number = 100): Promise<ActivityLog[]> {
    const model = await dbManager.getActivityLogModel(SUPERADMIN_DATABASE_ID);
    const docs = await model.find().sort({ timestamp: -1 }).limit(clampLimit(limit, 100, 1000)).lean();
    return docs.map((doc) => mapDoc<ActivityLog>(doc));
  }

  async getById(id: string): Promise<ActivityLog | null> {
    if (!id) return null;
    const model = await dbManager.getActivityLogModel(SUPERADMIN_DATABASE_ID);
    if (OBJECT_ID_REGEX.test(id)) {
      const doc = await model.findById(id).lean();
      if (doc) return mapDoc<ActivityLog>(doc);
    }
    const byLogId = await model.findOne({ logId: id }).lean();
    return byLogId ? mapDoc<ActivityLog>(byLogId) : null;
  }

  async getFiltered(filter: AuditLogFilter): Promise<PaginatedResult<ActivityLog>> {
    const model = await dbManager.getActivityLogModel(SUPERADMIN_DATABASE_ID);
    const query: Record<string, any> = {};

    if (filter.userId) query.userId = filter.userId;
    if (filter.action) query.action = filter.action;
    if (filter.targetType) query.targetType = filter.targetType;
    if (filter.status) query.operationStatus = filter.status;
    if (filter.databaseId) query.databaseId = filter.databaseId;
    if (filter.syncStatus) query.syncStatus = filter.syncStatus;
    if (filter.startDate || filter.endDate) {
      query.timestamp = {};
      if (filter.startDate) query.timestamp.$gte = filter.startDate;
      if (filter.endDate) query.timestamp.$lte = filter.endDate;
    }
    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search.trim()), 'i');
      query.$or = [
        { username: rx },
        { action: rx },
        { targetType: rx },
        { targetId: rx },
        { correlationId: rx },
        { logId: rx },
        { errorDetails: rx },
      ];
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = clampLimit(filter.limit, 50, 200);
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      model.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      model.countDocuments(query),
    ]);

    return {
      items: docs.map((doc) => mapDoc<ActivityLog>(doc)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getByUserId(userId: string, limit: number = 100): Promise<ActivityLog[]> {
    const model = await dbManager.getActivityLogModel(SUPERADMIN_DATABASE_ID);
    const docs = await model.find({ userId }).sort({ timestamp: -1 }).limit(clampLimit(limit, 100, 500)).lean();
    return docs.map((doc) => mapDoc<ActivityLog>(doc));
  }

  async getByAction(action: string, limit: number = 100): Promise<ActivityLog[]> {
    const model = await dbManager.getActivityLogModel(SUPERADMIN_DATABASE_ID);
    const docs = await model.find({ action }).sort({ timestamp: -1 }).limit(clampLimit(limit, 100, 500)).lean();
    return docs.map((doc) => mapDoc<ActivityLog>(doc));
  }
}
