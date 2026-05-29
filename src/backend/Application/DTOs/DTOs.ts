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
  date: string;
  shift: 'Morning' | 'Evening';
  quantity: number;
  rate: number;
}

// --- Customer DTOs ---
export interface CreateCustomerDTO {
  name: string;
  phone: string;
  address: string;
}

// --- Payment DTOs ---
export interface RecordPaymentDTO {
  farmerId: string;
  amount: number;
  referenceId: string;
  date: string;
}
