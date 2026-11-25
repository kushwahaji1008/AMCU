import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authorize } from '../Middleware/AuthMiddleware';
import {
  AuditLogFilter,
  ILoginAuditRepository,
  ISmsLogRepository,
} from '../../Application/Interfaces/IRepositories';
import { ActivityLogService } from '../../Application/Services/ActivityLogService';
import { SyncConflictService } from '../../Application/Services/SyncConflictService';
import { NotFoundError, ValidationError } from '../../Core/Errors';

function parseAuditFilter(query: Record<string, any>): AuditLogFilter {
  const rawPage = query.page ? parseInt(String(query.page), 10) : 1;
  const rawLimit = query.limit ? parseInt(String(query.limit), 10) : 50;
  const startDate = query.startDate ? new Date(String(query.startDate)) : undefined;
  const endDate = query.endDate ? new Date(String(query.endDate)) : undefined;

  if (startDate && Number.isNaN(startDate.getTime())) {
    throw new ValidationError('Invalid startDate parameter', 'INVALID_DATE');
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    throw new ValidationError('Invalid endDate parameter', 'INVALID_DATE');
  }
  if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(query.endDate))) {
    endDate.setUTCHours(23, 59, 59, 999);
  }

  return {
    search: query.search ? String(query.search) : undefined,
    userId: query.userId ? String(query.userId) : undefined,
    action: query.action ? String(query.action) : undefined,
    targetType: query.targetType ? String(query.targetType) : undefined,
    status: query.status ? String(query.status) : undefined,
    databaseId: query.databaseId ? String(query.databaseId) : undefined,
    syncStatus: query.syncStatus ? String(query.syncStatus) : undefined,
    startDate,
    endDate,
    page: Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1,
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 500) : 50,
  };
}

