export interface MilkCollection {
  id: string;
  farmerId: string;
  farmerName: string;
  date: Date;
  shift: 'Morning' | 'Evening';
  milkType: 'Cow' | 'Buffalo' | 'Mixed';
  quantity: number;
  fat: number;
  snf: number;
  clr: number;
  rate: number;
  totalAmount: number;
  operatorId: string;
  dairyId: string;
  createdAt: Date;
}

export interface RateChart {
  id: string;
  fatMin: number;
  fatMax: number;
  snfMin: number;
  snfMax: number;
  ratePerLiter: number;
}

export interface LedgerEntry {
  id: string;
  farmerId: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  referenceId: string;
  date: Date;
  balanceAfter: number;
  dairyId: string;
}
