import mongoose, { Schema, Document } from 'mongoose';
import { Farmer } from '../../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry } from '../../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../../Core/Entities/Sale';

// --- Farmer Schema ---
export const FarmerSchema = new Schema({
  farmerId: { type: String, required: true },
  name: { type: String, required: true },
  mobile: { type: String, required: true },
  village: { type: String, required: true },
  cattleType: { type: String, enum: ['Cow', 'Buffalo', 'Mixed'], required: true },
  bankAccount: { type: String },
  ifsc: { type: String },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  balance: { type: Number, default: 0 },
  dairyId: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

// --- Collection Schema ---
export const CollectionSchema = new Schema({
  farmerId: { type: String, required: true },
  farmerName: { type: String, required: true },
  date: { type: Date, required: true },
  shift: { type: String, enum: ['Morning', 'Evening'], required: true },
  milkType: { type: String, enum: ['Cow', 'Buffalo', 'Mixed'], required: true },
  quantity: { type: Number, required: true },
  fat: { type: Number, required: true },
  snf: { type: Number, required: true },
  clr: { type: Number, default: 0 },
  rate: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  operatorId: { type: String, required: true },
  dairyId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// --- RateChart Schema ---
export const RateChartSchema = new Schema({
  fatMin: { type: Number, required: true },
  fatMax: { type: Number, required: true },
  snfMin: { type: Number, required: true },
  snfMax: { type: Number, required: true },
  ratePerLiter: { type: Number, required: true },
});

// --- Ledger Schema ---
export const LedgerSchema = new Schema({
  farmerId: { type: String, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  description: { type: String },
  referenceId: { type: String, required: true },
  date: { type: Date, required: true },
  balanceAfter: { type: Number },
  dairyId: { type: String, required: true },
});

// --- Sale Schema ---
export const SaleSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  date: { type: Date, required: true },
  shift: { type: String, enum: ['Morning', 'Evening'], required: true },
  quantity: { type: Number, required: true },
  rate: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// --- Customer Schema ---
export const CustomerSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// --- User Schema ---
export const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operator', 'super_admin'], required: true },
  dairyId: { type: String },
  databaseId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// --- Dairy Schema ---
export const DairySchema = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  contact: { type: String, required: true },
  ownerId: { type: String, required: true },
  databaseId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// --- Settings Schema ---
export const SettingsSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
});

// Default Models (for Registry/Default DB)
export const FarmerModel = mongoose.model<Farmer & Document>('Farmer', FarmerSchema);
export const CollectionModel = mongoose.model<MilkCollection & Document>('Collection', CollectionSchema);
export const RateChartModel = mongoose.model<RateChart & Document>('RateChart', RateChartSchema);
export const LedgerModel = mongoose.model<LedgerEntry & Document>('Ledger', LedgerSchema);
export const SaleModel = mongoose.model<MilkSale & Document>('Sale', SaleSchema);
export const CustomerModel = mongoose.model<Customer & Document>('Customer', CustomerSchema);
export const UserModel = mongoose.model<User & Document>('User', UserSchema);
export const DairyModel = mongoose.model<any & Document>('Dairy', DairySchema);
export const SettingsModel = mongoose.model<any & Document>('Settings', SettingsSchema);
