export interface MilkCollection {
  id: string;
  farmerInternalId: string;
  farmerId: string;
  farmerCode?: string;
  farmerName: string;
  date: Date;
  shift: 'Morning' | 'Evening';
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
  approvedAt?: Date | string;
  idempotencyKey?: string;
  version?: number;
  updatedAt?: Date | string;
  createdAt: Date;
}

export interface RateChart {
  id: string;
  milkType?: 'Cow' | 'Buffalo' | 'Mixed';
  fat?: number;
  snf?: number;
  rate?: number;
  effectiveFrom?: string;
  fatMin?: number;
  fatMax?: number;
  snfMin?: number;
  snfMax?: number;
  ratePerLiter?: number;
  version?: number;
  updatedAt?: Date | string;
}

export interface LedgerEntry {
  id: string;
  farmerInternalId: string;
  farmerId: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  referenceId: string;
  date: Date;
  balanceAfter: number;
  dairyId: string;
  method?: string;
  reference?: string;
  operatorId?: string;
  idempotencyKey?: string;
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
  closedAt: Date;
  closedBy: string;
  dairyId: string;
  idempotencyKey?: string;
}
