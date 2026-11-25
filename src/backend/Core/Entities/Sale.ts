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
  defaultSaleRate?: number;
  version?: number;
  updatedAt?: Date | string;
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
  idempotencyKey?: string;
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
  idempotencyKey?: string;
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
  otpAttempts?: number;
  currentSessionId?: string;
  dairyId?: string;
  databaseId: string;
  createdAt: Date;
}

export type SafeUser = Omit<User, 'passwordHash' | 'otp' | 'otpExpires' | 'otpAttempts' | 'currentSessionId'> & {
  dairyName?: string;
  address?: string;
  phone?: string;
};
