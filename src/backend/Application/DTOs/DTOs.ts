// --- Farmer DTOs ---
export interface CreateFarmerDTO {
  name: string;
  phone: string;
  village: string;
  address: string;
  aadhaar?: string;
  bankAccount: string;
  ifsc: string;
}

// --- Collection DTOs ---
export interface CreateCollectionDTO {
  farmerId: string;
  date: string;
  shift: 'Morning' | 'Evening';
  quantity: number;
  fat: number;
  snf: number;
}

// --- Sale DTOs ---
export interface CreateSaleDTO {
  customerId: string;
  customerName: string;
  customerMobile: string;
  date: string;
  milkType: 'Cow' | 'Buffalo' | 'Mixed';
  quantity: number;
  rate: number;
  paymentMode: 'Cash' | 'Credit' | 'UPI';
  notes?: string;
  operatorId: string;
  dairyId: string;
}

// --- Customer DTOs ---
export interface CreateCustomerDTO {
  name: string;
  mobile: string;
  village?: string;
  address?: string;
  type: 'Individual' | 'Commercial';
  dairyId: string;
}

// --- Payment DTOs ---
export interface RecordPaymentDTO {
  farmerId: string;
  amount: number;
  referenceId: string;
  date: string;
}
