import React, { useState, useEffect, useCallback } from 'react';
import {
  HelpCircle,
  BookOpen,
  Milk,
  Database,
  RefreshCw,
  Smartphone,
  Cpu,
  Wifi,
  WifiOff,
  CheckCircle,
  Play,
  AlertTriangle,
  MessageSquare,
  GitMerge,
  Trash2,
  X,
  Globe,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { offlineService } from '../services/offlineService';
import { realmInstance } from '../services/realm';
import { isNativeApp } from '../services/platform';
import {
  LocalSyncConflict,
  PersistedSmsRecord,
  PersistedSyncTask,
  sqliteDb,
} from '../services/sqliteDatabase';
import { SimInfo, smsService } from '../services/smsService';
import { toast } from 'sonner';

export default function HelpAbout() {
  const isNative = isNativeApp();
  const [activeTab, setActiveTab] = useState<'support' | 'diagnostics'>('support');
  const [dbStats, setDbStats] = useState({
    farmers: 0,
    collections: 0,
    shifts: 0,
    payments: 0,
    queuedTasks: 0,
    failedTasks: 0,
    conflicts: 0,
    queuedSms: 0,
    pendingAudit: 0,
  });
  const [queuedItems, setQueuedItems] = useState<PersistedSyncTask[]>([]);
  const [conflicts, setConflicts] = useState<LocalSyncConflict[]>([]);
  const [smsHistory, setSmsHistory] = useState<PersistedSmsRecord[]>([]);
  const [availableSims, setAvailableSims] = useState<SimInfo[]>([]);
  const [preferredSim, setPreferredSim] = useState<number>(() => smsService.getPreferredSimSlot());
  const [mergingConflict, setMergingConflict] = useState<LocalSyncConflict | null>(null);
  const [mergedJson, setMergedJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [networkState, setNetworkState] = useState(offlineService.isOnline);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchDbStats = useCallback(async () => {
    if (!sqliteDb.isEnabled()) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      await sqliteDb.init();
      const [stats, tasks, unresolvedConflicts, smsRows, sims] = await Promise.all([
        sqliteDb.getDiagnosticsStats(),
        sqliteDb.getAllSyncTasks(),
        sqliteDb.getConflicts('unresolved'),
        sqliteDb.getSmsQueue(40),
        smsService.getAvailableSims(),
      ]);

      setDbStats({
        farmers: stats.counts.farmers || 0,
        collections: stats.counts.collections || 0,
        shifts: stats.counts.shifts || 0,
        payments: (stats.counts.ledgers || 0) + (stats.counts.payments || 0),
        queuedTasks: stats.pendingSyncCount,
        failedTasks: stats.failedSyncCount,
        conflicts: stats.conflictCount,
        queuedSms: stats.queuedSmsCount + stats.failedSmsCount,
        pendingAudit: stats.pendingAuditCount,
      });
      setQueuedItems(tasks);
      setConflicts(unresolvedConflicts);
      setSmsHistory(smsRows);
      setAvailableSims(sims);
    } catch (err) {
      console.error('Failed to query local SQLite diagnostics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDbStats();
    return offlineService.subscribeSyncState((snap) => {
      setNetworkState(snap.isOnline);
      setIsSyncing(snap.isSyncing);
    });
  }, [fetchDbStats]);

  const handleProcessSync = async () => {
    if (!offlineService.isOnline) {
      toast.error('Cannot sync: Device is currently offline. Connect to internet and try again.');
      return;
    }

    setIsSyncing(true);
    toast.loading('Synchronizing pending queues and logs...', { id: 'sync-progress' });
    try {
      const res = await offlineService.triggerSyncCycle('manual');
      await fetchDbStats();
      if (res.conflicts > 0) {
        toast.warning(
          `Synced ${res.synced} item(s). ${res.conflicts} conflict(s) require manual resolution below.`,
          { id: 'sync-progress' }
        );
      } else {
        toast.success(`Sync completed (${res.synced} pushed, ${res.failed} remaining).`, { id: 'sync-progress' });
      }
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message || String(e)}`, { id: 'sync-progress' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForceReSync = async () => {
    if (!offlineService.isOnline) {
      toast.error('Cannot re-sync: Device is currently offline.');
      return;
    }

    setIsSyncing(true);
    toast.loading('Refreshing local SQLite cache from server...', { id: 'resync-progress' });
    try {
      await offlineService.syncFromServer(true);
      await fetchDbStats();
      toast.success('Local SQLite storage updated cleanly from server!', { id: 'resync-progress' });
    } catch (e: any) {
      toast.error(`Download sync failed: ${e.message || String(e)}`, { id: 'resync-progress' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResolveConflict = async (
    conflict: LocalSyncConflict,
    resolution: 'keep_server' | 'apply_local' | 'merged',
    mergedData?: Record<string, any>
  ) => {
    try {
      await offlineService.resolveConflictOffline(conflict.id, resolution, mergedData);
      toast.success(`Conflict resolved (${resolution.replace('_', ' ')}).`);
      setMergingConflict(null);
      await fetchDbStats();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to resolve conflict');
    }
  };

  const handleDiscardTask = async (taskId: string) => {
    if (!window.confirm('Discard this failed sync item? It has not been saved to the server.')) return;
    await sqliteDb.removeSyncTask(taskId);
    await offlineService.refreshSyncStatus();
    await fetchDbStats();
    toast.success('Sync queue task removed.');
  };

  const handleRetrySms = async () => {
    try {
      const count = await smsService.retryQueuedSms(true);
      await fetchDbStats();
      toast.success(count > 0 ? `Processed ${count} queued SMS item(s).` : 'No pending SMS items to retry.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to retry SMS queue');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">
            Help, About &amp; Diagnostics
          </h1>
          <p className="text-stone-500 dark:text-stone-400">
            View app version, platform architecture, SQLite sync queue, conflicts &amp; SMS logs
          </p>
        </div>

        <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-2xl border border-stone-200/50 dark:border-stone-700/50 self-start">
          <button
            onClick={() => setActiveTab('support')}
            className={cn(
              'px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2',
              activeTab === 'support'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
            )}
          >
            <HelpCircle size={16} />
            Support &amp; FAQs
          </button>
          <button
            onClick={() => {
              setActiveTab('diagnostics');
              fetchDbStats();
            }}
            className={cn(
              'px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2',
              activeTab === 'diagnostics'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
            )}
          >
            <Database size={16} />
            Sync &amp; Diagnostics
          </button>
        </div>
      </div>

      {activeTab === 'support' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-stone-900 dark:bg-white rounded-2xl flex items-center justify-center">
                  <Milk className="text-white dark:text-stone-900" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">
                    DugdhaSetu Enterprise
                  </h2>
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {isNative ? 'Capacitor Android Offline-First APK' : 'Online Web Application'}
                  </p>
                </div>
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                DugdhaSetu is built specifically for automated milk collection units. The Android APK runs with a real persistent Capacitor SQLite database, atomic transactions, idempotent WorkManager background synchronization, and SIM SMS queue handling. Website browsers run strictly online directly against the central cloud API.
              </p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-800">
                  <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                    Runtime Mode
                  </p>
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-200 mt-1">
                    {isNative ? 'Android APK (Offline-First)' : 'Web Browser (Online-Only)'}
                  </p>
                </div>
                <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-800">
                  <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                    Persistence Engine
                  </p>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                    {isNative ? 'Capacitor Native SQLite' : 'Direct Server API'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">
                Frequently Asked Questions
              </h2>
              <div className="space-y-4">
                {[
                  {
                    q: 'How does offline mode function in the Android APK?',
                    a: 'The Android APK persists all farmers, collections, sales, and payments inside native Capacitor SQLite with idempotency keys and ordered background synchronization via WorkManager and app-resume hooks.',
                  },
                  {
                    q: 'Why does the website require an internet connection?',
                    a: 'By architecture design, website browsers always connect directly to the server with no local offline transaction queue so shared computer terminals remain strictly consistent.',
                  },
                  {
                    q: 'What happens if two devices edit the same record while offline?',
                    a: 'DugdhaSetu tracks record versions and detects conflicts during sync instead of silently overwriting data. Conflicts appear in Sync & Diagnostics for safe resolution.',
                  },
                ].map((faq, i) => (
                  <div
                    key={i}
                    className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-100 dark:border-stone-800"
                  >
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-200">{faq.q}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Quick Guides</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <BookOpen className="text-stone-400 mt-1" size={18} />
                  <div>
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-200">
                      AMCU User Manual (v{APP_VERSION.split('.').slice(0, 2).join('.')})
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Complete hardware &amp; daily operations guide
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          <div className="bg-white dark:bg-stone-900 p-6 md:p-8 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-16 h-16 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-3xl flex items-center justify-center shrink-0">
              {isNative ? (
                <Smartphone className="text-stone-900 dark:text-white" size={28} />
              ) : (
                <Globe className="text-stone-900 dark:text-white" size={28} />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-serif font-medium text-stone-900 dark:text-white">
                  v{APP_VERSION} - {isNative ? 'Native Android Release' : 'Online Web Edition'}
                </h3>
                <span
                  className={cn(
                    'px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border',
                    isNative
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60'
                      : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/60'
                  )}
                >
                  {isNative ? 'SQLite Offline-First Enabled' : 'Online-Only Direct Mode'}
                </span>
              </div>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {isNative
                  ? 'Persistent SQLite storage, idempotent synchronization, conflict tracking, and SIM SMS queue are active on this Android device.'
                  : 'Web browser mode enforces strict online-only direct server API calls with no offline SQLite database or browser transaction queues.'}
              </p>
            </div>
          </div>

          {!isNative ? (
            <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 text-center space-y-3">
              <Globe className="mx-auto text-blue-500" size={32} />
              <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">
                Website Online-Only Diagnostics
              </h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 max-w-xl mx-auto">
                No local SQLite database or offline transaction queue is initialized in web browsers. Install the Capacitor Android APK to use offline collections, WorkManager sync, and native SIM SMS dispatching.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                {/* SQLite Table Metrics */}
                <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
                      <Database size={18} className="text-blue-500" />
                      Native SQLite Storage Metrics
                    </h3>
                    <button
                      onClick={fetchDbStats}
                      disabled={loading}
                      className="p-1 px-3 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-xs font-semibold text-stone-500 transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
                      Refresh
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl">
                      <span className="text-[10px] font-medium text-stone-400 uppercase tracking-widest block">
                        Farmers
                      </span>
                      <span className="text-2xl font-semibold text-stone-900 dark:text-white mt-1 block">
                        {loading ? '...' : dbStats.farmers}
                      </span>
                    </div>
                    <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl">
                      <span className="text-[10px] font-medium text-stone-400 uppercase tracking-widest block">
                        Collections
                      </span>
                      <span className="text-2xl font-semibold text-stone-900 dark:text-white mt-1 block">
                        {loading ? '...' : dbStats.collections}
                      </span>
                    </div>
                    <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl">
                      <span className="text-[10px] font-medium text-stone-400 uppercase tracking-widest block">
                        Queued SMS
                      </span>
                      <span className="text-2xl font-semibold text-stone-900 dark:text-white mt-1 block">
                        {loading ? '...' : dbStats.queuedSms}
                      </span>
                    </div>
                    <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl">
                      <span className="text-[10px] font-medium text-stone-400 uppercase tracking-widest block">
                        Audit Outbox
                      </span>
                      <span className="text-2xl font-semibold text-stone-900 dark:text-white mt-1 block">
                        {loading ? '...' : dbStats.pendingAudit}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Unresolved Sync Conflicts */}
                {conflicts.length > 0 && (
                  <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-red-200 dark:border-red-900/50 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-serif font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                        <AlertTriangle size={18} />
                        Sync Conflicts Requiring Resolution ({conflicts.length})
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {conflicts.map((conflict) => (
                        <div
                          key={conflict.id}
                          className="p-4 bg-red-50/50 dark:bg-red-950/20 rounded-2xl border border-red-200/70 dark:border-red-900/40 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                              {conflict.entityType} • ID: {conflict.entityId}
                            </span>
                            <span className="text-[10px] font-mono text-stone-500">
                              Local v{conflict.localVersion ?? '?'} vs Server v{conflict.serverVersion ?? '?'}
                            </span>
                          </div>
                          <p className="text-xs text-stone-700 dark:text-stone-300">{conflict.reason}</p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
                            <div className="p-2.5 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 max-h-32 overflow-auto">
                              <div className="text-[10px] font-bold text-stone-400 mb-1">LOCAL CHANGE</div>
                              <pre>{JSON.stringify(conflict.localPayload, null, 2)}</pre>
                            </div>
                            <div className="p-2.5 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 max-h-32 overflow-auto">
                              <div className="text-[10px] font-bold text-stone-400 mb-1">SERVER STATE</div>
                              <pre>{JSON.stringify(conflict.serverPayload || {}, null, 2)}</pre>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              onClick={() => handleResolveConflict(conflict, 'keep_server')}
                              className="px-3 py-1.5 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-900 text-xs font-semibold"
                            >
                              Keep Server
                            </button>
                            <button
                              onClick={() => handleResolveConflict(conflict, 'apply_local')}
                              className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold"
                            >
                              Apply Local
                            </button>
                            <button
                              onClick={() => {
                                setMergingConflict(conflict);
                                setMergedJson(
                                  JSON.stringify(
                                    {
                                      ...(conflict.serverPayload || {}),
                                      ...(conflict.localPayload?.data || conflict.localPayload || {}),
                                    },
                                    null,
                                    2
                                  )
                                );
                              }}
                              className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <GitMerge size={12} />
                              Merge Edit
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sync Queue Panel */}
                <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
                      <Cpu size={18} className="text-amber-500" />
                      Outgoing Sync Queue
                    </h3>
                    <span className="px-2.5 py-1 text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl">
                      {queuedItems.length} Tasks
                    </span>
                  </div>

                  {queuedItems.length === 0 ? (
                    <div className="p-8 border-2 border-dashed border-stone-100 dark:border-stone-800 rounded-2xl text-center space-y-2">
                      <CheckCircle className="text-stone-300 dark:text-stone-600 mx-auto" size={28} />
                      <p className="text-sm font-medium text-stone-900 dark:text-white">
                        All local transactions are synchronized!
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                      {queuedItems.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-start justify-between gap-3 p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-100 dark:border-stone-800"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 uppercase bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded">
                                {task.type}
                              </span>
                              <span className="text-[10px] font-bold uppercase text-stone-500">
                                {task.status} (retries: {task.retryCount})
                              </span>
                            </div>
                            <span className="text-[10px] text-stone-400 block">
                              {new Date(task.createdAt).toLocaleString()}
                            </span>
                            {task.lastError && (
                              <p className="text-[11px] text-red-500 font-medium">{task.lastError}</p>
                            )}
                          </div>
                          {task.status === 'failed' && (
                            <button
                              onClick={() => handleDiscardTask(task.id)}
                              className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg"
                              title="Discard failed task"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SMS Delivery Queue Panel */}
                <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
                      <MessageSquare size={18} className="text-emerald-500" />
                      Android SMS Queue &amp; Delivery Status
                    </h3>
                    <button
                      onClick={handleRetrySms}
                      className="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-semibold hover:bg-stone-200 dark:hover:bg-stone-700"
                    >
                      Retry Queued SMS
                    </button>
                  </div>

                  {smsHistory.length === 0 ? (
                    <p className="text-xs text-stone-400 italic">No SMS messages recorded on this device yet.</p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                      {smsHistory.map((s) => (
                        <div
                          key={s.id}
                          className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-100 dark:border-stone-800 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-stone-900 dark:text-white">
                                {s.recipientName || s.phone}
                              </span>
                              <span className="text-[11px] font-mono text-stone-500">{s.phone}</span>
                              <span
                                className={cn(
                                  'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase',
                                  s.status === 'delivered' || s.status === 'sent'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                    : s.status === 'failed'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                )}
                              >
                                {s.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-500 truncate">{s.message}</p>
                            {s.errorMessage && <p className="text-[11px] text-red-500">{s.errorMessage}</p>}
                          </div>
                          <span className="text-[10px] text-stone-400 shrink-0">
                            {new Date(s.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Network, SIM Preference, Files, Actions */}
              <div className="space-y-6">
                <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
                  <h3 className="text-sm font-serif font-medium text-stone-400 uppercase tracking-widest pl-1">
                    Capacitor Network
                  </h3>
                  <div
                    className={cn(
                      'p-4 rounded-2xl border flex items-center gap-4',
                      networkState
                        ? 'bg-emerald-50/50 border-emerald-200/50 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300'
                        : 'bg-amber-50/50 border-amber-200/50 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300'
                    )}
                  >
                    {networkState ? (
                      <>
                        <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shrink-0">
                          <Wifi size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">Society Cloud Connected</p>
                          <p className="text-xs opacity-80 mt-0.5">Auto-sync and audit flush active.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shrink-0">
                          <WifiOff size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">Offline SQLite Engaged</p>
                          <p className="text-xs opacity-80 mt-0.5">Transactions stored atomically on device.</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Dual-SIM Preference */}
                <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-3">
                  <h3 className="text-sm font-serif font-medium text-stone-400 uppercase tracking-widest pl-1">
                    SIM Card Selection
                  </h3>
                  <select
                    value={preferredSim}
                    onChange={(e) => {
                      const slot = Number(e.target.value);
                      setPreferredSim(slot);
                      smsService.setPreferredSimSlot(slot);
                      toast.success(`SMS SIM preference set to Slot ${slot + 1}`);
                    }}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-xs dark:text-white"
                  >
                    {availableSims.length > 0 ? (
                      availableSims.map((sim) => (
                        <option key={sim.subscriptionId} value={sim.slotIndex}>
                          SIM {sim.slotIndex + 1}: {sim.displayName || sim.carrierName}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value={0}>SIM 1 (Default)</option>
                        <option value={1}>SIM 2</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Native Backups */}
                <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
                  <h3 className="text-sm font-serif font-medium text-stone-400 uppercase tracking-widest pl-1">
                    Local Device Backups
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        const id = toast.loading('Exporting SQLite backup & CSVs...');
                        try {
                          await realmInstance.saveBackupToFilesystem();
                          toast.success('Backup & CSV spreadsheets exported!', { id });
                        } catch (err: any) {
                          toast.error(`Backup failed: ${err.message || String(err)}`, { id });
                        }
                      }}
                      className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={14} />
                      Export Backup
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm('Restore SQLite tables from backup file?')) return;
                        const id = toast.loading('Restoring SQLite from backup...');
                        try {
                          const ok = await realmInstance.loadBackupFromFilesystem();
                          if (ok) {
                            await fetchDbStats();
                            toast.success('SQLite database restored!', { id });
                          } else {
                            toast.error('No backup file found.', { id });
                          }
                        } catch (err: any) {
                          toast.error(`Restore failed: ${err.message || String(err)}`, { id });
                        }
                      }}
                      className="py-3 border border-stone-200 dark:border-stone-700 text-xs font-medium rounded-xl flex items-center justify-center gap-2"
                    >
                      <Database size={14} />
                      Restore Backup
                    </button>
                  </div>
                </div>

                {/* Manual Action Center */}
                <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
                  <h3 className="text-sm font-serif font-medium text-stone-900 dark:text-white pl-1">
                    Manual Action Center
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={handleProcessSync}
                      disabled={isSyncing}
                      className="w-full py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 disabled:opacity-50 font-medium text-xs rounded-xl flex items-center justify-center gap-2"
                    >
                      <Play size={14} />
                      Sync Now
                    </button>
                    <button
                      onClick={handleForceReSync}
                      disabled={isSyncing}
                      className="w-full py-3 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 disabled:opacity-50 font-medium text-xs rounded-xl flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={14} className={cn(isSyncing && 'animate-spin')} />
                      Pull Master Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Merge Conflict Modal */}
      {mergingConflict && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg text-stone-900 dark:text-white">Merge Conflicting Record</h3>
              <button onClick={() => setMergingConflict(null)} className="p-1 text-stone-400 hover:text-stone-900">
                <X size={18} />
              </button>
            </div>
            <textarea
              value={mergedJson}
              onChange={(e) => setMergedJson(e.target.value)}
              rows={12}
              className="w-full p-3 font-mono text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMergingConflict(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  try {
                    const parsed = JSON.parse(mergedJson);
                    void handleResolveConflict(mergingConflict, 'merged', parsed);
                  } catch {
                    toast.error('Invalid JSON format in merged payload.');
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-900"
              >
                Save Merged Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
