import mongoose, { Connection, Model, Document } from 'mongoose';
import { 
  FarmerSchema, 
  CollectionSchema, 
  RateChartSchema, 
  LedgerSchema, 
  SaleSchema, 
  CustomerSchema, 
  UserSchema,
  DairySchema 
} from './Models';
import { Farmer } from '../../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry } from '../../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../../Core/Entities/Sale';

class DatabaseManager {
  private connections: Map<string, Connection> = new Map();

  async getConnection(databaseId: string): Promise<Connection> {
    const dbName = databaseId === '(default)' ? 'dugdhaset_registry' : `dugdhaset_${databaseId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    if (this.connections.has(dbName)) {
      return this.connections.get(dbName)!;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not found');

    // Create a new connection for this database
    const connection = mongoose.createConnection(uri, {
      dbName: dbName,
    });

    await new Promise((resolve, reject) => {
      connection.once('open', resolve);
      connection.once('error', reject);
    });

    this.connections.set(dbName, connection);
    return connection;
  }

  async getModel<T extends Document>(databaseId: string, name: string, schema: any): Promise<Model<T>> {
    const conn = await this.getConnection(databaseId);
    return conn.model<T>(name, schema);
  }

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

  async getSaleModel(databaseId: string) {
    return this.getModel<MilkSale & Document>(databaseId, 'Sale', SaleSchema);
  }

  async getCustomerModel(databaseId: string) {
    return this.getModel<Customer & Document>(databaseId, 'Customer', CustomerSchema);
  }

  async getUserModel(databaseId: string) {
    return this.getModel<User & Document>(databaseId, 'User', UserSchema);
  }

  async getDairyModel(databaseId: string) {
    return this.getModel<any & Document>(databaseId, 'Dairy', DairySchema);
  }

  async getSettingsModel(databaseId: string) {
    const { SettingsSchema } = require('./Models');
    return this.getModel<any & Document>(databaseId, 'Settings', SettingsSchema);
  }
}

export const dbManager = new DatabaseManager();
