import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Camera, MessageSquare, Database, MapPin, RefreshCw,
  HardDrive, Cpu, ShieldCheck, Bluetooth, Wifi, WifiOff
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { SmsSender } from 'capacitor-sms-sender';
import { toast } from 'sonner';
import { useLanguage } from '../LanguageContext';
import { db } from '../services/offlineService';
import { isNativeApp } from '../services/platform';

interface PermissionItem {
  id: string;
  name: string;
  purpose: string;
  status: 'Granted' | 'Denied' | 'Prompt' | 'Web Mode' | 'Unsupported';
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}

export default function MobileApp() {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const [networkState, setNetworkState] = useState<{ connected: boolean; type: string }>({
    connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
    type: typeof navigator !== 'undefined' && navigator.onLine ? 'unknown' : 'none',
  });

  const [deviceSpecs, setDeviceSpecs] = useState({
    deviceModel: typeof navigator !== 'undefined' ? navigator.platform || 'Client Device' : 'Client Device',
    hostPlatform: isNativeApp() ? `Capacitor Native (${Capacitor.getPlatform()})` : `Web Browser (${Capacitor.getPlatform()})`,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    appVersion: `v${APP_VERSION}`,
    storageEstimate: 'Checking...',
    hardwareSummary: 'Checking...',
  });

  const [dbInfo, setDbInfo] = useState({
    indexingEngine: 'Dexie / IndexedDB (Offline Store)',
    farmersCached: 0,
    collectionsCached: 0,
    pendingSyncTasks: 0,
    integrity: 'Checking...',
  });

  const [permissions, setPermissions] = useState<PermissionItem[]>([
    {
      id: 'camera',
      name: 'Camera Access',
      purpose: 'Required for scanning Farmer ID QR codes and barcodes.',
      status: 'Prompt',
      icon: Camera,
      color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30',
    },
    {
      id: 'sms',
      name: 'Direct SMS SIM Access',
      purpose: 'Enables direct SMS delivery from native Android devices when enabled.',
      status: isNativeApp() ? 'Prompt' : 'Web Mode',
      icon: MessageSquare,
      color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30',
    },
    {
      id: 'storage',
      name: 'Local Storage & File Export',
      purpose: 'Used to persist IndexedDB cache and write CSV/PDF reports and backups.',
      status: 'Granted',
      icon: HardDrive,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      id: 'location',
      name: 'Location Services',
      purpose: 'Optional route tracking for mobile collection points.',
      status: 'Prompt',
      icon: MapPin,
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
    },
    {
      id: 'bluetooth',
      name: 'Bluetooth / Serial Pairing',
      purpose: 'Connects supported scales, analyzers, and receipt printers.',
      status: typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'Prompt' : 'Unsupported',
      icon: Bluetooth,
      color: 'text-sky-500 bg-sky-50 dark:bg-sky-950/30',
    },
  ]);

  const runDiagnostics = useCallback(async (showToast = false) => {
    setChecking(true);
    if (showToast) {
      toast.loading('Running client system diagnostics...', { id: 'hw-scan' });
    }

    try {
      // 1. Network status
      try {
        const net = await Network.getStatus();
        setNetworkState({ connected: net.connected, type: net.connectionType });
      } catch {
        setNetworkState({
          connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
          type: typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
        });
      }

      // 2. Storage & Hardware capabilities
      let storageLabel = 'Available';
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const usedMb = ((est.usage || 0) / (1024 * 1024)).toFixed(2);
          const quotaMb = est.quota ? `${Math.round(est.quota / (1024 * 1024))} MB` : 'N/A';
          storageLabel = `${usedMb} MB used / ${quotaMb} quota`;
        } catch {
          storageLabel = 'IndexedDB Active';
        }
      }

      const memGb = typeof navigator !== 'undefined' && (navigator as any).deviceMemory
        ? `${(navigator as any).deviceMemory} GB RAM`
        : 'RAM N/A';
      const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? `${navigator.hardwareConcurrency} CPU Threads`
        : 'CPU N/A';

      setDeviceSpecs({
        deviceModel: typeof navigator !== 'undefined' ? navigator.platform || 'Client Device' : 'Client Device',
        hostPlatform: isNativeApp() ? `Capacitor Native (${Capacitor.getPlatform()})` : `Web Browser (${Capacitor.getPlatform()})`,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        appVersion: `v${APP_VERSION}`,
        storageEstimate: storageLabel,
        hardwareSummary: `${cores} • ${memGb}`,
      });

      // 3. Offline DB metrics
      try {
        const [farmersDocs, collectionsDocs, queueDocs] = await Promise.all([
          db.farmers.allDocs(),
          db.collections.allDocs(),
          db.syncQueue.allDocs(),
        ]);
        setDbInfo({
          indexingEngine: isNativeApp() ? 'Dexie / IndexedDB + Filesystem Backup' : 'Dexie / IndexedDB (Browser)',
          farmersCached: farmersDocs.rows.length,
          collectionsCached: collectionsDocs.rows.length,
          pendingSyncTasks: queueDocs.rows.length,
          integrity: 'Verified',
        });
      } catch {
        setDbInfo(prev => ({ ...prev, integrity: 'Unavailable' }));
      }

      // 4. Real Permission Queries
      let smsStatus: PermissionItem['status'] = isNativeApp() ? 'Prompt' : 'Web Mode';
      if (isNativeApp()) {
        try {
          const perm = await SmsSender.checkPermissions();
          smsStatus = perm.send_sms === 'granted' ? 'Granted' : perm.send_sms === 'denied' ? 'Denied' : 'Prompt';
        } catch {
          smsStatus = 'Prompt';
        }
      }

      const queryWebPerm = async (name: PermissionName): Promise<PermissionItem['status']> => {
        if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'Prompt';
        try {
          const res = await navigator.permissions.query({ name });
          if (res.state === 'granted') return 'Granted';
          if (res.state === 'denied') return 'Denied';
          return 'Prompt';
        } catch {
          return 'Prompt';
        }
      };

      const [camStatus, locStatus] = await Promise.all([
        queryWebPerm('camera' as PermissionName),
        queryWebPerm('geolocation'),
      ]);

      setPermissions(prev =>
        prev.map(p => {
          if (p.id === 'sms') return { ...p, status: smsStatus };
          if (p.id === 'camera') return { ...p, status: camStatus };
          if (p.id === 'location') return { ...p, status: locStatus };
          if (p.id === 'bluetooth') {
            return {
              ...p,
              status: typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'Prompt' : 'Unsupported',
            };
          }
          return p;
        })
      );

      if (showToast) {
        toast.success('System diagnostics refreshed', { id: 'hw-scan' });
      }
    } catch (err) {
      if (showToast) {
        toast.error('Diagnostic check encountered an issue', { id: 'hw-scan' });
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostics(false);
  }, [runDiagnostics]);

  const handleRequestPermission = async (id: string) => {
    if (id === 'sms') {
      if (!isNativeApp()) {
        toast.info('Direct SIM SMS is only supported inside the native Android app.');
        return;
      }
      try {
        const res = await SmsSender.requestPermissions();
        const granted = res.send_sms === 'granted';
        setPermissions(prev => prev.map(p => (p.id === 'sms' ? { ...p, status: granted ? 'Granted' : 'Denied' } : p)));
        toast[granted ? 'success' : 'error'](granted ? 'SMS permission granted' : 'SMS permission denied');
      } catch {
        toast.error('Failed to request SMS permission');
      }
      return;
    }

    if (id === 'camera') {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Camera API not supported in this context');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setPermissions(prev => prev.map(p => (p.id === 'camera' ? { ...p, status: 'Granted' } : p)));
        toast.success('Camera permission granted');
      } catch {
        setPermissions(prev => prev.map(p => (p.id === 'camera' ? { ...p, status: 'Denied' } : p)));
        toast.error('Camera access denied');
      }
      return;
    }

    if (id === 'location') {
      if (!navigator.geolocation) {
        toast.error('Geolocation not supported');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermissions(prev => prev.map(p => (p.id === 'location' ? { ...p, status: 'Granted' } : p)));
          toast.success('Location permission granted');
        },
        () => {
          setPermissions(prev => prev.map(p => (p.id === 'location' ? { ...p, status: 'Denied' } : p)));
          toast.error('Location permission denied');
        }
      );
      return;
    }

    await runDiagnostics(true);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-2">
      {/* Device Overview Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-stone-900 p-8 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm leading-normal">
        <div className="flex gap-5 items-center">
          <div className="w-16 h-16 bg-stone-900 dark:bg-white rounded-[20px] flex items-center justify-center shrink-0">
            <Smartphone className="text-white dark:text-stone-900 w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">{t('androidSystem')}</h1>
            <p className="text-stone-500 dark:text-stone-400 mt-1">Client runtime diagnostics, offline store health, and device permissions</p>
          </div>
        </div>

        <button
          onClick={() => runDiagnostics(true)}
          disabled={checking}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-all shadow-sm active:scale-95 text-xs self-start md:self-auto disabled:opacity-50"
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
          Run System Diagnostic
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-[28px] border border-stone-100 dark:border-stone-800 shadow-sm space-y-4 leading-normal">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
              <Cpu size={18} className="text-stone-500" />
              Runtime Environment
            </h2>
            <div className="space-y-3 pt-2 text-xs divide-y divide-stone-50 dark:divide-stone-800/80">
              <div className="flex justify-between py-2 gap-2">
                <span className="text-stone-400 dark:text-stone-500">Host Platform</span>
                <span className="font-semibold text-stone-700 dark:text-stone-200 text-right">{deviceSpecs.hostPlatform}</span>
              </div>
              <div className="flex justify-between py-2 gap-2">
                <span className="text-stone-400 dark:text-stone-500">Device / OS ABI</span>
                <span className="font-mono text-stone-700 dark:text-stone-200 text-right">{deviceSpecs.deviceModel}</span>
              </div>
              <div className="flex justify-between py-2 gap-2">
                <span className="text-stone-400 dark:text-stone-500">Hardware</span>
                <span className="text-stone-700 dark:text-stone-300 text-right">{deviceSpecs.hardwareSummary}</span>
              </div>
              <div className="flex justify-between py-2 gap-2">
                <span className="text-stone-400 dark:text-stone-500">Storage Quota</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-right">{deviceSpecs.storageEstimate}</span>
              </div>
              <div className="flex justify-between py-2 gap-2">
                <span className="text-stone-400 dark:text-stone-500">Network</span>
                <span className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-200">
                  {networkState.connected ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-500" />}
                  {networkState.connected ? `Connected (${networkState.type})` : 'Offline'}
                </span>
              </div>
              <div className="flex justify-between py-2 gap-2">
                <span className="text-stone-400 dark:text-stone-500">Build Version</span>
                <span className="font-mono text-[11px] text-stone-600 dark:text-stone-300">{deviceSpecs.appVersion}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 p-6 rounded-[28px] border border-stone-100 dark:border-stone-800 shadow-sm space-y-4 leading-normal">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
              <Database size={18} className="text-blue-500" />
              Local Offline Store
            </h2>
            <div className="space-y-3 pt-2 text-xs divide-y divide-stone-50 dark:divide-stone-800/80">
              <div className="flex justify-between py-2">
                <span className="text-stone-400 dark:text-stone-500">Engine</span>
                <span className="text-stone-700 dark:text-stone-200 font-medium text-right">{dbInfo.indexingEngine}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-stone-400 dark:text-stone-500">Cached Farmers</span>
                <span className="text-stone-700 dark:text-stone-300 font-mono">{dbInfo.farmersCached}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-stone-400 dark:text-stone-500">Cached Collections</span>
                <span className="text-stone-700 dark:text-stone-300 font-mono">{dbInfo.collectionsCached}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-stone-400 dark:text-stone-500">Pending Sync Queue</span>
                <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{dbInfo.pendingSyncTasks}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-stone-400 dark:text-stone-500">Status</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{dbInfo.integrity}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-stone-900 p-8 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">System Permissions</h2>
                <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">Verify and request native or browser capabilities needed for dairy operations</p>
              </div>
              <ShieldCheck className="text-emerald-600 shrink-0" size={32} />
            </div>

            <div className="divide-y divide-stone-50 dark:divide-stone-800/80">
              {permissions.map((perm) => (
                <div key={perm.id} className="py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 leading-normal">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${perm.color}`}>
                      <perm.icon size={22} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{perm.name}</h3>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-md leading-relaxed">{perm.purpose}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 self-end sm:self-auto">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      perm.status === 'Granted'
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/40'
                        : perm.status === 'Denied' || perm.status === 'Unsupported'
                        ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200/50 dark:border-red-900/40'
                        : 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40'
                    }`}>
                      {perm.status}
                    </span>

                    <button
                      onClick={() => handleRequestPermission(perm.id)}
                      className="px-4 py-2 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold text-xs rounded-xl transition-all shadow-sm active:scale-95 leading-none"
                    >
                      {perm.id === 'sms' || perm.id === 'camera' || perm.id === 'location' ? 'Verify / Request' : 'Recheck'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 p-8 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm space-y-6 leading-normal">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
              <HardDrive size={18} className="text-emerald-600" />
              Native Export Directories (Android Documents)
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              When running the native Android app, backups and reports are written to the paths below:
            </p>
            <div className="space-y-4">
              <div className="p-4 bg-stone-50 dark:bg-stone-800/45 rounded-2xl border border-stone-100 dark:border-stone-800 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span className="text-xs font-bold text-stone-700 dark:text-stone-200">Database JSON Backup Directory:</span>
                </div>
                <code className="font-mono text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 p-2.5 rounded select-all break-all leading-relaxed">
                  Documents/DugdhaSetu_AMCU/Backups/database_backup.json
                </code>
              </div>

              <div className="p-4 bg-stone-50 dark:bg-stone-800/45 rounded-2xl border border-stone-100 dark:border-stone-800 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-xs font-bold text-stone-700 dark:text-stone-200">Reports Export Directory:</span>
                </div>
                <code className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 p-2.5 rounded select-all break-all leading-relaxed">
                  Documents/DugdhaSetu_AMCU/Reports/collections_record.csv
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
