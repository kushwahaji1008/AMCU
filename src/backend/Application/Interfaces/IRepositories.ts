import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry, ShiftSummary } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../Core/Entities/Sale';
import { LoginAudit } from '../../Core/Entities/Audit';

export interface ILoginAuditRepository {
  create(audit: Omit<LoginAudit, 'id'>): Promise<LoginAudit>;
  getAll(): Promise<LoginAudit[]>;
  getByUserId(userId: string): Promise<LoginAudit[]>;
}

export interface IFarmerRepository {
  getById(id: string): Promise<Farmer | null>;
  getByFarmerId(farmerId: string): Promise<Farmer | null>;
  getAll(): Promise<Farmer[]>;
  create(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer>;
  update(id: string, farmer: Partial<Farmer>): Promise<Farmer>;
  delete(id: string): Promise<void>;
  getSummary(farmerInternalId: string): Promise<FarmerSummary>;
  getCount(): Promise<number>;
}

export interface ICollectionRepository {
  getById(id: string): Promise<MilkCollection | null>;
  getAll(): Promise<MilkCollection[]>;
  create(collection: Omit<MilkCollection, 'id' | 'createdAt'>): Promise<MilkCollection>;
  getDailyReport(date: Date, endDate?: Date): Promise<MilkCollection[]>;
  getRecent(limit: number): Promise<MilkCollection[]>;
  getTrend(days: number): Promise<MilkCollection[]>;
  update(id: string, collection: Partial<MilkCollection>): Promise<MilkCollection>;
  getByFarmerInternalId(farmerInternalId: string): Promise<MilkCollection[]>;
}

export interface IRateChartRepository {
  getRate(fat: number, snf: number): Promise<number>;
  getAll(): Promise<RateChart[]>;
  create(rate: Omit<RateChart, 'id'>): Promise<RateChart>;
  update(id: string, rate: Partial<RateChart>): Promise<RateChart>;
  delete(id: string): Promise<void>;
}

export interface ILedgerRepository {
  addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry>;
  getByFarmerInternalId(farmerInternalId: string): Promise<LedgerEntry[]>;
  getAll(): Promise<LedgerEntry[]>;
}

export interface IShiftSummaryRepository {
  create(summary: Omit<ShiftSummary, 'id'>): Promise<ShiftSummary>;
  getByDateAndShift(date: string, shift: string): Promise<ShiftSummary | null>;
  getRecent(limit: number): Promise<ShiftSummary[]>;
}

export interface ISaleRepository {
  create(sale: Omit<MilkSale, 'id' | 'createdAt'>): Promise<MilkSale>;
  getDailyReport(date: Date): Promise<MilkSale[]>;
}

export interface ICustomerRepository {
  create(customer: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer>;
  getAll(): Promise<Customer[]>;
}

export interface IUserRepository {
  getByUsername(username: string): Promise<User | null>;
  getAll(role?: string): Promise<User[]>;
  create(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  update(id: string, user: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
}

export interface ISettingsRepository {
  get(key: string): Promise<any>;
  save(key: string, value: any): Promise<void>;
}

export interface IDairyRepository {
  create(dairy: any): Promise<any>;
  getByOwnerId(ownerId: string): Promise<any | null>;
  getById(id: string): Promise<any | null>;
  getAll(): Promise<any[]>;
}
