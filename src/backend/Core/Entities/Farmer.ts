export interface Farmer {
  id: string;
  name: string;
  phone: string;
  village: string;
  address: string;
  aadhaar?: string;
  bankAccount: string;
  ifsc: string;
  status: 'active' | 'inactive';
  createdAt: Date;
}

export interface FarmerSummary {
  totalMilkSupplied: number;
  totalEarnings: number;
  totalPaid: number;
  pendingAmount: number;
}
