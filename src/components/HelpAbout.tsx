import React, { useState, useEffect } from 'react';
import { 
  HelpCircle, Info, BookOpen, MessageCircle, Mail, Globe, Milk, 
  Database, RefreshCw, Smartphone, Cpu, ShieldCheck, Wifi, WifiOff,
  Server, Layers, CheckCircle, Play, AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db, offlineService } from '../services/offlineService';
import { realmInstance } from '../services/realm';
import { toast } from 'sonner';

export default function HelpAbout() {
  const [activeTab, setActiveTab] = useState<'support' | 'diagnostics'>('support');
  const [dbStats, setDbStats] = useState({
    farmers: 0,
    collections: 0,
    shifts: 0,
    payments: 0,
    queuedTasks: 0
  });
  const [queuedItems, setQueuedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [networkState, setNetworkState] = useState(offlineService.isOnline);
  const [isSyncing, setIsSyncing] = useState(false);

  const triggerWebBackupRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (event: any) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const toastId = toast.loading('Reading and importing backup JSON file...');
      try {
        const reader = new FileReader();
        reader.onload = async (e: any) => {
          try {
            const content = e.target.result;
            const success = await realmInstance.restoreBackupFromJSON(content);
            if (success) {
              await fetchDbStats();
              toast.success('Database restored successfully from local file backup!', { id: toastId });
            } else {
              toast.error('Failed to parse the backup JSON file.', { id: toastId });
            }
          } catch (err: any) {
            toast.error(`Restore error: ${err.message || String(err)}`, { id: toastId });
          }
        };
        reader.readAsText(file);
      } catch (err: any) {
        toast.error(`Failed to read backup file: ${err.message || String(err)}`, { id: toastId });
      }
    };
    input.click();
  };

  const fetchDbStats = async () => {
    try {
      setLoading(true);
      const farmersRes = await db.farmers.allDocs();
      const collectionsRes = await db.collections.allDocs();
      const shiftsRes = await db.shifts.allDocs();
      const paymentsRes = await db.payments.allDocs();
      const queueRes = await db.syncQueue.allDocs();

      setDbStats({
        farmers: farmersRes.rows.length,
        collections: collectionsRes.rows.length,
        shifts: shiftsRes.rows.length,
        payments: paymentsRes.rows.length,
        queuedTasks: queueRes.rows.length
      });

      setQueuedItems(queueRes.rows.map(r => r.doc));
    } catch (err) {
      console.error('Failed to query local database metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDbStats();
    
    // Check network state periodically
    const interval = setInterval(() => {
      setNetworkState(offlineService.isOnline);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleProcessSync = async () => {
    if (!offlineService.isOnline) {
      toast.error('Cannot sync: Device is currently ofline. Connect to internet and try again.');
      return;
    }
    
    setIsSyncing(true);
    toast.loading('Processing pending sync tasks...', { id: 'sync-progress' });
    try {
      await offlineService.processSyncQueue();
      await fetchDbStats();
      toast.success('Sync queue processed successfully', { id: 'sync-progress' });
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
    toast.loading('Downloading fresh database schemas from server...', { id: 'resync-progress' });
    try {
      await offlineService.syncFromServer();
      await fetchDbStats();
      toast.success('Localized database is completely up to date with server!', { id: 'resync-progress' });
    } catch (e: any) {
      toast.error(`Download sync failed: ${e.message || String(e)}`, { id: 'resync-progress' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Help, About & Diagnostics</h1>
          <p className="text-stone-500 dark:text-stone-400">View app version, check support, and manage local native storage</p>
        </div>

        {/* Tab Switching controls */}
        <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-2xl border border-stone-200/50 dark:border-stone-700/50 self-start">
          <button
            onClick={() => setActiveTab('support')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
              activeTab === 'support' 
                ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm" 
                : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
            )}
          >
            <HelpCircle size={16} />
            Support & FAQs
          </button>
          <button
            onClick={() => {
              setActiveTab('diagnostics');
              fetchDbStats();
            }}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
              activeTab === 'diagnostics' 
                ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm" 
                : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
            )}
          >
            <Database size={16} />
            Version & Diagnostics
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
                  <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">DugdhaSetu Enterprise</h2>
                  <p className="text-sm text-stone-500 dark:text-stone-400">Capacitor Android Support Edition</p>
                </div>
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                DugdhaSetu is a modern, high-precision, and offline-first milk collection unit management application designed specifically for rural societies. Running natively on Android via Capacitor, it includes SQLite emulation via Dexie schemas, allowing operators to fully process collections with absolute local reliability without continuous internet access.
              </p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-800">
                  <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">License Type</p>
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-200 mt-1">Enterprise AMCU Edition</p>
                </div>
                <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-800">
                  <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Storage Support</p>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-1">IndexedDB / SQLite</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Frequently Asked Questions</h2>
              <div className="space-y-4">
                {[
                  { q: 'How does offline mode function in Android?', a: 'DugdhaSetu contains a localized Realm/SQLite emulation database in Android. When you do not have internet, entries are stored safely in your phone\'s internal storage and will auto-sync with the society server as soon as the internet goes online.' },
                  { q: 'Can a farmer pour milk twice in a shift?', a: 'No. To maintain complete transparency and prevent duplicate entries, the system restricts each single farmer code to exactly one pour transaction per shift (Morning / Evening).' },
                  { q: 'How are the rates calculated?', a: 'Rates are dynamically looked up from the stored active Rate Chart matching the FAT, SNF, and cattle milk type of the individual cow/buffalo selection.' },
                ].map((faq, i) => (
                  <div key={i} className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-100 dark:border-stone-800">
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-200">{faq.q}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">Support Contact</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                  <Mail className="text-stone-400" size={18} />
                  <span className="text-sm text-stone-600 dark:text-stone-300">support@dugdhasetu.com</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                  <MessageCircle className="text-stone-400" size={18} />
                  <span className="text-sm text-stone-600 dark:text-stone-300">+91 99887 76655</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                  <Globe className="text-stone-400" size={18} />
                  <span className="text-sm text-stone-600 dark:text-stone-300">www.dugdhasetu.com</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">System Manuals</h2>
              <div className="space-y-2">
                <button className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                  <BookOpen size={18} />
                  Amcu User Manual (v{APP_VERSION.split('.').slice(0, 2).join('.')})
                </button>
                <button className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                  <Info size={18} />
                  AMCU Printer Integration Guide
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* The main specialized VERSION VIEW & DIAGNOSTICS screen */
        <div className="space-y-8 animate-fade-in">
          {/* Version banner */}
          <div className="bg-white dark:bg-stone-900 p-6 md:p-8 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-16 h-16 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-3xl flex items-center justify-center shrink-0">
              <Smartphone className="text-stone-900 dark:text-white" size={28} />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-serif font-medium text-stone-900 dark:text-white">v{APP_VERSION} - Stable Native Release</h3>
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 rounded-full border border-orange-200/50 dark:border-orange-900/35">
                  Offline Enabled
                </span>
              </div>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Optimized for Android APK installation via Capacitor with local database engine & automatic fallback sync system. Built fully transparent: Google tracking and Firebase have been fully removed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Native Database status cards */}
            <div className="lg:col-span-2 space-y-8">
              {/* Table counts grid */}
              <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
                    <Database size={18} className="text-blue-500" />
                    Local Database Storage Metrics
                  </h3>
                  <button 
                    onClick={fetchDbStats}
                    disabled={loading}
                    className="p-1 px-3 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-xs font-semibold text-stone-500 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} className={cn(loading && "animate-spin")} />
                    Refresh
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-100/50 dark:border-stone-800 leading-normal">
                    <span className="text-[10px] font-medium text-stone-400 uppercase tracking-widest block">Farmers</span>
                    <span className="text-2xl font-semibold text-stone-900 dark:text-white mt-1 block">{loading ? '...' : dbStats.farmers}</span>
                  </div>
                  <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-100/50 dark:border-stone-800 leading-normal">
                    <span className="text-[10px] font-medium text-stone-400 uppercase tracking-widest block">Collections</span>
                    <span className="text-2xl font-semibold text-stone-900 dark:text-white mt-1 block">{loading ? '...' : dbStats.collections}</span>
                  </div>
                  <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-100/50 dark:border-stone-800 leading-normal">
                    <span className="text-[10px] font-medium text-stone-400 uppercase tracking-widest block">Shifts</span>
                    <span className="text-2xl font-semibold text-stone-900 dark:text-white mt-1 block">{loading ? '...' : dbStats.shifts}</span>
                  </div>
                  <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-100/50 dark:border-stone-800 leading-normal">
                    <span className="text-[10px] font-medium text-stone-400 uppercase tracking-widest block">Payments</span>
                    <span className="text-2xl font-semibold text-stone-900 dark:text-white mt-1 block">{loading ? '...' : dbStats.payments}</span>
                  </div>
                </div>

                <p className="text-xs text-stone-500 dark:text-stone-400 leading-normal bg-stone-50 dark:bg-stone-800/30 p-3 rounded-xl border border-stone-200/20 dark:border-stone-800">
                  <strong>Hardware SQLite Emulation layer:</strong> Running IndexedDB via custom Dexie definitions to emulate the storage schema. It stores data on local phone memory directly under mobile context for offline preservation.
                </p>
              </div>

              {/* Sync queue panel */}
              <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
                    <Cpu size={18} className="text-amber-500" />
                    Outgoing Sync Queue
                  </h3>
                  <span className="px-2.5 py-1 text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl">
                    {dbStats.queuedTasks} Pending Outbox Tasks
                  </span>
                </div>

                {queuedItems.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-stone-100 dark:border-stone-800 rounded-2xl text-center space-y-2">
                    <CheckCircle className="text-stone-300 dark:text-stone-600 mx-auto" size={28} />
                    <p className="text-sm font-medium text-stone-900 dark:text-white">All local transactions are synchronized!</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500">Every change on your device is fully published to the society cloud.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                      {queuedItems.map((task, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-100 dark:border-stone-800">
                          <div className="space-y-1">
                            <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-50 dark:bg-amber-950/30 p-1 px-2 rounded">
                              {task.type}
                            </span>
                            <span className="text-[10px] text-stone-400 block pl-1">
                              {new Date(task.timestamp).toLocaleTimeString()} - {new Date(task.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-stone-400 dark:text-stone-500 max-w-[200px] truncate">
                            ID: {task._id}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Platform info, network status, control triggers */}
            <div className="space-y-6">
              {/* Network Status Widget */}
              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
                <h3 className="text-sm font-serif font-medium text-stone-400 uppercase tracking-widest pl-1">Capacitor Network</h3>
                <div className={cn(
                  "p-4 rounded-2xl border flex items-center gap-4",
                  networkState 
                    ? "bg-emerald-50/50 border-emerald-200/50 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300" 
                    : "bg-amber-50/50 border-amber-200/50 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300"
                )}>
                  {networkState ? (
                    <>
                      <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shrink-0 animate-pulse">
                        <Wifi size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-sm">Society Cloud Connected</p>
                        <p className="text-xs opacity-80 mt-0.5">Device is online, queue and server syncing is live.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shrink-0">
                        <WifiOff size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-sm">Offline Storage Engaged</p>
                        <p className="text-xs opacity-80 mt-0.5">Transactions are enqueued locally in your phone storage.</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Native Device Storage Backup/Restore widgets */}
              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
                <h3 className="text-sm font-serif font-medium text-stone-400 uppercase tracking-widest pl-1">Local Device File Storage</h3>
                <p className="text-xs text-stone-500 leading-relaxed pl-1">
                  Ensure permanent preservation of collections data by backing up or restoring from your phone's physical files.
                </p>

                {/* File paths & structures listing like WhatsApp */}
                <div className="bg-stone-50 dark:bg-stone-800/40 p-4 rounded-2xl border border-stone-100 dark:border-stone-800 space-y-3">
                  <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest block pl-1">
                    Exported Device Folders (documents root)
                  </span>
                  <div className="space-y-3 text-xs text-stone-600 dark:text-stone-300">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-[11px] text-stone-700 dark:text-stone-200">📁 JSON Database Backup (Safe Recovery File):</span>
                      <code className="font-mono text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 p-2 rounded select-all break-all leading-normal">
                        DugdhaSetu_AMCU/Backups/database_backup.json
                      </code>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-[11px] text-stone-700 dark:text-stone-200">📊 Milk Collections Spreadsheet (Excel Ready):</span>
                      <code className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded select-all break-all leading-normal">
                        DugdhaSetu_AMCU/Reports/collections_record.csv
                      </code>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-[11px] text-stone-700 dark:text-stone-200">👤 Registered Farmers List (Excel Ready):</span>
                      <code className="font-mono text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 p-2 rounded select-all break-all leading-normal">
                        DugdhaSetu_AMCU/Reports/farmers_register.csv
                      </code>
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-400 dark:text-stone-500 pl-1 leading-relaxed">
                    💡 <strong>How to view:</strong> Open your phone's default File Manager app (Google Files, Samsung My Files), tap on <strong>Documents</strong>, and look for the folder named <strong>DugdhaSetu_AMCU</strong>. You can open any of these <code>.csv</code> spreadsheet reports directly inside Excel, WPS Office, or share them over WhatsApp!
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      const id = toast.loading('Creating physical database backup and generating CSV reports...');
                      try {
                        await realmInstance.saveBackupToFilesystem();
                        toast.success('Successfully backed up database and generated CSV spreadsheets in phone storage!', { id });
                      } catch (err: any) {
                        toast.error(`Backup failed: ${err.message || String(err)}`, { id });
                      }
                    }}
                    className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                  >
                    <CheckCircle size={14} />
                    Backup To Files
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm('Warning: Restoring will overwrite existing IndexedDB tables with the duplicate files. Continue?')) {
                        const { Capacitor } = await import('@capacitor/core');
                        if (!Capacitor.isNativePlatform()) {
                          triggerWebBackupRestore();
                          return;
                        }

                        const id = toast.loading('Restoring database from physical file...');
                        try {
                          const restored = await realmInstance.loadBackupFromFilesystem();
                          if (restored) {
                            await fetchDbStats();
                            toast.success('Database successfully restored from device file storage!', { id });
                          } else {
                            toast.error('No backup file found or restore was empty.', { id });
                          }
                        } catch (err: any) {
                          toast.error(`Restore failed: ${err.message || String(err)}`, { id });
                        }
                      }
                    }}
                    className="py-3 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                  >
                    <Database size={14} />
                    Restore From Files
                  </button>
                </div>
              </div>

              {/* Version & Build info parameters */}
              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
                <h3 className="text-sm font-serif font-medium text-stone-400 uppercase tracking-widest pl-1">Build Parameters</h3>
                <div className="space-y-3 pl-1">
                  <div className="flex justify-between text-xs border-b border-stone-100 dark:border-stone-800/80 pb-2">
                    <span className="text-stone-400">Target APK SDK</span>
                    <span className="font-medium text-stone-700 dark:text-stone-300">Android API 34</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-stone-100 dark:border-stone-800/80 pb-2">
                    <span className="text-stone-400">Google Services</span>
                    <span className="font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-1.5 rounded">Purged</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-stone-100 dark:border-stone-800/80 pb-2">
                    <span className="text-stone-400">Firebase Backend</span>
                    <span className="font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-1.5 rounded">Deactivated</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-stone-100 dark:border-stone-800/80 pb-2">
                    <span className="text-stone-400">Network Fallback</span>
                    <span className="font-medium text-stone-700 dark:text-stone-300">Enabled</span>
                  </div>
                  <div className="flex justify-between text-xs pb-1">
                    <span className="text-stone-400">Vite Config Mode</span>
                    <span className="font-mono font-medium text-stone-700 dark:text-stone-300">Production</span>
                  </div>
                </div>
              </div>

              {/* Action sync triggers */}
              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
                <h3 className="text-sm font-serif font-medium text-stone-900 dark:text-white pl-1">Manual Action Center</h3>
                <div className="space-y-2">
                  <button
                    onClick={handleProcessSync}
                    disabled={isSyncing || dbStats.queuedTasks === 0}
                    className="w-full py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 disabled:opacity-50 hover:bg-stone-800 dark:hover:bg-stone-100 font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Play size={14} />
                    Process Outbox Task Queue
                  </button>
                  <button
                    onClick={handleForceReSync}
                    disabled={isSyncing}
                    className="w-full py-3 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 disabled:opacity-50 font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
                    Download Core Master Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
