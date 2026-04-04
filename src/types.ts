export interface Farmer {
  id: string;
  farmerId: string;
  name: string;
  mobile: string;
  village: string;
  cattleType: 'Cow' | 'Buffalo' | 'Mixed';
  bankAccount?: string;
  ifsc?: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
}

export interface CollectionTransaction {
  id: string;
  timestamp: string | any; // Allow FieldValue for serverTimestamp
  shift: 'Morning' | 'Evening';
  farmerId: string;
  farmerName: string;
  milkType: 'Cow' | 'Buffalo' | 'Mixed';
  quantity: number;
  fat: number;
  snf: number;
  clr: number;
  rate: number;
  amount: number;
  operatorId: string;
  isManual?: boolean;
  manualReason?: string;
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
}

export interface ShiftSummary {
  id: string;
  date: string;
  shift: 'Morning' | 'Evening';
  totalFarmers: number;
  totalQuantity: number;
  avgFat: number;
  avgSnf: number;
  totalAmount: number;
  closedAt: string;
  closedBy: string;
}
