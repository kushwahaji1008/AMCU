/**
 * DatabaseManager
 *
 * Implements a multi-tenant database architecture over a single shared
 * MongoDB connection pool using Mongoose's `useDb(..., { useCache: true })`.
 * Uses an initialization mutex to prevent parallel connection storms and
 * supports clean connection lifecycle management and graceful shutdown.
 */

import mongoose, { Connection, Model, Document, Schema } from 'mongoose';
import {
  FarmerSchema,
  CollectionSchema,
  RateChartSchema,
  LedgerSchema,
  SaleSchema,
  CustomerSchema,
  UserSchema,
  DairySchema,
  ShiftSummarySchema,
  LoginAuditSchema,
  SettingsSchema,
  CustomerPaymentSchema,
  ActivityLogSchema,
  IdempotencySchema,
  SyncConflictSchema,
  SmsLogSchema,
} from './Models';
import { Farmer } from '../../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry, ShiftSummary } from '../../../Core/Entities/Collection';
import { MilkSale, Customer, User, CustomerPayment } from '../../../Core/Entities/Sale';
import { Dairy } from '../../../Core/Entities/Dairy';
import { LoginAudit, ActivityLog, IdempotencyRecord, SyncConflict, SmsLog } from '../../../Core/Entities/Audit';
import { DEFAULT_DATABASE_ID, isValidDatabaseId, toMongoDatabaseName } from '../../../Core/RequestContext';
import { ValidationError } from '../../../Core/Errors';

class DatabaseManager {
  private baseConnection: Connection | null = null;
  private connectPromise: Promise<Connection> | null = null;
  private tenantConnections: Map<string, Connection> = new Map();

  private async ensureBaseConnection(): Promise<Connection> {
    if (this.baseConnection && this.baseConnection.readyState === 1) {
      return this.baseConnection;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not found');
    }

    this.connectPromise = (async () => {
      try {
        const conn = mongoose.createConnection(uri, {
          dbName: toMongoDatabaseName(DEFAULT_DATABASE_ID),
          maxPoolSize: 20,
          minPoolSize: 1,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
          socketTimeoutMS: 45000,
        });

        await conn.asPromise();

        conn.on('disconnected', () => {
          console.warn('[DatabaseManager] Base MongoDB connection disconnected.');
          this.tenantConnections.clear();
          if (this.baseConnection === conn) {
            this.baseConnection = null;
          }
        });

        conn.on('error', (err) => {
          console.error('[DatabaseManager] Base MongoDB connection error:', err.message);
        });

        this.baseConnection = conn;
        return conn;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  /**
   * Retrieves or creates a logical tenant database handle sharing the base pool.
   */
  async getConnection(databaseId: string): Promise<Connection> {
    if (!isValidDatabaseId(databaseId)) {
      throw new ValidationError('Invalid database context identifier', 'INVALID_DATABASE_ID');
    }

    const dbName = toMongoDatabaseName(databaseId);
    const cached = this.tenantConnections.get(dbName);
    if (cached && this.baseConnection && this.baseConnection.readyState === 1) {
      return cached;
    }

    const base = await this.ensureBaseConnection();
    const tenantConn = dbName === base.name ? base : base.useDb(dbName, { useCache: true });
    this.tenantConnections.set(dbName, tenantConn);
    return tenantConn;
  }

  /**
   * Helper to get a Mongoose model for a specific tenant database.
   */
  async getModel<T extends Document>(databaseId: string, name: string, schema: Schema<any>): Promise<Model<T>> {
    const conn = await this.getConnection(databaseId);
    return conn.models[name] ? (conn.models[name] as Model<T>) : conn.model<T>(name, schema as any);
  }

  isConnected(): boolean {
    return this.baseConnection?.readyState === 1;
  }

  getConnectionState(): 'connected' | 'connecting' | 'disconnected' | 'unconfigured' {
    if (!process.env.MONGODB_URI) return 'unconfigured';
    if (!this.baseConnection) {
      return this.connectPromise ? 'connecting' : 'disconnected';
    }
    switch (this.baseConnection.readyState) {
      case 1:
        return 'connected';
      case 2:
        return 'connecting';
      default:
        return 'disconnected';
    }
  }

  async closeAll(): Promise<void> {
    this.tenantConnections.clear();
    if (this.baseConnection) {
      const conn = this.baseConnection;
      this.baseConnection = null;
      await conn.close();
    }
  }

  // --- Model Getters ---

  async getFarmerModel(databaseId: string) {
    return this.getModel<Farmer & Document>(databaseId, 'Farmer', FarmerSchema);
  }

  async getCollectionModel(databaseId: string) {
    return this.getModel<MilkCollection & Document>(databaseId, 'Collection', CollectionSchema);
  }

  async getRateChartModel(databaseId: string) {
    return this.getModel<RateChart & Document>(databaseId, 'RateChart', RateChartSchema);
  }

  async getLedgerModel(databaseId: string) {
    return this.getModel<LedgerEntry & Document>(databaseId, 'Ledger', LedgerSchema);
  }

  async getShiftSummaryModel(databaseId: string) {
    return this.getModel<ShiftSummary & Document>(databaseId, 'ShiftSummary', ShiftSummarySchema);
  }

  async getSaleModel(databaseId: string) {
    return this.getModel<MilkSale & Document>(databaseId, 'Sale', SaleSchema);
  }

  async getCustomerModel(databaseId: string) {
    return this.getModel<Customer & Document>(databaseId, 'Customer', CustomerSchema);
  }

  async getCustomerPaymentModel(databaseId: string) {
    return this.getModel<CustomerPayment & Document>(databaseId, 'CustomerPayment', CustomerPaymentSchema);
  }

  async getUserModel(databaseId: string) {
    return this.getModel<User & Document>(databaseId, 'User', UserSchema);
  }

  async getDairyModel(databaseId: string) {
    return this.getModel<Dairy & Document>(databaseId, 'Dairy', DairySchema);
  }

  async getSettingsModel(databaseId: string) {
    return this.getModel<any & Document>(databaseId, 'Settings', SettingsSchema);
  }

  async getLoginAuditModel(databaseId: string) {
    return this.getModel<LoginAudit & Document>(databaseId, 'LoginAudit', LoginAuditSchema);
  }

  async getActivityLogModel(databaseId: string) {
    return this.getModel<ActivityLog & Document>(databaseId, 'ActivityLog', ActivityLogSchema);
  }

  async getIdempotencyModel(databaseId: string) {
    return this.getModel<IdempotencyRecord & Document>(databaseId, 'IdempotencyRecord', IdempotencySchema);
  }

  async getSyncConflictModel(databaseId: string) {
    return this.getModel<SyncConflict & Document>(databaseId, 'SyncConflict', SyncConflictSchema);
  }

  async getSmsLogModel(databaseId: string) {
    return this.getModel<SmsLog & Document>(databaseId, 'SmsLog', SmsLogSchema);
  }
}

export const dbManager = new DatabaseManager();
