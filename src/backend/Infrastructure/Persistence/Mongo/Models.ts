import mongoose, { Schema, Document } from 'mongoose';
import { Farmer } from '../../../Core/Entities/Farmer';
import { MilkCollection, RateChart, LedgerEntry } from '../../../Core/Entities/Collection';
import { MilkSale, Customer, User } from '../../../Core/Entities/Sale';

// --- Farmer Model ---
const FarmerSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  bankDetails: {
    accountNumber: { type: String, required: true },
    ifsc: { type: String, required: true },
    bankName: { type: String, required: true },
  },
  createdAt: { type: Date, default: Date.now },
});

export const FarmerModel = mongoose.model<Farmer & Document>('Farmer', FarmerSchema);

// --- Collection Model ---
const CollectionSchema = new Schema({
  farmerId: { type: Schema.Types.ObjectId, ref: 'Farmer', required: true },
  date: { type: Date, required: true },
  shift: { type: String, enum: ['Morning', 'Evening'], required: true },
  quantity: { type: Number, required: true },
  fat: { type: Number, required: true },
  snf: { type: Number, required: true },
  rate: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const CollectionModel = mongoose.model<MilkCollection & Document>('Collection', CollectionSchema);

// --- RateChart Model ---
const RateChartSchema = new Schema({
  fatMin: { type: Number, required: true },
  fatMax: { type: Number, required: true },
  snfMin: { type: Number, required: true },
  snfMax: { type: Number, required: true },
  ratePerLiter: { type: Number, required: true },
});

export const RateChartModel = mongoose.model<RateChart & Document>('RateChart', RateChartSchema);

// --- Ledger Model ---
const LedgerSchema = new Schema({
  farmerId: { type: Schema.Types.ObjectId, ref: 'Farmer', required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  referenceId: { type: String, required: true },
  date: { type: Date, required: true },
});

export const LedgerModel = mongoose.model<LedgerEntry & Document>('Ledger', LedgerSchema);

// --- Sale Model ---
const SaleSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  date: { type: Date, required: true },
  shift: { type: String, enum: ['Morning', 'Evening'], required: true },
  quantity: { type: Number, required: true },
  rate: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const SaleModel = mongoose.model<MilkSale & Document>('Sale', SaleSchema);

// --- Customer Model ---
const CustomerSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const CustomerModel = mongoose.model<Customer & Document>('Customer', CustomerSchema);

// --- User Model ---
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operator'], required: true },
  createdAt: { type: Date, default: Date.now },
});

export const UserModel = mongoose.model<User & Document>('User', UserSchema);
