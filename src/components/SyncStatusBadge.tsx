import React from 'react';
import { isNativeApp } from '../services/platform';
import { cn } from '../lib/utils';

interface SyncStatusBadgeProps {
  status?: string;
  className?: string;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ status, className }) => {
  if (!isNativeApp() || !status || status === 'synced') {
    return null;
  }

  const isConflict = status === 'conflict';
  const isFailed = status === 'failed';

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
        isConflict
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          : isFailed
          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        className
      )}
    >
      {isConflict ? 'Conflict' : isFailed ? 'Sync Failed' : 'Pending Sync'}
    </span>
  );
};
