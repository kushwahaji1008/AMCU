export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  status: 'active' | 'inactive';
  createdAt: Date;
}

export interface MilkSale {
  id: string;
  customerId: string;
  date: Date;
  quantity: number;
  rate: number;
  amount: number;
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
