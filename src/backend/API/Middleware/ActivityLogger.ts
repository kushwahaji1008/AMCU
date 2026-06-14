import { Response, NextFunction } from 'express';
import { AuthRequest } from './AuthMiddleware';
import { ActivityLogService } from '../../Application/Services/ActivityLogService';

export const activityLogger = (activityLogService: ActivityLogService) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // We only want to intercept the response for non-GET API requests
    const isWriteOperation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    const isApiRequest = req.originalUrl.startsWith('/api/');
    const isAuthRequest = req.originalUrl.includes('/auth/'); // Logged separately via LoginAudit

    if (isWriteOperation && isApiRequest && !isAuthRequest) {
      const originalJson = res.json;

      res.json = function(data) {
        // Only log successful operations
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const user = req.user;
          if (user) {
            // Determine action name from URL and Method
            // /api/farmers -> FARMER
            const Resource = req.originalUrl.split('/')[2]?.toUpperCase().replace(/-/g, '_') || 'SYSTEM';
            const action = `${req.method}_${Resource}`;

            activityLogService.log({
              userId: user.id || 'system',
              username: user.username || 'unknown',
              action: action,
              targetId: req.params.id || data?.id || data?._id,
              targetType: Resource,
              details: {
                method: req.method,
                url: req.originalUrl,
                params: req.params,
                status: res.statusCode,
                // Don't log passwords or sensitive data if they were somehow in body
                body: { ...req.body, password: undefined, token: undefined }
              },
              ipAddress: req.ip
            }).catch(err => console.error('[ActivityLog] Failed to record:', err));
          }
        }
        return originalJson.call(this, data);
      };
    }

    next();
  };
};
