/**
 * AuthMiddleware
 * 
 * Provides authentication and authorization logic for API routes.
 * Includes JWT verification and session fingerprinting checks.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { requestContext } from '../../Core/RequestContext';
import { dbManager } from '../../Infrastructure/Persistence/Mongo/DatabaseManager';
import { JWT_CONFIG } from '../Config/Auth';

/**
 * Extended Request interface to include the authenticated user.
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'admin' | 'operator' | 'super_admin';
    databaseId: string;
    fp?: string;
    sid?: string;
  };
}

/**
 * Middleware to authenticate requests using JWT.
 * Also verifies the session fingerprint and session ID to prevent token hijacking and multiple logins.
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  const databaseId = req.headers['x-database-id'] as string || '(default)';

  // 1. Handle Unauthenticated Requests
  if (!token || token === 'null' || token === 'undefined') {
    // For non-authenticated requests that still need a database context (e.g., public info)
    return requestContext.run({ databaseId }, () => next());
  }

  try {
    // 2. Verify JWT Signature
    const decoded = jwt.verify(token, JWT_CONFIG.secret) as any;
    
    // 3. Verify Session Fingerprint
    // Ensures the token is being used by the same browser/device it was issued to.
    if (decoded.fp && decoded.fp !== 'none') {
      const currentUserAgent = req.headers['user-agent'] || '';
      const currentFingerprint = crypto.createHash('sha256').update(currentUserAgent).digest('hex');
      
      if (decoded.fp !== currentFingerprint) {
        return res.status(401).json({ 
          message: 'Security Alert: Request authenticity could not be verified. Please log in again.',
          code: 'FINGERPRINT_MISMATCH'
        });
      }
    }

    // 4. Verify Session ID (Single-Device Enforcement)
    // Fetches the user from the global registry to check if a newer session exists.
    if (decoded.sid) {
      const userModel = await dbManager.getUserModel('(default)');
      const user = await userModel.findById(decoded.id);
      
      if (!user || user.currentSessionId !== decoded.sid) {
        return res.status(401).json({ 
          message: 'You have been logged out because your account was logged in on another device.',
          code: 'SESSION_INVALIDATED'
        });
      }
    }

    req.user = decoded;
    
    // 5. Determine Database Context
    let effectiveDatabaseId = decoded.databaseId || '(default)';
    
    // Super Admin can override their database context via the header to switch between dairies
    if (decoded.role === 'super_admin' && req.headers['x-database-id']) {
      effectiveDatabaseId = req.headers['x-database-id'] as string;
    }
    
    // 6. Initialize Request Context (AsyncLocalStorage)
    requestContext.run({ 
      databaseId: effectiveDatabaseId,
      userId: decoded.id,
      role: decoded.role
    }, () => next());
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

    res.status(401).json({ message, code, detail: error.message });
    
    // Log for server-side debugging
    console.warn(`[Auth] Authentication failed: ${message} (${error.message})`);
  }
};

/**
 * Middleware to authorize requests based on user roles.
 */
export const authorize = (roles: ('admin' | 'operator' | 'super_admin')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};
