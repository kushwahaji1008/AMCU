/**
 * Auth Config
 * 
 * Centralized configuration for authentication.
 */

export const JWT_CONFIG = {
  get secret(): string {
    return process.env.JWT_SECRET || 'your-secret-key';
  },
  expiresIn: '1d' as const
};
