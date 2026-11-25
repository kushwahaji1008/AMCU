/**
 * Auth Config
 *
 * Centralized configuration for JWT signing and verification.
 */

import crypto from 'crypto';

let ephemeralDevSecret: string | null = null;

export const JWT_CONFIG = {
  get secret(): string {
    const envSecret = process.env.JWT_SECRET?.trim();
    if (envSecret) {
      if (process.env.NODE_ENV === 'production' && envSecret.length < 16) {
        throw new Error('JWT_SECRET must be at least 16 characters long in production.');
      }
      return envSecret;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production.');
    }

    if (!ephemeralDevSecret) {
      ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
      console.warn('[Auth] JWT_SECRET not set. Using ephemeral per-process secret for non-production mode.');
    }
    return ephemeralDevSecret;
  },
  expiresIn: '1d' as const,
};
