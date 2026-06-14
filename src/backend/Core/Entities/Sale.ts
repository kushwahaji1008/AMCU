export interface Customer {
  id: string;
  name: string;
  mobile: string;
  village?: string;
  address?: string;
  type: 'Individual' | 'Commercial';
  status: 'Active' | 'Inactive';
  balance: number;
  totalPaid: number;
  totalSales: number;
  dairyId: string;
  createdAt: Date;
}

export interface MilkSale {
  id: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  date: Date;
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
  createdAt: Date;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  date: Date;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
  notes?: string;
  operatorId: string;
  dairyId: string;
  createdAt: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'operator' | 'super_admin';
  status: 'active' | 'inactive';
  isEmailVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  currentSessionId?: string;
  dairyId?: string;
  databaseId: string;
  createdAt: Date;
}
