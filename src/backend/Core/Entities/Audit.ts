/**
 * LoginAudit Entity
 * 
 * Defines the structure for storing detailed logs of user login attempts.
 * This is used for security monitoring and auditing.
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
    ll?: [number, number]; // Latitude, Longitude
  };
  status: 'success' | 'failure';
  failureReason?: string;
  databaseId: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: any;
  ipAddress?: string;
  timestamp: Date;
  databaseId: string;
}
