import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry, ShiftSummary } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User, CustomerPayment } from '../../Core/Entities/Sale';
import { Dairy } from '../../Core/Entities/Dairy';
import { LoginAudit, ActivityLog, IdempotencyRecord, SyncConflict, SmsLog } from '../../Core/Entities/Audit';

export interface AuditLogFilter {
  search?: string;
  userId?: string;
  action?: string;
  targetType?: string;
  status?: string;
  databaseId?: string;
  syncStatus?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ILoginAuditRepository {
  create(audit: Omit<LoginAudit, 'id'>): Promise<LoginAudit>;
  getAll(limit?: number): Promise<LoginAudit[]>;
  getFiltered?(filter: AuditLogFilter): Promise<PaginatedResult<LoginAudit>>;
  getByUserId(userId: string, limit?: number): Promise<LoginAudit[]>;
}

export interface IActivityLogRepository {
  create(log: Omit<ActivityLog, 'id'>): Promise<ActivityLog>;
  createManyIdempotent?(logs: Array<Omit<ActivityLog, 'id'>>): Promise<{ inserted: number; skipped: number }>;
  getAll(limit?: number): Promise<ActivityLog[]>;
  getById?(id: string): Promise<ActivityLog | null>;
  getFiltered?(filter: AuditLogFilter): Promise<PaginatedResult<ActivityLog>>;
  getByUserId(userId: string, limit?: number): Promise<ActivityLog[]>;
  getByAction(action: string, limit?: number): Promise<ActivityLog[]>;
}

export interface IIdempotencyRepository {
  getByKey(key: string): Promise<IdempotencyRecord | null>;
  acquire(key: string, method: string, path: string, requestHash: string, userId?: string): Promise<'acquired' | 'in_progress' | 'completed' | 'hash_mismatch'>;
  complete(key: string, responseStatus: number, responseBody: any): Promise<void>;
  release(key: string): Promise<void>;
}

export interface ISyncConflictRepository {
  create(conflict: Omit<SyncConflict, 'id' | 'createdAt'>): Promise<SyncConflict>;
  getById(id: string): Promise<SyncConflict | null>;
  getAll(status?: SyncConflict['status']): Promise<SyncConflict[]>;
  resolve(id: string, status: SyncConflict['status'], resolvedBy: string): Promise<SyncConflict>;
}

export interface ISmsLogRepository {
  upsertByIdempotencyKey(log: Partial<SmsLog> & { idempotencyKey: string }): Promise<SmsLog>;
  getAll(filter?: { status?: string; recipientType?: string; recipientId?: string; limit?: number }): Promise<SmsLog[]>;
  getByIdempotencyKey(key: string): Promise<SmsLog | null>;
}

export interface IFarmerRepository {
  getById(id: string): Promise<Farmer | null>;
  getByFarmerId(farmerId: string): Promise<Farmer | null>;
  getAll(): Promise<Farmer[]>;
  create(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer>;
  update(id: string, farmer: Partial<Farmer>, expectedVersion?: number): Promise<Farmer>;
  delete(id: string): Promise<void>;
  getSummary(farmerInternalId: string): Promise<FarmerSummary>;
  getCount(): Promise<number>;
  getTotalBalance(): Promise<number>;
  incrementBalance?(id: string, delta: number): Promise<Farmer>;
}

export interface ICollectionRepository {
  getById(id: string): Promise<MilkCollection | null>;
  getAll(): Promise<MilkCollection[]>;
  create(collection: Omit<MilkCollection, 'id' | 'createdAt'>): Promise<MilkCollection>;
  getDailyReport(date: Date | string, endDate?: Date | string): Promise<MilkCollection[]>;
  getRecent(limit: number): Promise<MilkCollection[]>;
  getTrend(days: number): Promise<MilkCollection[]>;
  update(id: string, collection: Partial<MilkCollection>, expectedVersion?: number): Promise<MilkCollection>;
  getByFarmerInternalId(farmerInternalId: string): Promise<MilkCollection[]>;
  findDuplicatePour?(farmerInternalId: string, date: Date | string, shift: 'Morning' | 'Evening'): Promise<MilkCollection | null>;
}

export interface IRateChartRepository {
  getRate(fat: number, snf: number, milkType?: string): Promise<number>;
  getAll(): Promise<RateChart[]>;
  getById?(id: string): Promise<RateChart | null>;
  create(rate: Omit<RateChart, 'id'>): Promise<RateChart>;
  update(id: string, rate: Partial<RateChart>, expectedVersion?: number): Promise<RateChart>;
  delete(id: string): Promise<void>;
}

export interface ILedgerRepository {
  addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry>;
  getByFarmerInternalId(farmerInternalId: string): Promise<LedgerEntry[]>;
  getAll(): Promise<LedgerEntry[]>;
  getByReferenceId(referenceId: string): Promise<LedgerEntry | null>;
  getByReferenceIds?(referenceIds: string[]): Promise<LedgerEntry[]>;
  addEntryIfNotExists?(entry: Omit<LedgerEntry, 'id'>): Promise<{ entry: LedgerEntry; created: boolean }>;
}

export interface IShiftSummaryRepository {
  create(summary: Omit<ShiftSummary, 'id'>): Promise<ShiftSummary>;
  getByDateAndShift(date: string, shift: 'Morning' | 'Evening'): Promise<ShiftSummary | null>;
  getRecent(limit: number): Promise<ShiftSummary[]>;
}

export interface ISaleRepository {
  create(sale: Omit<MilkSale, 'id' | 'createdAt'>): Promise<MilkSale>;
  getDailyReport(date: Date | string): Promise<MilkSale[]>;
  getAll(): Promise<MilkSale[]>;
  getRecent(limit: number): Promise<MilkSale[]>;
  getByCustomerId(customerId: string): Promise<MilkSale[]>;
  delete?(id: string): Promise<void>;
}

export interface ICustomerRepository {
  create(customer: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer>;
  getAll(): Promise<Customer[]>;
  getById(id: string): Promise<Customer | null>;
  update(id: string, customer: Partial<Customer>, expectedVersion?: number): Promise<Customer>;
  delete(id: string): Promise<void>;
  updateBalance(id: string, amount: number): Promise<void>;
  getTotalBalance(): Promise<number>;
  applySale?(id: string, impact: { balanceDelta: number; salesDelta: number; paidDelta: number }): Promise<Customer | null>;
  recordPaymentBalance?(id: string, amount: number): Promise<Customer | null>;
}

export interface ICustomerPaymentRepository {
  create(payment: Omit<CustomerPayment, 'id' | 'createdAt'>): Promise<CustomerPayment>;
  getRecent(limit: number): Promise<CustomerPayment[]>;
  getByCustomerId(customerId: string): Promise<CustomerPayment[]>;
  delete?(id: string): Promise<void>;
}

export interface IUserRepository {
  getById?(id: string): Promise<User | null>;
  getByUsername(username: string): Promise<User | null>;
  getByEmail?(email: string): Promise<User | null>;
  getByUsernameOrEmail?(identifier: string): Promise<User | null>;
  getAll(filter?: { role?: 'admin' | 'operator' | 'super_admin'; dairyId?: string; databaseId?: string }): Promise<User[]>;
  create(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  update(id: string, user: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
}

export interface ISettingsRepository {
  get(key: string): Promise<any>;
  save(key: string, value: any): Promise<void>;
}

export interface IDairyRepository {
  create(dairy: Omit<Dairy, 'id' | 'createdAt'>): Promise<Dairy>;
  getByOwnerId(ownerId: string): Promise<Dairy | null>;
  getById(id: string): Promise<Dairy | null>;
  getByDatabaseId?(databaseId: string): Promise<Dairy | null>;
  getAll(): Promise<Dairy[]>;
  update?(id: string, dairy: Partial<Dairy>): Promise<Dairy>;
}
