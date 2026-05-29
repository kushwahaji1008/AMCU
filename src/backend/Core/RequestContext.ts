import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  databaseId: string;
  userId?: string;
  role?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getDatabaseId(): string {
  const context = requestContext.getStore();
  return context?.databaseId || '(default)';
}
