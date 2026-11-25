/**
 * AuthMiddleware
 *
 * Provides authentication and role-based authorization for API routes.
 * Enforces JWT verification, session fingerprinting, active account checks,
 * single-device session validation, and tenant context binding.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  DEFAULT_DATABASE_ID,
  UserRole,
  isValidDatabaseId,
  requestContext,
} from '../../Core/RequestContext';
import { dbManager } from '../../Infrastructure/Persistence/Mongo/DatabaseManager';
import { JWT_CONFIG } from '../Config/Auth';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: UserRole;
    databaseId: string;
    dairyId: string;
    fp?: string;
    sid?: string;
  };
}

/**
 * Rejects any request without a valid Bearer JWT and initializes tenant RequestContext.
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
      code: 'AUTH_REQUIRED',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_CONFIG.secret) as any;

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
        code: 'TOKEN_INVALID',
      });
    }

    // Verify User-Agent session fingerprint when bound
    if (decoded.fp && decoded.fp !== 'none') {
      const currentUserAgent = req.headers['user-agent'] || '';
      const currentFingerprint = crypto.createHash('sha256').update(currentUserAgent).digest('hex');

      if (decoded.fp !== currentFingerprint) {
        return res.status(401).json({
          success: false,
          message: 'Security Alert: Request authenticity could not be verified. Please log in again.',
          code: 'FINGERPRINT_MISMATCH',
        });
      }
    }

    // Verify user status, role, and single-device session ID against the global registry
    const userModel = await dbManager.getUserModel(DEFAULT_DATABASE_ID);
    const user = await userModel
      .findById(decoded.id)
      .select('username role status databaseId dairyId currentSessionId')
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists. Please log in again.',
        code: 'SESSION_INVALIDATED',
      });
    }

    if (user.status === 'inactive') {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    if (user.currentSessionId !== undefined && (!decoded.sid || user.currentSessionId !== decoded.sid)) {
      return res.status(401).json({
        success: false,
        message: 'You have been logged out because your account was logged in on another device or session ended.',
        code: 'SESSION_INVALIDATED',
      });
    }

    let effectiveDatabaseId = user.databaseId || DEFAULT_DATABASE_ID;
    const requestedDbId = req.headers['x-database-id'] as string | undefined;

    if (user.role === 'super_admin' && requestedDbId) {
      if (!isValidDatabaseId(requestedDbId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid x-database-id header format.',
          code: 'INVALID_DATABASE_ID',
        });
      }
      effectiveDatabaseId = requestedDbId;
    }

    const effectiveDairyId =
      user.role === 'super_admin' && requestedDbId ? requestedDbId : user.dairyId || effectiveDatabaseId;

    req.user = {
      id: decoded.id,
      username: user.username,
      role: user.role,
      databaseId: effectiveDatabaseId,
      dairyId: effectiveDairyId,
      fp: decoded.fp,
      sid: decoded.sid,
    };

    return requestContext.run(
      {
        databaseId: effectiveDatabaseId,
        dairyId: effectiveDairyId,
        userId: decoded.id,
        username: user.username,
        role: user.role,
      },
      () => next()
    );
  } catch (error: any) {
    let message = 'Invalid or expired token';
    let code = 'AUTH_ERROR';

    if (error.name === 'TokenExpiredError') {
      message = 'Your session has expired. Please log in again.';
      code = 'TOKEN_EXPIRED';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Invalid authentication token. Please log in again.';
      code = 'TOKEN_INVALID';
    }

    console.warn(`[Auth] Authentication failed: ${code} (${error.message})`);
    return res.status(401).json({ success: false, message, code });
  }
};

/**
 * Middleware to restrict route access to specific roles.
 */
export const authorize = (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied', code: 'FORBIDDEN' });
    }
    next();
  };
};
