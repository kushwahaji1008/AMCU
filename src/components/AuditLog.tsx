import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Search,
  FileText,
  Clock,
  Smartphone,
  Monitor,
  Tablet,
  Globe,
  Activity,
  History,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { adminApi, smsLogApi } from '../services/api';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

interface AuditLogEntry {
  id: string;
  userId: string;
  username: string;
  role: string;
  loginAt: string;
  ipAddress?: string;
  userAgent?: string;
  device?: {
    browser?: string;
    os?: string;
    deviceType?: string;
    model?: string;
  };
  status: 'success' | 'failure';
  failureReason?: string;
}

interface ActivityLogEntry {
  id: string;
  logId?: string;
  userId: string;
  username: string;
  userRole?: string;
  action: string;
  targetId?: string;
  targetType?: string;
  beforeValue?: any;
  afterValue?: any;
  details?: any;
  operationStatus?: 'success' | 'failure' | 'conflict' | 'queued';
  errorDetails?: string;
  ipAddress?: string;
  device?: {
    platform?: string;
    browser?: string;
    os?: string;
    deviceType?: string;
    model?: string;
  };
  appVersion?: string;
  syncStatus?: 'online' | 'queued_offline' | 'synced_from_offline' | 'failed';
  correlationId?: string;
  source?: string;
  timestamp: string;
}

interface SmsLogItem {
  id: string;
  idempotencyKey: string;
  recipientType: string;
  recipientName?: string;
  phone: string;
  triggerType: string;
  deliveryChannel: string;
  status: string;
  attempts: number;
  errorMessage?: string;
  createdAt: string;
}

