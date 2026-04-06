import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../Core/Entities/Sale';

export interface IFarmerRepository {
  getById(id: string): Promise<Farmer | null>;
  getAll(): Promise<Farmer[]>;
  create(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer>;
  update(id: string, farmer: Partial<Farmer>): Promise<Farmer>;
  delete(id: string): Promise<void>;
  getSummary(farmerId: string): Promise<FarmerSummary>;
}

export interface ICollectionRepository {
  getById(id: string): Promise<MilkCollection | null>;
  getAll(): Promise<MilkCollection[]>;
  create(collection: Omit<MilkCollection, 'id' | 'createdAt'>): Promise<MilkCollection>;
  getDailyReport(date: Date): Promise<MilkCollection[]>;
}

export interface IRateChartRepository {
  getRate(fat: number, snf: number): Promise<number>;
  getAll(): Promise<RateChart[]>;
  create(rate: Omit<RateChart, 'id'>): Promise<RateChart>;
}

export interface ILedgerRepository {
  addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry>;
  getByFarmerId(farmerId: string): Promise<LedgerEntry[]>;
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
}

export interface IDairyRepository {
  create(dairy: any): Promise<any>;
  getByOwnerId(ownerId: string): Promise<any | null>;
  getById(id: string): Promise<any | null>;
}
