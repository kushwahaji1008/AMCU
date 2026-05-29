import Dexie, { type Table } from 'dexie';

/**
 * Realm Database Emulator & Engine for Web and Mobile platforms.
 * Adheres to standard Realm schemas, transactions, and object query patterns,
 * using IndexedDB (via Dexie) as the high-capacity, robust offline storage backend.
 */

export interface RealmSchema {
  name: string;
  primaryKey?: string;
  properties: Record<string, string | object>;
}

export class Realm {
  private dexieDb: Dexie;
  public path: string;
  public schema: RealmSchema[];

  constructor(config: { path: string; schema: RealmSchema[] }) {
    this.path = config.path;
    this.schema = config.schema;

    // Create a unique DB name for this path
    this.dexieDb = new Dexie(`Realm_${config.path}`);

    // Map Realm schemas to Dexie store definitions
    const stores: Record<string, string> = {};
    config.schema.forEach((s) => {
      const primaryKey = s.primaryKey || 'id';
      
      // Dexie index specification: "primaryKey, index1, index2"
      // We index standard searchable fields for performance
      let storeDef = primaryKey;
      if (s.name === 'farmers') {
        storeDef += ', farmerId';
      } else if (s.name === 'collections') {
        storeDef += ', date, shift, farmerInternalId, farmerId';
      } else if (s.name === 'shifts') {
        storeDef += ', date';
      } else if (s.name === 'sales_customers') {
        storeDef += ', id';
      } else if (s.name === 'sales_records') {
        storeDef += ', date, customerId';
      } else if (s.name === 'rates') {
        storeDef += ', id';
      } else if (s.name === 'ledgers') {
        storeDef += ', farmerInternalId, date';
      } else if (s.name === 'payments') {
        storeDef += ', farmerInternalId, date';
      } else if (s.name === 'users') {
        storeDef += ', username';
      }
      
      stores[s.name] = storeDef;
    });

    this.dexieDb.version(1).stores(stores);
  }

  // Get indexable DEXIE table
  private getTable(name: string): Table<any, any> {
    const table = this.dexieDb.table(name);
    if (!table) {
      throw new Error(`Realm Table for schema "${name}" is not registered.`);
    }
    return table;
  }

  /**
   * Realm objects() method
   */
  async objects<T = any>(name: string): Promise<T[]> {
    const table = this.getTable(name);
    return (await table.toArray()) as T[];
  }

  /**
   * Realm objectForPrimaryKey() method
   */
  async objectForPrimaryKey<T = any>(name: string, key: any): Promise<T | null> {
    const table = this.getTable(name);
    const item = await table.get(key);
    return item || null;
  }

  /**
   * Realm create() method
   */
  async create<T = any>(
    name: string,
    properties: any,
    updateMode: 'never' | 'all' | 'modified' = 'all'
  ): Promise<T> {
    const table = this.getTable(name);
    const schemaDef = this.schema.find((s) => s.name === name);
    const primaryKey = schemaDef?.primaryKey || 'id';
    const keyVal = properties[primaryKey];

    if (!keyVal) {
      throw new Error(`Primary key "${primaryKey}" must be specified for schema "${name}".`);
    }

    if (updateMode === 'all' || updateMode === 'modified') {
      await table.put(properties);
    } else {
      await table.add(properties);
    }
    return properties as T;
  }

  /**
   * Realm delete() method
   */
  async delete(name: string, objectOrKey: any): Promise<void> {
    const table = this.getTable(name);
    const schemaDef = this.schema.find((s) => s.name === name);
    const primaryKey = schemaDef?.primaryKey || 'id';

    if (typeof objectOrKey === 'object' && objectOrKey !== null) {
      const keyVal = objectOrKey[primaryKey];
      if (keyVal) {
        await table.delete(keyVal);
      }
    } else {
      await table.delete(objectOrKey);
    }
  }

  /**
   * Realm transaction write wrapper
   */
  async write<T = any>(callback: () => Promise<T> | T): Promise<T> {
    return await this.dexieDb.transaction('rw', this.dexieDb.tables, async () => {
      return await callback();
    });
  }

  /**
   * Query matching Realm's simple query system
   */
  async find<T = any>(name: string, predicate: (item: T) => boolean): Promise<T[]> {
    const all = await this.objects<T>(name);
    return all.filter(predicate);
  }
}