export default function AuditLog() {
  const { profile, loading: authLoading, isAuthReady } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'activity' | 'sms'>('login');
  const [loginLogs, setLoginLogs] = useState<AuditLogEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [syncFilter, setSyncFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedActivity, setSelectedActivity] = useState<ActivityLogEntry | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!isAuthReady || profile?.role !== 'super_admin') return;
    try {
      setLoading(true);
      if (activeTab === 'sms') {
        const res = await smsLogApi.getLogs({
          status: statusFilter || undefined,
          limit: 150,
        });
        const items = Array.isArray(res.data) ? res.data : [];
        const filtered = searchQuery
          ? items.filter(
              (s: SmsLogItem) =>
                s.phone.includes(searchQuery) ||
                (s.recipientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.triggerType || '').toLowerCase().includes(searchQuery.toLowerCase())
            )
          : items;
        setSmsLogs(filtered);
        setTotalCount(filtered.length);
        setTotalPages(1);
        return;
      }

      const params = {
        search: searchQuery || undefined,
        status: statusFilter || undefined,
        syncStatus: activeTab === 'activity' ? syncFilter || undefined : undefined,
        action: activeTab === 'activity' ? actionFilter || undefined : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: 25,
        paginated: true,
      };

      if (activeTab === 'login') {
        const res = await adminApi.getLoginLogs(params);
        if (res.data && Array.isArray(res.data.items)) {
          setLoginLogs(res.data.items);
          setTotalCount(res.data.total ?? res.data.items.length);
          setTotalPages(res.data.totalPages ?? 1);
        } else {
          const items = Array.isArray(res.data) ? res.data : [];
          setLoginLogs(items);
          setTotalCount(items.length);
          setTotalPages(1);
        }
      } else {
        const res = await adminApi.getActivityLogs(params);
        if (res.data && Array.isArray(res.data.items)) {
          setActivityLogs(res.data.items);
          setTotalCount(res.data.total ?? res.data.items.length);
          setTotalPages(res.data.totalPages ?? 1);
        } else {
          const items = Array.isArray(res.data) ? res.data : [];
          setActivityLogs(items);
          setTotalCount(items.length);
          setTotalPages(1);
        }
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to fetch audit registry');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [isAuthReady, profile?.role, activeTab, searchQuery, statusFilter, syncFilter, actionFilter, startDate, endDate, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (!isAuthReady || authLoading) return null;
  if (profile?.role !== 'super_admin') return <Navigate to="/" />;

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setSyncFilter('');
    setActionFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const getDeviceIcon = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'mobile':
        return <Smartphone size={16} />;
      case 'tablet':
        return <Tablet size={16} />;
      default:
        return <Monitor size={16} />;
    }
  };

  const currentItems = activeTab === 'login' ? loginLogs : activeTab === 'activity' ? activityLogs : smsLogs;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white flex items-center gap-3">
            <Shield className="text-stone-400" size={32} />
            System Audit Center
          </h1>
          <p className="text-stone-500 dark:text-stone-400">
            Superadmin immutable security monitoring, offline sync audits &amp; SMS telemetry
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-xl font-medium text-stone-900 dark:text-white hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors shadow-sm"
        >
          <RefreshCw size={18} className={cn(loading && 'animate-spin')} />
          Refresh Registry
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-stone-900 p-2 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <button
              onClick={() => {
                setActiveTab('login');
                setPage(1);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                activeTab === 'login'
                  ? 'bg-stone-900 text-white dark:bg-white dark:text-black shadow-md'
                  : 'text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800'
              )}
            >
              <History size={18} />
              Login Registry
            </button>
            <button
              onClick={() => {
                setActiveTab('activity');
                setPage(1);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium mt-1 transition-all',
                activeTab === 'activity'
                  ? 'bg-stone-900 text-white dark:bg-white dark:text-black shadow-md'
                  : 'text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800'
              )}
            >
              <Activity size={18} />
              Operational Logs
            </button>
            <button
              onClick={() => {
                setActiveTab('sms');
                setPage(1);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium mt-1 transition-all',
                activeTab === 'sms'
                  ? 'bg-stone-900 text-white dark:bg-white dark:text-black shadow-md'
                  : 'text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800'
              )}
            >
              <MessageSquare size={18} />
              SMS Delivery Logs
            </button>
          </div>

          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Registry Filter</h2>
              <button
                onClick={resetFilters}
                className="text-xs font-semibold text-stone-400 hover:text-stone-900 dark:hover:text-white"
              >
                Reset
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={16} />
              <input
                type="text"
                placeholder={
                  activeTab === 'sms' ? 'Phone, Recipient, Trigger...' : 'User, Action, Log ID...'
                }
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-xs dark:text-white"
              >
                <option value="">All Statuses</option>
                {activeTab === 'login' ? (
                  <>
                    <option value="success">Success</option>
                    <option value="failure">Failure</option>
                  </>
                ) : activeTab === 'activity' ? (
                  <>
                    <option value="success">Success</option>
                    <option value="failure">Failure</option>
                    <option value="conflict">Conflict</option>
                    <option value="queued">Queued</option>
                  </>
                ) : (
                  <>
                    <option value="queued">Queued</option>
                    <option value="submitted">Submitted</option>
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="simulated">Simulated</option>
                  </>
                )}
              </select>
            </div>

            {activeTab === 'activity' && (
              <>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                    Sync Origin
                  </label>
                  <select
                    value={syncFilter}
                    onChange={(e) => {
                      setSyncFilter(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-xs dark:text-white"
                  >
                    <option value="">All Origins</option>
                    <option value="online">Online Direct</option>
                    <option value="synced_from_offline">Synced from Offline APK</option>
                    <option value="queued_offline">Queued Offline</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                    Action Prefix
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. POST_COLLECTIONS, SYNC_CONFLICT"
                    value={actionFilter}
                    onChange={(e) => {
                      setActionFilter(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-xs dark:text-white"
                  />
                </div>
              </>
            )}

            {activeTab !== 'sms' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-2 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-lg text-xs dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                    To
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-2 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-lg text-xs dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center bg-stone-50/30 dark:bg-stone-800/10">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
                {activeTab === 'login'
                  ? 'Security Authentication Registry'
                  : activeTab === 'activity'
                  ? 'Operational Activity Stream'
                  : 'SMS Delivery Telemetry'}
              </h2>
              <span className="text-xs font-mono font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                {loading ? 'SYNCING...' : `${totalCount} EVENTS`}
              </span>
            </div>

            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {loading ? (
                <div className="p-12 text-center text-stone-400 dark:text-stone-500 italic text-sm flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-900 dark:border-stone-700 dark:border-t-white rounded-full animate-spin" />
                  Synchronizing with Registry...
                </div>
              ) : currentItems.length > 0 ? (
                activeTab === 'sms' ? (
                  smsLogs.map((sms) => (
                    <div key={sms.id} className="p-5 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-stone-900 dark:text-white">
                              {sms.recipientName || sms.phone}
                            </span>
                            <span className="text-xs font-mono text-stone-500">{sms.phone}</span>
                            <span
                              className={cn(
                                'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase',
                                sms.status === 'delivered' || sms.status === 'sent'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                  : sms.status === 'failed'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                              )}
                            >
                              {sms.status}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-500 rounded-full font-mono uppercase">
                              {sms.deliveryChannel}
                            </span>
                          </div>
                          <div className="text-xs text-stone-500 flex flex-wrap gap-4">
                            <span>Trigger: {sms.triggerType}</span>
                            <span>Attempts: {sms.attempts}</span>
                            <span>{new Date(sms.createdAt).toLocaleString()}</span>
                          </div>
                          {sms.errorMessage && (
                            <p className="text-xs text-red-500 font-medium">{sms.errorMessage}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  (currentItems as any[]).map((log) => (
                    <div key={log.id} className="p-6 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div
                            className={cn(
                              'p-2 rounded-xl shrink-0',
                              activeTab === 'login'
                                ? log.status === 'success'
                                  ? 'bg-green-50 dark:bg-green-900/20 text-green-600'
                                  : 'bg-red-50 dark:bg-red-900/20 text-red-600'
                                : log.operationStatus === 'failure'
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600'
                                : log.operationStatus === 'conflict'
                                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600'
                                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                            )}
                          >
                            {activeTab === 'login' ? (
                              log.status === 'success' ? (
                                <CheckCircle2 size={20} />
                              ) : (
                                <AlertCircle size={20} />
                              )
                            ) : (
                              <Activity size={20} />
                            )}
                          </div>
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-stone-900 dark:text-white">{log.username}</span>
                              {log.userRole && (
                                <span className="text-[10px] px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-500 rounded-full font-mono uppercase">
                                  {log.userRole}
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-full font-mono uppercase tracking-wider">
                                {activeTab === 'login' ? log.role : log.action}
                              </span>
                              {log.syncStatus && log.syncStatus !== 'online' && (
                                <span className="text-[10px] px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-bold uppercase">
                                  {log.syncStatus}
                                </span>
                              )}
                              {log.operationStatus && log.operationStatus !== 'success' && (
                                <span className="text-[10px] px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full font-bold uppercase">
                                  {log.operationStatus}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-stone-500 dark:text-stone-400">
                              <div className="flex items-center gap-1">
                                <Clock size={14} />
                                {new Date(activeTab === 'login' ? log.loginAt : log.timestamp).toLocaleString()}
                              </div>
                              {log.ipAddress && (
                                <div className="flex items-center gap-1">
                                  <Globe size={14} />
                                  {log.ipAddress}
                                </div>
                              )}
                              {log.device && (
                                <div className="flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300">
                                  {getDeviceIcon(log.device.deviceType)}
                                  <span className="text-stone-900 dark:text-white">
                                    {log.device.model ||
                                      `${log.device.platform || log.device.os || 'Client'}${
                                        log.device.browser ? ` (${log.device.browser})` : ''
                                      }`}
                                  </span>
                                </div>
                              )}
                              {activeTab === 'activity' && log.targetType && (
                                <div className="flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300">
                                  <FileText size={14} />
                                  Resource:{' '}
                                  <span className="text-stone-900 dark:text-white uppercase">{log.targetType}</span>
                                </div>
                              )}
                            </div>

                            {log.failureReason && (
                              <p className="text-xs text-red-500 mt-1 font-medium bg-red-50 dark:bg-red-900/10 p-2 rounded-lg border border-red-100 dark:border-red-900/20">
                                EXCEPTION: {log.failureReason}
                              </p>
                            )}
                            {log.errorDetails && (
                              <p className="text-xs text-red-500 mt-1 font-medium bg-red-50 dark:bg-red-900/10 p-2 rounded-lg border border-red-100 dark:border-red-900/20">
                                ERROR: {log.errorDetails}
                              </p>
                            )}
                          </div>
                        </div>

                        {activeTab === 'activity' && (
                          <button
                            onClick={() => setSelectedActivity(log)}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200"
                          >
                            <Eye size={14} />
                            Inspect
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : (
                <div className="p-12 text-center text-stone-400 dark:text-stone-500 italic text-sm">
                  Registry is empty for this criteria
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between bg-stone-50/40 dark:bg-stone-800/20">
                <span className="text-xs text-stone-500">
                  Page {page} of {totalPages} ({totalCount} total events)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-2 rounded-lg border border-stone-200 dark:border-stone-700 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-2 rounded-lg border border-stone-200 dark:border-stone-700 disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Superadmin Audit Inspection Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-lg text-stone-900 dark:text-white">
                  Audit Event Inspection
                </h3>
                <p className="text-xs font-mono text-stone-400">{selectedActivity.logId || selectedActivity.id}</p>
              </div>
              <button
                onClick={() => setSelectedActivity(null)}
                className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <span className="text-stone-400 block uppercase text-[10px] font-bold">Actor</span>
                  <span className="font-semibold text-stone-900 dark:text-white">
                    {selectedActivity.username} ({selectedActivity.userRole || 'unknown'})
                  </span>
                </div>
                <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <span className="text-stone-400 block uppercase text-[10px] font-bold">Action</span>
                  <span className="font-mono font-semibold text-stone-900 dark:text-white">
                    {selectedActivity.action}
                  </span>
                </div>
                <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <span className="text-stone-400 block uppercase text-[10px] font-bold">Sync / Source</span>
                  <span className="font-semibold text-stone-900 dark:text-white">
                    {selectedActivity.syncStatus || 'online'} / {selectedActivity.source || 'server'}
                  </span>
                </div>
                <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <span className="text-stone-400 block uppercase text-[10px] font-bold">Correlation ID</span>
                  <span className="font-mono text-stone-700 dark:text-stone-300 break-all">
                    {selectedActivity.correlationId || '-'}
                  </span>
                </div>
                <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <span className="text-stone-400 block uppercase text-[10px] font-bold">App Version</span>
                  <span className="font-mono text-stone-700 dark:text-stone-300">
                    {selectedActivity.appVersion || '-'}
                  </span>
                </div>
                <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <span className="text-stone-400 block uppercase text-[10px] font-bold">Timestamp</span>
                  <span className="text-stone-700 dark:text-stone-300">
                    {new Date(selectedActivity.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {selectedActivity.errorDetails && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl text-red-700 dark:text-red-300">
                  <strong className="block mb-1 uppercase text-[10px]">Error Details</strong>
                  <pre className="whitespace-pre-wrap font-mono">{selectedActivity.errorDetails}</pre>
                </div>
              )}

              {(selectedActivity.beforeValue !== undefined || selectedActivity.afterValue !== undefined) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                    <strong className="block mb-2 text-stone-500 uppercase text-[10px]">Before Value</strong>
                    <pre className="font-mono text-[11px] overflow-x-auto max-h-48 text-stone-700 dark:text-stone-300">
                      {JSON.stringify(selectedActivity.beforeValue ?? null, null, 2)}
                    </pre>
                  </div>
                  <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                    <strong className="block mb-2 text-stone-500 uppercase text-[10px]">After Value</strong>
                    <pre className="font-mono text-[11px] overflow-x-auto max-h-48 text-stone-700 dark:text-stone-300">
                      {JSON.stringify(selectedActivity.afterValue ?? null, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedActivity.details && (
                <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <strong className="block mb-2 text-stone-500 uppercase text-[10px]">Sanitized Details</strong>
                  <pre className="font-mono text-[11px] overflow-x-auto max-h-48 text-stone-700 dark:text-stone-300">
                    {JSON.stringify(selectedActivity.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
