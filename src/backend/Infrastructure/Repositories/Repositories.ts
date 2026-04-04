import { 
  IFarmerRepository, 
  ICollectionRepository, 
  IRateChartRepository, 
  ILedgerRepository, 
  ISaleRepository, 
  ICustomerRepository, 
  IUserRepository 
} from '../../Application/Interfaces/IRepositories';
import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry } from '../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../Core/Entities/Sale';

// Mock Database to simulate PostgreSQL
class MockDB {
  farmers: Farmer[] = [];
  collections: MilkCollection[] = [];
  rateCharts: RateChart[] = [];
  ledger: LedgerEntry[] = [];
  sales: MilkSale[] = [];
  customers: Customer[] = [];
  users: User[] = [];
}

const db = new MockDB();

export class FarmerRepository implements IFarmerRepository {
  async getById(id: string): Promise<Farmer | null> {
    return db.farmers.find(f => f.id === id) || null;
  }

  async getAll(): Promise<Farmer[]> {
    return db.farmers;
  }

  async create(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer> {
    const newFarmer: Farmer = {
      ...farmer,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
    };
    db.farmers.push(newFarmer);
    return newFarmer;
  }

  async update(id: string, farmer: Partial<Farmer>): Promise<Farmer> {
    const index = db.farmers.findIndex(f => f.id === id);
    if (index === -1) throw new Error('Farmer not found');
    db.farmers[index] = { ...db.farmers[index], ...farmer };
    return db.farmers[index];
  }

  async delete(id: string): Promise<void> {
    db.farmers = db.farmers.filter(f => f.id !== id);
  }

  async getSummary(farmerId: string): Promise<FarmerSummary> {
    const collections = db.collections.filter(c => c.farmerId === farmerId);
    const ledgerEntries = db.ledger.filter(l => l.farmerId === farmerId);

    const totalMilkSupplied = collections.reduce((sum, c) => sum + c.quantity, 0);
    const totalEarnings = collections.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalPaid = ledgerEntries
      .filter(l => l.type === 'debit')
      .reduce((sum, l) => sum + l.amount, 0);

    return {
      totalMilkSupplied,
      totalEarnings,
      totalPaid,
      pendingAmount: totalEarnings - totalPaid,
    };
  }
}

export class CollectionRepository implements ICollectionRepository {
  async getById(id: string): Promise<MilkCollection | null> {
    return db.collections.find(c => c.id === id) || null;
  }

  async getAll(): Promise<MilkCollection[]> {
    return db.collections;
  }

  async create(collection: Omit<MilkCollection, 'id' | 'createdAt'>): Promise<MilkCollection> {
    const newCollection: MilkCollection = {
      ...collection,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
    };
    db.collections.push(newCollection);
    return newCollection;
  }

  async getDailyReport(date: Date): Promise<MilkCollection[]> {
    const dateStr = date.toISOString().split('T')[0];
    return db.collections.filter(c => c.date.toISOString().split('T')[0] === dateStr);
  }
}

export class RateChartRepository implements IRateChartRepository {
  async getRate(fat: number, snf: number): Promise<number> {
    const match = db.rateCharts.find(r => 
      fat >= r.fatMin && fat <= r.fatMax && 
      snf >= r.snfMin && snf <= r.snfMax
    );
    return match ? match.ratePerLiter : 0;
  }

  async getAll(): Promise<RateChart[]> {
    return db.rateCharts;
  }

  async create(rate: Omit<RateChart, 'id'>): Promise<RateChart> {
    const newRate: RateChart = {
      ...rate,
      id: Math.random().toString(36).substr(2, 9),
    };
    db.rateCharts.push(newRate);
    return newRate;
  }
}

export class LedgerRepository implements ILedgerRepository {
  async addEntry(entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry> {
    const newEntry: LedgerEntry = {
      ...entry,
      id: Math.random().toString(36).substr(2, 9),
    };
    db.ledger.push(newEntry);
    return newEntry;
  }

  async getByFarmerId(farmerId: string): Promise<LedgerEntry[]> {
    return db.ledger.filter(l => l.farmerId === farmerId);
  }
}

export class UserRepository implements IUserRepository {
  async getByUsername(username: string): Promise<User | null> {
    return db.users.find(u => u.username === username) || null;
  }

  async create(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const newUser: User = {
      ...user,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
    };
    db.users.push(newUser);
    return newUser;
  }
}
