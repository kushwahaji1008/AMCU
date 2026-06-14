declare global {
  const APP_VERSION: string;
}

export interface Farmer {
  id: string;
  farmerId: string;
  farmerCode?: string;
  name: string;
  mobile: string;
  village: string;
  cattleType: 'Cow' | 'Buffalo' | 'Mixed';
  bankAccount?: string;
  ifsc?: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
  balance: number; // Current pending balance
  dairyId: string; // The dairy this farmer belongs to
}

export interface CollectionTransaction {
  id: string;
  timestamp: string | any;
  date: string | Date;
  shift: 'Morning' | 'Evening';
  farmerInternalId: string; // Internal ID
  farmerId: string; // User-assigned ID
  farmerCode?: string; // Fallback
  farmerName: string;
  milkType: 'Cow' | 'Buffalo' | 'Mixed';
  quantity: number;
  fat: number;
  snf: number;
  clr: number;
  rate: number;
  amount: number;
  operatorId: string;
  dairyId: string;
  isManual?: boolean;
  isApproved?: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface RateChart {
  id: string;
  effectiveFrom: string;
  milkType: 'Cow' | 'Buffalo' | 'Mixed';
  baseRate: number;
  fatStandard: number;
  snfStandard: number;
  fatStep: number;
  snfStep: number;
  dairyId: string; // The dairy this rate chart belongs to
  // These are for the table-based chart
  fat?: number;
  snf?: number;
  rate?: number;
  fatMin?: number;
  fatMax?: number;
  snfMin?: number;
  snfMax?: number;
}

export interface RateSettings {
  id?: string;
  fatMultiplier1: number;
  snfMultiplier1: number;
  fatMultiplier2: number;
  snfDeductions: { [key: string]: number };
  minFatForFormula1: number;
  maxFatForFormula1: number;
  dairyId?: string; // The dairy these settings belong to
}

export interface ShiftSummary {
  id: string;
  date: string;
  shift: 'Morning' | 'Evening';
  totalFarmers: number;
  totalQuantity: number;
  avgFat: number;
  avgSnf: number;
  amount: number;
  closedAt: string;
  closedBy: string;
  dairyId: string; // The dairy this shift belongs to
}

export interface Payment {
  id: string;
  farmerInternalId: string;
  farmerId: string;
  farmerName: string;
  amount: number;
  method: 'Cash' | 'UPI' | 'Check';
  reference?: string; // UPI ID, Check No, etc.
  date: string;
  timestamp: any;
  operatorId: string;
  status: 'Completed' | 'Pending';
  dairyId: string; // The dairy this payment belongs to
}

export interface LedgerEntry {
  id: string;
  farmerInternalId: string;
  farmerId: string;
  type: 'credit' | 'debit'; // Credit: Milk Collection (Increase Balance), Debit: Payment (Decrease Balance)
  amount: number;
  description: string;
  referenceId: string; // ID of the collection or payment record
  date: string | Date;
  balanceAfter: number;
  dairyId: string; // The dairy this ledger entry belongs to
  method?: string;
  reference?: string;
  operatorId?: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  village?: string;
  address?: string;
  type: 'Individual' | 'Commercial';
  status: 'Active' | 'Inactive';
  createdAt: string;
  balance: number; // Total Due (Owed to Dairy)
  totalPaid: number;
  totalSales: number;
  dairyId: string;
  defaultSaleRate?: number;
}

export interface MilkSale {
  id: string;
  timestamp: string | any;
  date: string | Date;
  customerId: string;
  customerName: string;
  customerMobile: string;
  milkType: 'Cow' | 'Buffalo' | 'Mixed';
  quantity: number;
  rate: number;
  amount: number;
  paymentMode: 'Cash' | 'Credit' | 'UPI';
  paymentStatus: 'Paid' | 'Due';
  notes?: string;
  operatorId: string;
  dairyId: string;
  messageStatus?: 'Sent' | 'Failed' | 'Pending';
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  date: string;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
  notes?: string;
  operatorId: string;
  dairyId: string;
  createdAt: string;
}
