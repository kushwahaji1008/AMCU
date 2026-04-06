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
  balance: number;
  dairyId: string;
}

export interface FarmerSummary {
  totalMilkSupplied: number;
  totalEarnings: number;
  totalPaid: number;
  pendingAmount: number;
}
