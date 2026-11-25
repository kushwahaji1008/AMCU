import crypto from 'crypto';
import { IActivityLogRepository, AuditLogFilter, PaginatedResult } from '../Interfaces/IRepositories';
import { ActivityLog } from '../../Core/Entities/Audit';
import { getDatabaseId, getRequestUser } from '../../Core/RequestContext';

const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'otp',
  'secret',
  'bankaccount',
  'authorization',
  'currentsessionid',
  'refresh_token',
]);

export function sanitizeAuditData(value: unknown, depth: number = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditData(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeAuditData(val, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export interface LogActivityInput {
  userId?: string;
  username?: string;
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
  device?: ActivityLog['device'];
  appVersion?: string;
  syncStatus?: 'online' | 'synced_from_offline' | 'local_pending';
  correlationId?: string;
  source?: 'server' | 'android_offline' | 'sync_engine' | 'sms_engine';
  databaseId?: string;
  logId?: string;
  timestamp?: Date | string;
}

export class ActivityLogService {
  constructor(private activityRepo: IActivityLogRepository) {}

  async log(params: LogActivityInput): Promise<ActivityLog> {
    const reqUser = getRequestUser();
    const resolvedTimestamp = params.timestamp ? new Date(params.timestamp) : new Date();

    return this.activityRepo.create({
      logId: params.logId || crypto.randomUUID(),
      userId: params.userId || reqUser?.userId || 'system',
      username: params.username || reqUser?.username || 'system',
      userRole: params.userRole || reqUser?.role,
      action: params.action,
      targetId: params.targetId,
      targetType: params.targetType,
      beforeValue: params.beforeValue !== undefined ? sanitizeAuditData(params.beforeValue) : undefined,
      afterValue: params.afterValue !== undefined ? sanitizeAuditData(params.afterValue) : undefined,
      details: params.details !== undefined ? sanitizeAuditData(params.details) : undefined,
      operationStatus: params.operationStatus || 'success',
      errorDetails: params.errorDetails,
      ipAddress: params.ipAddress,
      device: params.device,
      appVersion: params.appVersion,
      syncStatus: params.syncStatus || 'online',
      correlationId: params.correlationId || crypto.randomUUID(),
      source: params.source || 'server',
      timestamp: Number.isNaN(resolvedTimestamp.getTime()) ? new Date() : resolvedTimestamp,
      databaseId: params.databaseId || getDatabaseId(),
    });
  }

  async ingestOfflineLogs(
    logs: LogActivityInput[],
    actor: { userId: string; username: string; role: string; databaseId: string; ipAddress?: string; appVersion?: string; device?: ActivityLog['device'] }
  ): Promise<{ inserted: number; skipped: number }> {
    const sanitizedLogs: Array<Omit<ActivityLog, 'id'>> = logs.map((entry) => {
      const ts = entry.timestamp ? new Date(entry.timestamp) : new Date();
      return {
        logId: entry.logId || crypto.randomUUID(),
        // Always bind user identity to the authenticated caller so offline logs cannot spoof another user
        userId: actor.userId,
        username: actor.username,
        userRole: actor.role,
        action: String(entry.action || 'OFFLINE_OPERATION').slice(0, 120),
        targetId: entry.targetId ? String(entry.targetId).slice(0, 120) : undefined,
        targetType: entry.targetType ? String(entry.targetType).slice(0, 120) : undefined,
        beforeValue: entry.beforeValue !== undefined ? sanitizeAuditData(entry.beforeValue) : undefined,
        afterValue: entry.afterValue !== undefined ? sanitizeAuditData(entry.afterValue) : undefined,
        details: entry.details !== undefined ? sanitizeAuditData(entry.details) : undefined,
        operationStatus: entry.operationStatus || 'success',
        errorDetails: entry.errorDetails ? String(entry.errorDetails).slice(0, 1000) : undefined,
        ipAddress: actor.ipAddress,
        device: entry.device || actor.device,
        appVersion: entry.appVersion || actor.appVersion,
        syncStatus: 'synced_from_offline',
        correlationId: entry.correlationId || crypto.randomUUID(),
        source: entry.source || 'android_offline',
        timestamp: Number.isNaN(ts.getTime()) ? new Date() : ts,
        databaseId: actor.databaseId,
      };
    });

    if (this.activityRepo.createManyIdempotent) {
      return this.activityRepo.createManyIdempotent(sanitizedLogs);
    }

    let inserted = 0;
    for (const item of sanitizedLogs) {
      await this.activityRepo.create(item);
      inserted++;
    }
    return { inserted, skipped: 0 };
  }

  async getAllLogs(limit?: number): Promise<ActivityLog[]> {
    return this.activityRepo.getAll(limit);
  }

  async getFilteredLogs(filter: AuditLogFilter): Promise<PaginatedResult<ActivityLog>> {
    if (this.activityRepo.getFiltered) {
      return this.activityRepo.getFiltered(filter);
    }
    const items = await this.activityRepo.getAll(filter.limit || 200);
    return {
      items,
      total: items.length,
      page: 1,
      limit: items.length || 50,
      totalPages: 1,
    };
  }

  async getById(id: string): Promise<ActivityLog | null> {
    if (this.activityRepo.getById) {
      return this.activityRepo.getById(id);
    }
    return null;
  }

  async getUserLogs(userId: string): Promise<ActivityLog[]> {
    return this.activityRepo.getByUserId(userId);
  }
}
