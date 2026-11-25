import mongoose from 'mongoose';
import {
  IIdempotencyRepository,
  ISyncConflictRepository,
  ISmsLogRepository,
} from '../../Application/Interfaces/IRepositories';
import { IdempotencyRecord, SyncConflict, SmsLog } from '../../Core/Entities/Audit';
import { dbManager } from '../Persistence/Mongo/DatabaseManager';
import { getDatabaseId } from '../../Core/RequestContext';
import { NotFoundError, ValidationError } from '../../Core/Errors';

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

export class MongoIdempotencyRepository implements IIdempotencyRepository {
  async getByKey(key: string): Promise<IdempotencyRecord | null> {
    const model = await dbManager.getIdempotencyModel(getDatabaseId());
    const doc = await model.findOne({ key }).lean();
    return doc ? mapDoc<IdempotencyRecord>(doc) : null;
  }

  async acquire(
    key: string,
    method: string,
    path: string,
    requestHash: string,
    userId?: string
  ): Promise<'acquired' | 'in_progress' | 'completed' | 'hash_mismatch'> {
    const model = await dbManager.getIdempotencyModel(getDatabaseId());
    try {
      await model.create({
        key,
        method,
        path,
        requestHash,
        status: 'in_progress',
        userId,
        createdAt: new Date(),
      });
      return 'acquired';
    } catch (err: any) {
      if (err?.code !== 11000) {
        throw err;
      }
      const existing = await model.findOne({ key }).lean();
      if (!existing) return 'acquired';
      if (existing.requestHash !== requestHash) return 'hash_mismatch';
      return existing.status === 'completed' ? 'completed' : 'in_progress';
    }
  }

  async complete(key: string, responseStatus: number, responseBody: any): Promise<void> {
    const model = await dbManager.getIdempotencyModel(getDatabaseId());
    await model.findOneAndUpdate(
      { key },
      { $set: { status: 'completed', responseStatus, responseBody } }
    );
  }

  async release(key: string): Promise<void> {
    const model = await dbManager.getIdempotencyModel(getDatabaseId());
    await model.deleteOne({ key, status: 'in_progress' });
  }
}

export class MongoSyncConflictRepository implements ISyncConflictRepository {
  async create(conflict: Omit<SyncConflict, 'id' | 'createdAt'>): Promise<SyncConflict> {
    const model = await dbManager.getSyncConflictModel(getDatabaseId());
    const doc = await model.create({ ...conflict, createdAt: new Date() });
    return mapDoc<SyncConflict>(doc);
  }

  async getById(id: string): Promise<SyncConflict | null> {
    if (!id || !mongoose.isValidObjectId(id)) return null;
    const model = await dbManager.getSyncConflictModel(getDatabaseId());
    const doc = await model.findById(id).lean();
    return doc ? mapDoc<SyncConflict>(doc) : null;
  }

  async getAll(status?: SyncConflict['status']): Promise<SyncConflict[]> {
    const model = await dbManager.getSyncConflictModel(getDatabaseId());
    const query = status ? { status } : {};
    const docs = await model.find(query).sort({ createdAt: -1 }).limit(200).lean();
    return docs.map((doc) => mapDoc<SyncConflict>(doc));
  }

  async resolve(id: string, status: SyncConflict['status'], resolvedBy: string): Promise<SyncConflict> {
    if (!id || !mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid conflict ID', 'INVALID_ID');
    }
    const model = await dbManager.getSyncConflictModel(getDatabaseId());
    const doc = await model
      .findByIdAndUpdate(
        id,
        { $set: { status, resolvedBy, resolvedAt: new Date() } },
        { new: true }
      )
      .lean();
    if (!doc) throw new NotFoundError('Sync conflict not found', 'CONFLICT_NOT_FOUND');
    return mapDoc<SyncConflict>(doc);
  }
}

export class MongoSmsLogRepository implements ISmsLogRepository {
  async upsertByIdempotencyKey(log: Partial<SmsLog> & { idempotencyKey: string }): Promise<SmsLog> {
    const model = await dbManager.getSmsLogModel(getDatabaseId());
    const now = new Date();
    const { id: _id, idempotencyKey, createdAt, updatedAt: _u, ...rest } = log;

    const doc = await model
      .findOneAndUpdate(
        { idempotencyKey },
        {
          $set: {
            ...rest,
            updatedAt: now,
          },
          $setOnInsert: {
            idempotencyKey,
            createdAt: createdAt ? new Date(createdAt) : now,
          },
        },
        { upsert: true, new: true }
      )
      .lean();

    return mapDoc<SmsLog>(doc);
  }

  async getAll(filter: { status?: string; recipientType?: string; recipientId?: string; limit?: number } = {}): Promise<SmsLog[]> {
    const model = await dbManager.getSmsLogModel(getDatabaseId());
    const query: Record<string, any> = {};
    if (filter.status) query.status = filter.status;
    if (filter.recipientType) query.recipientType = filter.recipientType;
    if (filter.recipientId) query.recipientId = filter.recipientId;
    const limit = Math.min(Math.max(filter.limit || 100, 1), 500);
    const docs = await model.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map((doc) => mapDoc<SmsLog>(doc));
  }

  async getByIdempotencyKey(key: string): Promise<SmsLog | null> {
    const model = await dbManager.getSmsLogModel(getDatabaseId());
    const doc = await model.findOne({ idempotencyKey: key }).lean();
    return doc ? mapDoc<SmsLog>(doc) : null;
  }
}