// Realm schema specifications for MilkFlow AMCU entities
export const schemas: RealmSchema[] = [
  {
    name: 'farmers',
    primaryKey: 'id',
    properties: {
      id: 'string',
      farmerId: 'string',
      farmerCode: 'string?',
      name: 'string',
      mobile: 'string',
      village: 'string',
      cattleType: 'string',
      bankAccount: 'string?',
      ifsc: 'string?',
      status: 'string',
      createdAt: 'string',
      balance: 'double',
      dairyId: 'string'
    }
  },
  {
    name: 'collections',
    primaryKey: 'id',
    properties: {
      id: 'string',
      timestamp: 'string',
      date: 'string',
      shift: 'string',
      farmerInternalId: 'string',
      farmerId: 'string',
      farmerCode: 'string?',
      farmerName: 'string',
      milkType: 'string',
      quantity: 'double',
      fat: 'double',
      snf: 'double',
      clr: 'double',
      rate: 'double',
      amount: 'double',
      operatorId: 'string',
      dairyId: 'string',
      isManual: 'bool?',
      isApproved: 'bool?',
      approvedBy: 'string?',
      approvedAt: 'string?'
    }
  },
  {
    name: 'shifts',
    primaryKey: 'id',
    properties: {
      id: 'string',
      date: 'string',
      shift: 'string',
      totalFarmers: 'int',
      totalQuantity: 'double',
      avgFat: 'double',
      avgSnf: 'double',
      amount: 'double',
      closedAt: 'string',
      closedBy: 'string',
      dairyId: 'string'
    }
  },
  {
    name: 'sales_customers',
    primaryKey: 'id',
    properties: {
      id: 'string',
      name: 'string',
      phone: 'string',
      email: 'string?',
      status: 'string',
      createdAt: 'string'
    }
  },
  {
    name: 'sales_records',
    primaryKey: 'id',
    properties: {
      id: 'string',
      customerId: 'string',
      customerName: 'string',
      quantity: 'double',
      milkType: 'string',
      rate: 'double',
      amount: 'double',
      date: 'string',
      shift: 'string',
      operatorId: 'string'
    }
  },
  {
    name: 'rates',
    primaryKey: 'id',
    properties: {
      id: 'string',
      effectiveFrom: 'string',
      milkType: 'string',
      baseRate: 'double',
      fatStandard: 'double',
      snfStandard: 'double',
      fatStep: 'double',
      snfStep: 'double',
      dairyId: 'string',
      fat: 'double?',
      snf: 'double?',
      rate: 'double?',
      fatMin: 'double?',
      fatMax: 'double?',
      snfMin: 'double?',
      snfMax: 'double?'
    }
  },
  {
    name: 'rate_settings',
    primaryKey: 'id',
    properties: {
      id: 'string',
      fatMultiplier1: 'double',
      snfMultiplier1: 'double',
      fatMultiplier2: 'double',
      snfDeductions: 'object',
      minFatForFormula1: 'double',
      maxFatForFormula1: 'double',
      dairyId: 'string?'
    }
  },
  {
    name: 'payments',
    primaryKey: 'id',
    properties: {
      id: 'string',
      farmerInternalId: 'string',
      farmerId: 'string',
      farmerName: 'string',
      amount: 'double',
      method: 'string',
      reference: 'string?',
      date: 'string',
      timestamp: 'string',
      operatorId: 'string',
      status: 'string',
      dairyId: 'string'
    }
  },
  {
    name: 'ledgers',
    primaryKey: 'id',
    properties: {
      id: 'string',
      farmerInternalId: 'string',
      farmerId: 'string',
      type: 'string',
      amount: 'double',
      description: 'string',
      referenceId: 'string',
      date: 'string',
      balanceAfter: 'double',
      dairyId: 'string',
      method: 'string?',
      reference: 'string?',
      operatorId: 'string?'
    }
  },
  {
    name: 'users',
    primaryKey: 'id',
    properties: {
      id: 'string',
      username: 'string',
      email: 'string',
      role: 'string',
      status: 'string',
      dairyId: 'string',
      databaseId: 'string?',
      createdAt: 'string'
    }
  },
  {
    name: 'dairies',
    primaryKey: 'id',
    properties: {
      id: 'string',
      name: 'string',
      location: 'string',
      contact: 'string',
      scaleModel: 'string?',
      pricingFormula: 'string?',
      status: 'string',
      createdAt: 'string'
    }
  },
  {
    name: 'sync_queue',
    primaryKey: 'id',
    properties: {
      id: 'string',
      type: 'string',
      payload: 'object',
      timestamp: 'int'
    }
  }
];

// Initialize global Realm database instance for the app
export const realmInstance = new Realm({
  path: 'milkflow_amcu_db',
  schema: schemas
});
