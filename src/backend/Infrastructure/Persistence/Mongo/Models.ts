import { Schema } from 'mongoose';

// --- Farmer Schema ---
export const FarmerSchema = new Schema({
  farmerId: { type: String, required: true },
  farmerCode: { type: String },
  name: { type: String, required: true },
  mobile: { type: String, required: true },
  village: { type: String, required: true },
  cattleType: { type: String, enum: ['Cow', 'Buffalo', 'Mixed'], required: true },
  bankAccount: { type: String },
  ifsc: { type: String },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  balance: { type: Number, default: 0 },
  dairyId: { type: String, required: true },
  version: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

FarmerSchema.index({ farmerId: 1 });
FarmerSchema.index({ mobile: 1 });
FarmerSchema.index({ status: 1 });

// --- Collection Schema ---
export const CollectionSchema = new Schema({
  farmerInternalId: { type: String, required: true },
  farmerId: { type: String, required: true },
  farmerCode: { type: String },
  farmerName: { type: String, required: true },
  date: { type: Date, required: true },
  shift: { type: String, enum: ['Morning', 'Evening'], required: true },
  milkType: { type: String, enum: ['Cow', 'Buffalo', 'Mixed'], required: true },
  quantity: { type: Number, required: true },
  fat: { type: Number, required: true },
  snf: { type: Number, required: true },
  clr: { type: Number, default: 0 },
  rate: { type: Number, required: true },
  amount: { type: Number, required: true },
  operatorId: { type: String, required: true },
  dairyId: { type: String, required: true },
  isManual: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: true },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  idempotencyKey: { type: String, sparse: true },
  version: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

CollectionSchema.index({ date: -1 });
CollectionSchema.index({ farmerInternalId: 1, date: -1 });
CollectionSchema.index({ farmerId: 1, date: -1 });
CollectionSchema.index({ farmerInternalId: 1, shift: 1, date: -1 });

// --- RateChart Schema ---
// Supports both point entries (milkType, fat, snf, rate, effectiveFrom)
// and range entries (fatMin, fatMax, snfMin, snfMax, ratePerLiter).
export const RateChartSchema = new Schema({
  milkType: { type: String, enum: ['Cow', 'Buffalo', 'Mixed'], default: 'Cow' },
  fat: { type: Number },
  snf: { type: Number },
  rate: { type: Number },
  effectiveFrom: { type: String },
  fatMin: { type: Number, required: true },
  fatMax: { type: Number, required: true },
  snfMin: { type: Number, required: true },
  snfMax: { type: Number, required: true },
  ratePerLiter: { type: Number, required: true },
  version: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
});

RateChartSchema.pre('validate', function (this: any) {
  if (this.fatMin === undefined && this.fat !== undefined) this.fatMin = this.fat;
  if (this.fatMax === undefined && this.fat !== undefined) this.fatMax = this.fat;
  if (this.snfMin === undefined && this.snf !== undefined) this.snfMin = this.snf;
  if (this.snfMax === undefined && this.snf !== undefined) this.snfMax = this.snf;
  if (this.ratePerLiter === undefined && this.rate !== undefined) this.ratePerLiter = this.rate;

  if (this.fat === undefined && this.fatMin !== undefined) this.fat = this.fatMin;
  if (this.snf === undefined && this.snfMin !== undefined) this.snf = this.snfMin;
  if (this.rate === undefined && this.ratePerLiter !== undefined) this.rate = this.ratePerLiter;
});

RateChartSchema.index({ milkType: 1, fatMin: 1, fatMax: 1, snfMin: 1, snfMax: 1 });

// --- Ledger Schema ---
export const LedgerSchema = new Schema({
  farmerInternalId: { type: String, required: true },
  farmerId: { type: String, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  description: { type: String },
  referenceId: { type: String, required: true },
  date: { type: Date, required: true },
  balanceAfter: { type: Number },
  dairyId: { type: String, required: true },
  method: { type: String },
  reference: { type: String },
  operatorId: { type: String },
  idempotencyKey: { type: String, sparse: true },
});

LedgerSchema.index({ farmerInternalId: 1, date: -1 });
LedgerSchema.index({ referenceId: 1 });
LedgerSchema.index({ date: -1 });

// --- Shift Summary Schema ---
export const ShiftSummarySchema = new Schema({
  date: { type: String, required: true },
  shift: { type: String, enum: ['Morning', 'Evening'], required: true },
  totalFarmers: { type: Number, required: true },
  totalQuantity: { type: Number, required: true },
  avgFat: { type: Number, required: true },
  avgSnf: { type: Number, required: true },
  amount: { type: Number, required: true },
  closedAt: { type: Date, required: true },
  closedBy: { type: String, required: true },
  dairyId: { type: String, required: true },
  idempotencyKey: { type: String, sparse: true },
});

ShiftSummarySchema.index({ date: 1, shift: 1 });
ShiftSummarySchema.index({ closedAt: -1 });

// --- Sale Schema ---
export const SaleSchema = new Schema({
  customerId: { type: String, required: true },
  customerName: { type: String, required: true },
  customerMobile: { type: String, required: true },
  date: { type: Date, required: true },
  milkType: { type: String, enum: ['Cow', 'Buffalo', 'Mixed'], required: true },
  quantity: { type: Number, required: true },
  rate: { type: Number, required: true },
  amount: { type: Number, required: true },
  paymentMode: { type: String, enum: ['Cash', 'Credit', 'UPI'], required: true },
  paymentStatus: { type: String, enum: ['Paid', 'Due'], required: true },
  notes: { type: String },
  operatorId: { type: String, required: true },
  dairyId: { type: String, required: true },
  messageStatus: { type: String, enum: ['Sent', 'Failed', 'Pending'], default: 'Pending' },
  idempotencyKey: { type: String, sparse: true },
  createdAt: { type: Date, default: Date.now },
});

SaleSchema.index({ date: -1 });
SaleSchema.index({ customerId: 1, date: -1 });

// --- Customer Schema ---
export const CustomerSchema = new Schema({
  name: { type: String, required: true },
  mobile: { type: String, required: true },
  village: { type: String },
  address: { type: String },
  type: { type: String, enum: ['Individual', 'Commercial'], default: 'Individual' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  balance: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  dairyId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  version: { type: Number, default: 1 },
  defaultSaleRate: { type: Number },
});

CustomerSchema.index({ mobile: 1 });
CustomerSchema.index({ status: 1 });

// --- Customer Payment Schema ---
export const CustomerPaymentSchema = new Schema({
  customerId: { type: String, required: true },
  customerName: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  paymentMode: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer'], required: true },
  notes: { type: String },
  operatorId: { type: String, required: true },
  dairyId: { type: String, required: true },
  idempotencyKey: { type: String, sparse: true },
  createdAt: { type: Date, default: Date.now },
});

CustomerPaymentSchema.index({ customerId: 1, date: -1 });
CustomerPaymentSchema.index({ date: -1 });

// --- User Schema ---
export const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operator', 'super_admin'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  isEmailVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpires: { type: Date },
  otpAttempts: { type: Number, default: 0 },
  currentSessionId: { type: String },
  dairyId: { type: String },
  databaseId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.index({ email: 1 });
UserSchema.index({ databaseId: 1, role: 1 });

// --- Dairy Schema ---
export const DairySchema = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  contact: { type: String, required: true },
  phone: { type: String },
  email: { type: String },
  ownerId: { type: String, required: true },
  databaseId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

DairySchema.index({ ownerId: 1 });
DairySchema.index({ databaseId: 1 });

// --- Settings Schema ---
export const SettingsSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
});

// --- LoginAudit Schema ---
export const LoginAuditSchema = new Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  role: { type: String, required: true },
  loginAt: { type: Date, default: Date.now },
  ipAddress: { type: String },
  userAgent: { type: String },
  device: {
    browser: { type: String },
    os: { type: String },
    deviceType: { type: String },
    model: { type: String },
  },
  location: {
    city: { type: String },
    region: { type: String },
    country: { type: String },
    ll: { type: [Number] },
  },
  status: { type: String, enum: ['success', 'failure'], required: true },
  failureReason: { type: String },
  databaseId: { type: String, required: true },
});

LoginAuditSchema.index({ loginAt: -1 });
LoginAuditSchema.index({ userId: 1, loginAt: -1 });

// --- ActivityLog Schema ---
export const ActivityLogSchema = new Schema({
  logId: { type: String, sparse: true, unique: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  userRole: { type: String },
  action: { type: String, required: true },
  targetId: { type: String },
  targetType: { type: String },
  beforeValue: { type: Schema.Types.Mixed },
  afterValue: { type: Schema.Types.Mixed },
  details: { type: Schema.Types.Mixed },
  operationStatus: { type: String, enum: ['success', 'failure', 'conflict', 'pending', 'queued'], default: 'success' },
  errorDetails: { type: String },
  ipAddress: { type: String },
  device: {
    platform: { type: String },
    deviceType: { type: String },
    model: { type: String },
    os: { type: String },
    browser: { type: String },
  },
  appVersion: { type: String },
  syncStatus: { type: String, enum: ['online', 'synced_from_offline', 'local_pending'], default: 'online' },
  correlationId: { type: String },
  source: { type: String, enum: ['server', 'android_offline', 'sync_engine', 'sms_engine'], default: 'server' },
  timestamp: { type: Date, default: Date.now },
  databaseId: { type: String, required: true },
});

ActivityLogSchema.index({ timestamp: -1 });
ActivityLogSchema.index({ userId: 1, timestamp: -1 });
ActivityLogSchema.index({ action: 1, timestamp: -1 });
ActivityLogSchema.index({ databaseId: 1, timestamp: -1 });
ActivityLogSchema.index({ operationStatus: 1, timestamp: -1 });
ActivityLogSchema.index({ correlationId: 1 });

// --- Idempotency Schema ---
export const IdempotencySchema = new Schema({
  key: { type: String, required: true, unique: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  requestHash: { type: String, required: true },
  status: { type: String, enum: ['in_progress', 'completed'], required: true },
  responseStatus: { type: Number },
  responseBody: { type: Schema.Types.Mixed },
  userId: { type: String },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});

// --- SyncConflict Schema ---
export const SyncConflictSchema = new Schema({
  entityType: {
    type: String,
    enum: ['farmer', 'collection', 'customer', 'rate', 'settings', 'sale', 'payment', 'shift'],
    required: true,
  },
  entityId: { type: String, required: true },
  operation: { type: String, enum: ['create', 'update', 'delete'], required: true },
  localPayload: { type: Schema.Types.Mixed, required: true },
  serverPayload: { type: Schema.Types.Mixed },
  localVersion: { type: Number },
  serverVersion: { type: Number },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['unresolved', 'resolved_server', 'resolved_local', 'resolved_merged'],
    default: 'unresolved',
  },
  resolvedBy: { type: String },
  resolvedAt: { type: Date },
  userId: { type: String },
  databaseId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

SyncConflictSchema.index({ status: 1, createdAt: -1 });
SyncConflictSchema.index({ entityType: 1, entityId: 1, status: 1 });

// --- SmsLog Schema ---
export const SmsLogSchema = new Schema({
  idempotencyKey: { type: String, required: true, unique: true },
  recipientType: { type: String, enum: ['farmer', 'customer', 'other'], required: true },
  recipientId: { type: String },
  recipientName: { type: String },
  phone: { type: String, required: true },
  message: { type: String, required: true },
  triggerType: { type: String, required: true },
  deliveryChannel: { type: String, enum: ['native_sim', 'server_simulated', 'server_gateway'], required: true },
  status: { type: String, enum: ['queued', 'submitted', 'sent', 'delivered', 'failed', 'simulated'], required: true },
  attempts: { type: Number, default: 1 },
  providerMessageId: { type: String },
  errorMessage: { type: String },
  simSlot: { type: Number },
  sentAt: { type: Date },
  deliveredAt: { type: Date },
  operatorId: { type: String },
  databaseId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SmsLogSchema.index({ status: 1, createdAt: -1 });
SmsLogSchema.index({ recipientId: 1, createdAt: -1 });
