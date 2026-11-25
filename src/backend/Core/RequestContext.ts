import { AsyncLocalStorage } from 'async_hooks';

export type UserRole = 'admin' | 'operator' | 'super_admin';

export interface RequestContext {
  databaseId: string;
  dairyId?: string;
  userId?: string;
  username?: string;
  role?: UserRole;
  auditBeforeValue?: any;
  auditAfterValue?: any;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const DEFAULT_DATABASE_ID = '(default)';
export const SUPERADMIN_DATABASE_ID = 'dugdhaset.superadmin';

export const RESERVED_DATABASE_IDS = new Set([
  '(default)',
  'default',
  'dugdhaset.superadmin',
  'dugdhaset_registry',
  'dugdhaset_superadmin',
  'admin',
  'local',
  'config',
  'global',
]);

/**
 * Validates that a tenant databaseId is safe and well-formed.
 */
export function isValidDatabaseId(databaseId: string): boolean {
  if (!databaseId || typeof databaseId !== 'string') return false;
  if (databaseId === DEFAULT_DATABASE_ID) return true;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,48}[a-zA-Z0-9]$/.test(databaseId) || /^[a-zA-Z0-9]{2,50}$/.test(databaseId);
}

/**
 * Normalizes a databaseId to a canonical MongoDB database name (max 63 bytes).
 */
export function toMongoDatabaseName(databaseId: string): string {
  if (databaseId === DEFAULT_DATABASE_ID) {
    return 'dugdhaset_registry';
  }
  const normalized = databaseId.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `dugdhaset_${normalized}`.slice(0, 63);
}

export function getDatabaseId(): string {
  const context = requestContext.getStore();
  return context?.databaseId || DEFAULT_DATABASE_ID;
}

export function getDairyId(): string {
  const context = requestContext.getStore();
  return context?.dairyId || context?.databaseId || DEFAULT_DATABASE_ID;
}

export function getRequestUser(): Pick<RequestContext, 'userId' | 'username' | 'role' | 'databaseId' | 'dairyId'> | undefined {
  return requestContext.getStore();
}

export function setRequestAuditDiff(beforeValue: any, afterValue: any) {
  const store = requestContext.getStore();
  if (store) {
    store.auditBeforeValue = beforeValue;
    store.auditAfterValue = afterValue;
  }
}

export function getRequestAuditDiff(): { beforeValue?: any; afterValue?: any } | undefined {
  const store = requestContext.getStore();
  if (!store) return undefined;
  return {
    beforeValue: store.auditBeforeValue,
    afterValue: store.auditAfterValue,
  };
}
