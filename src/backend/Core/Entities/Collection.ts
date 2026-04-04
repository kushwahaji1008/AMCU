export interface MilkCollection {
  id: string;
  farmerId: string;
  date: Date;
  shift: 'Morning' | 'Evening';
  quantity: number; // liters
  fat: number;
  snf: number;
  rate: number; // auto calculated
  totalAmount: number;
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
  type: 'credit' | 'debit'; // credit = milk collection, debit = payment done
  amount: number;
  referenceId: string; // collectionId or paymentId
  date: Date;
}
