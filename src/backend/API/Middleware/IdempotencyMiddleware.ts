import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './AuthMiddleware';
import { IIdempotencyRepository } from '../../Application/Interfaces/IRepositories';
import { ConflictError, ValidationError } from '../../Core/Errors';

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>)
    .filter((k) => k !== 'idempotencyKey' && k !== 'expectedVersion' && k !== 'baseVersion')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function idempotencyMiddleware(repo: IIdempotencyRepository) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (!isMutating) return next();

    const isStateUpdateLogRoute = req.path === '/api/sms/logs';
    const rawKey = (
      req.header('Idempotency-Key') ||
      (!isStateUpdateLogRoute ? req.body?.idempotencyKey : '') ||
      ''
    )
      .toString()
      .trim();
    if (!rawKey) return next();

    if (rawKey.length > 160) {
      return next(new ValidationError('Idempotency-Key is too long', 'INVALID_IDEMPOTENCY_KEY'));
    }

    const scopeUser = req.user?.id || 'anonymous';
    const scopedKey = `${scopeUser}:${req.method}:${req.path}:${rawKey}`;
    const requestHash = crypto
      .createHash('sha256')
      .update(`${req.method}:${req.path}:${stableStringify(req.body || {})}`)
      .digest('hex');

    try {
      const outcome = await repo.acquire(scopedKey, req.method, req.path, requestHash, req.user?.id);

      if (outcome === 'completed') {
        const cached = await repo.getByKey(scopedKey);
        if (cached) {
          res.setHeader('X-Idempotent-Replay', 'true');
          return res.status(cached.responseStatus || 200).json(cached.responseBody ?? { success: true });
        }
      }

      if (outcome === 'in_progress') {
        return next(
          new ConflictError('An operation with this Idempotency-Key is currently in progress', 'IDEMPOTENCY_IN_PROGRESS')
        );
      }

      if (outcome === 'hash_mismatch') {
        return next(
          new ValidationError('Idempotency-Key was reused with a different request payload', 'IDEMPOTENCY_KEY_MISMATCH')
        );
      }

      let recorded = false;
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const finalize = (body: any) => {
        if (recorded) return;
        recorded = true;
        if (res.statusCode >= 500) {
          repo.release(scopedKey).catch((err) => console.error('[Idempotency] release error:', err));
        } else {
          repo.complete(scopedKey, res.statusCode, body).catch((err) =>
            console.error('[Idempotency] complete error:', err)
          );
        }
      };

      res.json = function (body: any) {
        finalize(body);
        return originalJson(body);
      };

      res.send = function (body?: any) {
        if (!recorded && res.statusCode === 204) {
          finalize({ success: true });
        } else if (!recorded && res.statusCode >= 500) {
          recorded = true;
          repo.release(scopedKey).catch(() => {});
        }
        return originalSend(body);
      };

      res.on('close', () => {
        if (!recorded && !res.writableEnded) {
          recorded = true;
          repo.release(scopedKey).catch(() => {});
        }
      });

      next();
    } catch (err) {
      next(err);
    }
  };
}
