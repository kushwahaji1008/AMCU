import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './AuthMiddleware';
import { ActivityLogService, sanitizeAuditData } from '../../Application/Services/ActivityLogService';
import { getDatabaseId, getRequestAuditDiff } from '../../Core/RequestContext';

function buildDeviceInfo(req: AuthRequest) {
  const ua = (req as any).useragent;
  return {
    platform: (req.header('x-platform') || ua?.platform || 'web').toString(),
    deviceType: ua?.isMobile ? 'mobile' : ua?.isTablet ? 'tablet' : 'desktop',
    os: ua?.os || undefined,
    browser: ua?.browser || undefined,
    model: (req.body?.deviceName || req.header('x-device-model') || undefined) as string | undefined,
  };
}

export const activityLogger = (activityLogService: ActivityLogService) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const isApiRequest = req.path.startsWith('/api/');
    const isAuthRequest = req.path.startsWith('/api/auth/') || req.path === '/api/admin/verify';
    const isAuditSelfEndpoint =
      req.path.startsWith('/api/admin/activity-logs') ||
      req.path.startsWith('/api/admin/login-logs') ||
      req.path === '/api/audit/sync';
    const isWriteOperation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);

    if (!isApiRequest || isAuthRequest || isAuditSelfEndpoint) {
      return next();
    }

    const correlationId = (req.header('x-correlation-id') || crypto.randomUUID()).toString();
    res.setHeader('X-Correlation-Id', correlationId);

    if (!isWriteOperation) {
      // Capture 5xx / 4xx failures on read APIs if they occur
      res.on('finish', () => {
        if (res.statusCode >= 500 || (res.statusCode === 403 && req.user)) {
          activityLogService
            .log({
              userId: req.user?.id || 'anonymous',
              username: req.user?.username || 'anonymous',
              userRole: req.user?.role,
              action: res.statusCode >= 500 ? 'API_SERVER_ERROR' : 'UNAUTHORIZED_ACCESS_ATTEMPT',
              targetType: req.path.split('/')[2]?.toUpperCase().replace(/-/g, '_') || 'SYSTEM',
              details: {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
              },
              operationStatus: 'failure',
              errorDetails: `HTTP ${res.statusCode} on ${req.method} ${req.originalUrl}`,
              ipAddress: req.ip,
              device: buildDeviceInfo(req),
              appVersion: req.header('x-app-version'),
              correlationId,
              syncStatus: req.header('x-offline-sync') === 'true' ? 'synced_from_offline' : 'online',
              source: req.header('x-offline-sync') === 'true' ? 'sync_engine' : 'server',
              databaseId: req.user?.databaseId || getDatabaseId(),
            })
            .catch(() => {});
        }
      });
      return next();
    }

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let capturedResponseBody: any;
    let logged = false;

    const recordOutcome = () => {
      if (logged) return;
      logged = true;

      const resource = req.path.split('/')[2]?.toUpperCase().replace(/-/g, '_') || 'SYSTEM';
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      const isConflict = res.statusCode === 409;
      const action = isSuccess
        ? `${req.method}_${resource}`
        : isConflict
        ? `CONFLICT_${req.method}_${resource}`
        : `FAILED_${req.method}_${resource}`;

      const diff = getRequestAuditDiff();
      const parsedResp = capturedResponseBody && typeof capturedResponseBody === 'object' ? capturedResponseBody : undefined;
      const isOfflineSync = req.header('x-offline-sync') === 'true';

      // Only log authenticated mutations OR server/conflict errors so unauthenticated noise is tracked via failure status cleanly
      const actorId = req.user?.id || 'anonymous';
      const actorUsername = req.user?.username || 'anonymous';

      activityLogService
        .log({
          userId: actorId,
          username: actorUsername,
          userRole: req.user?.role,
          action,
          targetId: req.params.id || parsedResp?.id || parsedResp?._id || parsedResp?.details?.conflictId,
          targetType: resource,
          beforeValue: diff?.beforeValue,
          afterValue: diff?.afterValue ?? (isSuccess ? parsedResp : undefined),
          details: {
            method: req.method,
            url: req.originalUrl,
            params: req.params,
            status: res.statusCode,
            body: sanitizeAuditData(req.body),
            idempotencyKey: req.header('idempotency-key') || undefined,
          },
          operationStatus: isSuccess ? 'success' : isConflict ? 'conflict' : 'failure',
          errorDetails: !isSuccess
            ? ((res.locals as any)?.errorDetails || parsedResp?.message || `HTTP ${res.statusCode}`)
            : undefined,
          ipAddress: req.ip,
          device: buildDeviceInfo(req),
          appVersion: req.header('x-app-version'),
          syncStatus: isOfflineSync ? 'synced_from_offline' : 'online',
          correlationId,
          source: isOfflineSync ? 'sync_engine' : 'server',
          databaseId: req.user?.databaseId || getDatabaseId(),
        })
        .catch((err) => console.error('[ActivityLog] Failed to record:', err));
    };

    res.json = function (data: any) {
      capturedResponseBody = data;
      recordOutcome();
      return originalJson(data);
    };

    res.send = function (body?: any) {
      if (typeof body === 'string') {
        try {
          capturedResponseBody = JSON.parse(body);
        } catch {
          capturedResponseBody = { raw: body };
        }
      }
      recordOutcome();
      return originalSend(body);
    };

    res.on('finish', () => {
      recordOutcome();
    });

    next();
  };
};
