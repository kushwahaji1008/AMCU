import React, { useState, useEffect } from 'react';
import { db, onSnapshotsInSync } from '../firebase';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export default function SyncStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSynced, setIsSynced] = useState(true);
  const [syncLogs, setSyncLogs] = useState<{ id: string; message: string; type: 'info' | 'success' | 'error'; time: Date }[]>([]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addLog('Connection restored. Syncing pending data...', 'info');
    };
    const handleOffline = () => {
      setIsOnline(false);
      addLog('Connection lost. Working in offline mode.', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Monitor Firestore sync status
    const unsubscribe = onSnapshotsInSync(db, () => {
      setIsSynced(true);
      // We don't want to log every single sync as it might be too frequent
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const addLog = (message: string, type: 'info' | 'success' | 'error') => {
    const newLog = {
      id: Math.random().toString(36).substr(2, 9),
      message,
      type,
      time: new Date(),
    };
    setSyncLogs(prev => [newLog, ...prev].slice(0, 5));
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {/* Sync Logs */}
      <div className="space-y-2 w-72">
        {syncLogs.map(log => (
          <div 
            key={log.id} 
            className={cn(
              "p-3 rounded-xl shadow-lg border text-xs font-medium animate-in slide-in-from-right-full duration-300",
              log.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
              log.type === 'error' ? "bg-red-50 border-red-100 text-red-700" :
              "bg-white border-stone-100 text-stone-600"
            )}
          >
            <div className="flex justify-between mb-1">
              <span>{log.type.toUpperCase()}</span>
              <span className="opacity-50">{log.time.toLocaleTimeString()}</span>
            </div>
            {log.message}
          </div>
        ))}
      </div>

      {/* Status Badge */}
      <div className={cn(
        "px-4 py-2 rounded-full shadow-lg border flex items-center gap-2 text-xs font-bold uppercase tracking-wider pointer-events-auto transition-all duration-500",
        isOnline 
          ? (isSynced ? "bg-white border-stone-100 text-stone-600" : "bg-blue-50 border-blue-100 text-blue-600")
          : "bg-red-50 border-red-100 text-red-600"
      )}>
        {isOnline ? (
          <>
            {isSynced ? (
              <>
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span>All Data Synced</span>
              </>
            ) : (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Syncing...</span>
              </>
            )}
            <div className="w-px h-3 bg-stone-200 mx-1"></div>
            <Wifi size={14} className="text-emerald-500" />
            <span>Online</span>
          </>
        ) : (
          <>
            <WifiOff size={14} />
            <span>Offline Mode</span>
            <div className="w-px h-3 bg-red-200 mx-1"></div>
            <AlertCircle size={14} />
            <span>Local Storage Active</span>
          </>
        )}
      </div>
    </div>
  );
}
