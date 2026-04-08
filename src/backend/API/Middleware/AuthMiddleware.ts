import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requestContext } from '../../Core/RequestContext';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'admin' | 'operator' | 'super_admin';
    databaseId: string;
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  const databaseId = req.headers['x-database-id'] as string || '(default)';

  if (!token) {
    // For non-authenticated requests that still need a database context
    return requestContext.run({ databaseId }, () => next());
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    
    // Determine the database context
    let effectiveDatabaseId = decoded.databaseId || '(default)';
    
    // Super Admin can override their database context via the header to switch between dairies
    if (decoded.role === 'super_admin' && req.headers['x-database-id']) {
      effectiveDatabaseId = req.headers['x-database-id'] as string;
    }
    
    requestContext.run({ 
      databaseId: effectiveDatabaseId,
      userId: decoded.id,
      role: decoded.role
    }, () => next());
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const authorize = (roles: ('admin' | 'operator' | 'super_admin')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};
