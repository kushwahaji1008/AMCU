/**
 * Audit, Synchronization Conflict, Idempotency & SMS Tracking Entities
 */

export interface LoginAudit {
  id: string;
  userId: string;
  username: string;
  role: string;
  loginAt: Date;
  ipAddress?: string;
  userAgent?: string;
  device?: {
    browser?: string;
    os?: string;
    deviceType?: string;
    model?: string;
  };
  location?: {
    city?: string;
    region?: string;
    country?: string;
    ll?: [number, number];
  };
  status: 'success' | 'failure';
  failureReason?: string;
  databaseId: string;
}

export interface ActivityLog {
  id: string;
  logId?: string;
  userId: string;
  username: string;
  userRole?: string;
  action: string;
  targetId?: string;
  targetType?: string;
  beforeValue?: any;
  afterValue?: any;
  details?: any;
  operationStatus?: 'success' | 'failure' | 'conflict' | 'pending' | 'queued';
  errorDetails?: string;
  ipAddress?: string;
  device?: {
    platform?: string;
    deviceType?: string;
    model?: string;
    os?: string;
    browser?: string;
  };
  appVersion?: string;
  syncStatus?: 'online' | 'synced_from_offline' | 'local_pending';
  correlationId?: string;
  source?: 'server' | 'android_offline' | 'sync_engine' | 'sms_engine';
  timestamp: Date;
  databaseId: string;
}

export interface IdempotencyRecord {
  id: string;
  key: string;
  method: string;
  path: string;
  requestHash: string;
  status: 'in_progress' | 'completed';
  responseStatus?: number;
  responseBody?: any;
  userId?: string;
  createdAt: Date;
}

export interface SyncConflict {
  id: string;
  entityType: 'farmer' | 'collection' | 'customer' | 'rate' | 'settings' | 'sale' | 'payment' | 'shift';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  localPayload: any;
  serverPayload?: any;
  localVersion?: number;
  serverVersion?: number;
  reason: string;
  status: 'unresolved' | 'resolved_server' | 'resolved_local' | 'resolved_merged';
  resolvedBy?: string;
  resolvedAt?: Date;
  userId?: string;
  databaseId: string;
  createdAt: Date;
}

export interface SmsLog {
  id: string;
  idempotencyKey: string;
  recipientType: 'farmer' | 'customer' | 'other';
  recipientId?: string;
  recipientName?: string;
  phone: string;
  message: string;
  triggerType: string;
  deliveryChannel: 'native_sim' | 'server_simulated' | 'server_gateway';
  status: 'queued' | 'submitted' | 'sent' | 'delivered' | 'failed' | 'simulated';
  attempts: number;
  providerMessageId?: string;
  errorMessage?: string;
  simSlot?: number;
  sentAt?: Date;
  deliveredAt?: Date;
  operatorId?: string;
  databaseId: string;
  createdAt: Date;
  updatedAt: Date;
}