export function registerSyncAndAuditRoutes(
  router: Router,
  authMw: any,
  deps: {
    auditRepo: ILoginAuditRepository;
    activityLogService: ActivityLogService;
    syncConflictService: SyncConflictService;
    smsLogRepo: ISmsLogRepository;
  }
) {
  const { auditRepo, activityLogService, syncConflictService, smsLogRepo } = deps;

  // --- Super Admin Audit & Security Log Routes (Strict Backend RBAC) ---

  router.get('/api/admin/login-logs', authMw, authorize(['super_admin']), async (req: AuthRequest, res, next) => {
    try {
      const filter = parseAuditFilter(req.query as Record<string, any>);
      const isPaginated = req.query.paginated === 'true';

      await activityLogService
        .log({
          userId: req.user!.id,
          username: req.user!.username,
          userRole: req.user!.role,
          action: 'AUDIT_LOG_ACCESSED',
          targetType: 'LOGIN_AUDIT',
          details: { paginated: isPaginated, filter: { ...req.query } },
          operationStatus: 'success',
          ipAddress: req.ip,
          databaseId: req.user!.databaseId,
        })
        .catch(() => {});

      if (isPaginated && auditRepo.getFiltered) {
        const result = await auditRepo.getFiltered(filter);
        return res.json(result);
      }

      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 200;
      const logs = await auditRepo.getAll(limit);
      res.json(logs);
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/admin/activity-logs', authMw, authorize(['super_admin']), async (req: AuthRequest, res, next) => {
    try {
      const filter = parseAuditFilter(req.query as Record<string, any>);
      const isPaginated = req.query.paginated === 'true';

      await activityLogService
        .log({
          userId: req.user!.id,
          username: req.user!.username,
          userRole: req.user!.role,
          action: 'AUDIT_LOG_ACCESSED',
          targetType: 'ACTIVITY_LOG',
          details: { paginated: isPaginated, filter: { ...req.query } },
          operationStatus: 'success',
          ipAddress: req.ip,
          databaseId: req.user!.databaseId,
        })
        .catch(() => {});

      if (isPaginated) {
        const result = await activityLogService.getFilteredLogs(filter);
        return res.json(result);
      }

      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 200;
      const logs = await activityLogService.getAllLogs(limit);
      res.json(logs);
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/admin/activity-logs/:id', authMw, authorize(['super_admin']), async (req: AuthRequest, res, next) => {
    try {
      const log = await activityLogService.getById(req.params.id);
      if (!log) {
        throw new NotFoundError('Audit log entry not found', 'AUDIT_LOG_NOT_FOUND');
      }

      await activityLogService
        .log({
          userId: req.user!.id,
          username: req.user!.username,
          userRole: req.user!.role,
          action: 'AUDIT_LOG_INSPECTED',
          targetId: log.id,
          targetType: 'ACTIVITY_LOG',
          operationStatus: 'success',
          ipAddress: req.ip,
          databaseId: req.user!.databaseId,
        })
        .catch(() => {});

      res.json(log);
    } catch (error) {
      next(error);
    }
  });

  // Block any attempt to tamper with audit logs via API
  router.all(['/api/admin/activity-logs*', '/api/admin/login-logs*'], authMw, (req, res, next) => {
    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Audit logs are immutable and cannot be modified or deleted',
        code: 'AUDIT_IMMUTABLE',
      });
    }
    next();
  });

  // --- Offline Audit Outbox Ingestion (Android -> Server Sync) ---
  router.post('/api/audit/sync', authMw, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const logs = Array.isArray(req.body?.logs) ? req.body.logs : null;
      if (!logs) {
        throw new ValidationError('logs array is required', 'INVALID_AUDIT_BATCH');
      }
      if (logs.length > 200) {
        throw new ValidationError('Maximum 200 audit entries per sync batch', 'BATCH_TOO_LARGE');
      }

      const result = await activityLogService.ingestOfflineLogs(logs, {
        userId: req.user!.id,
        username: req.user!.username,
        role: req.user!.role,
        databaseId: req.user!.databaseId,
        ipAddress: req.ip,
        appVersion: req.header('x-app-version') || req.body?.appVersion,
        device: {
          platform: req.header('x-platform') || 'android',
          model: req.header('x-device-model'),
        },
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  // --- Sync Conflict Inspection & Safe Resolution ---
  router.get('/api/sync/conflicts', authMw, async (req: AuthRequest, res, next) => {
    try {
      const status = req.query.status as any;
      const conflicts = await syncConflictService.listConflicts(status);
      res.json(conflicts);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/api/sync/conflicts/:id/resolve',
    authMw,
    authorize(['admin', 'super_admin']),
    async (req: AuthRequest, res, next) => {
      try {
        const { resolution, mergedData } = req.body || {};
        if (!['keep_server', 'apply_local', 'merged'].includes(resolution)) {
          throw new ValidationError(
            'resolution must be keep_server, apply_local, or merged',
            'INVALID_RESOLUTION'
          );
        }

        const result = await syncConflictService.resolveConflict(
          req.params.id,
          resolution,
          req.user!.username,
          mergedData
        );
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    }
  );

  // --- SMS History & Delivery Tracking ---
  router.get('/api/sms/logs', authMw, async (req: AuthRequest, res, next) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
      const logs = await smsLogRepo.getAll({
        status: req.query.status ? String(req.query.status) : undefined,
        recipientType: req.query.recipientType ? String(req.query.recipientType) : undefined,
        recipientId: req.query.recipientId ? String(req.query.recipientId) : undefined,
        limit: Number.isFinite(limit) ? limit : 100,
      });
      res.json(logs);
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/sms/logs', authMw, async (req: AuthRequest, res, next) => {
    try {
      const {
        idempotencyKey,
        recipientType,
        recipientId,
        recipientName,
        phone,
        message,
        triggerType,
        deliveryChannel,
        status,
        attempts,
        providerMessageId,
        errorMessage,
        simSlot,
        sentAt,
        deliveredAt,
        createdAt,
      } = req.body || {};

      if (!idempotencyKey || !phone || !message) {
        throw new ValidationError('idempotencyKey, phone, and message are required', 'INVALID_SMS_LOG');
      }

      const validStatuses = ['queued', 'submitted', 'sent', 'delivered', 'failed', 'simulated'];
      const resolvedStatus = validStatuses.includes(status) ? status : 'queued';

      const saved = await smsLogRepo.upsertByIdempotencyKey({
        idempotencyKey: String(idempotencyKey),
        recipientType: recipientType === 'customer' ? 'customer' : recipientType === 'farmer' ? 'farmer' : 'other',
        recipientId: recipientId ? String(recipientId) : undefined,
        recipientName: recipientName ? String(recipientName) : undefined,
        phone: String(phone),
        message: String(message),
        triggerType: String(triggerType || 'manual'),
        deliveryChannel:
          deliveryChannel === 'native_sim'
            ? 'native_sim'
            : deliveryChannel === 'server_gateway'
            ? 'server_gateway'
            : 'server_simulated',
        status: resolvedStatus,
        attempts: Number(attempts) || 1,
        providerMessageId,
        errorMessage,
        simSlot: simSlot !== undefined ? Number(simSlot) : undefined,
        sentAt: sentAt ? new Date(sentAt) : undefined,
        deliveredAt: deliveredAt ? new Date(deliveredAt) : undefined,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        operatorId: req.user!.id,
        databaseId: req.user!.databaseId,
      });

      await activityLogService
        .log({
          userId: req.user!.id,
          username: req.user!.username,
          userRole: req.user!.role,
          action: `SMS_${resolvedStatus.toUpperCase()}`,
          targetId: saved.id,
          targetType: 'SMS',
          details: {
            idempotencyKey: saved.idempotencyKey,
            recipientType: saved.recipientType,
            recipientId: saved.recipientId,
            phone: saved.phone,
            triggerType: saved.triggerType,
            deliveryChannel: saved.deliveryChannel,
            attempts: saved.attempts,
          },
          operationStatus: resolvedStatus === 'failed' ? 'failure' : resolvedStatus === 'queued' ? 'queued' : 'success',
          errorDetails: saved.errorMessage,
          ipAddress: req.ip,
          databaseId: req.user!.databaseId,
          syncStatus: req.header('x-offline-sync') === 'true' ? 'synced_from_offline' : 'online',
          source: 'sms_engine',
        })
        .catch(() => {});

      res.status(201).json(saved);
    } catch (error) {
      next(error);
    }
  });
}
