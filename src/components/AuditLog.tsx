import React, { useState, useEffect } from 'react';
import { Shield, Search, FileText, Clock, Smartphone, Monitor, Tablet, MapPin, Globe, Activity, History, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { adminApi } from '../services/api';
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
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
  status: 'success' | 'failure';
  failureReason?: string;
}

interface ActivityLogEntry {
  id: string;
  userId: string;
  username: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: any;
  ipAddress?: string;
  timestamp: string;
}

export default function AuditLog() {
  const { profile, loading: authLoading, isAuthReady } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'activity'>('login');
  const [loginLogs, setLoginLogs] = useState<AuditLogEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isAuthReady && profile?.role === 'super_admin') {
      fetchAllLogs();
    }
  }, [isAuthReady, profile]);

  if (!isAuthReady || authLoading) return null;
  if (profile?.role !== 'super_admin') return <Navigate to="/" />;

  const fetchAllLogs = async () => {
    try {
      setLoading(true);
      const [loginRes, activityRes] = await Promise.all([
        adminApi.getLoginLogs(),
        adminApi.getActivityLogs()
      ]);
      setLoginLogs(Array.isArray(loginRes.data) ? loginRes.data : []);
      setActivityLogs(Array.isArray(activityRes.data) ? activityRes.data : []);
    } catch (error: any) {
      toast.error('Failed to fetch logs');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = activeTab === 'login' 
    ? loginLogs.filter(log => 
        (log.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.device?.model?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : activityLogs.filter(log =>
        (log.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.action || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.targetType || '').toLowerCase().includes(searchQuery.toLowerCase())
      );

  const getDeviceIcon = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'mobile': return <Smartphone size={16} />;
      case 'tablet': return <Tablet size={16} />;
      default: return <Monitor size={16} />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white flex items-center gap-3">
            <Shield className="text-stone-400" size={32} />
            System Audit Center
          </h1>
          <p className="text-stone-500 dark:text-stone-400">Security monitoring and operational activity logs</p>
        </div>
        <button 
          onClick={fetchAllLogs}
          className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-xl font-medium text-stone-900 dark:text-white hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors shadow-sm"
        >
          <Clock size={18} />
          Refresh Registry
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-stone-900 p-2 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <button
              onClick={() => setActiveTab('login')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                activeTab === 'login' 
                  ? "bg-stone-900 text-white dark:bg-white dark:text-black shadow-md" 
                  : "text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800"
              )}
            >
              <History size={18} />
              Login Exceptions
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium mt-1 transition-all",
                activeTab === 'activity' 
                  ? "bg-stone-900 text-white dark:bg-white dark:text-black shadow-md" 
                  : "text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800"
              )}
            >
              <Activity size={18} />
              Operational Logs
            </button>
          </div>

          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">Registry Filter</h2>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="text"
                  placeholder={activeTab === 'login' ? "User, Role or Device" : "User or Action"}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center bg-stone-50/30 dark:bg-stone-800/10">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
                {activeTab === 'login' ? 'Security Authentication Registry' : 'Operational Activity Stream'}
              </h2>
              <span className="text-xs font-mono font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                {loading ? 'SYNCING...' : `${filteredLogs.length} EVENTS`}
              </span>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {loading ? (
                <div className="p-12 text-center text-stone-400 dark:text-stone-500 italic text-sm flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-900 dark:border-stone-700 dark:border-t-white rounded-full animate-spin" />
                  Synchronizing with Registry...
                </div>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log: any) => (
                  <div key={log.id} className="p-6 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "p-2 rounded-xl shrink-0",
                          activeTab === 'login' 
                            ? (log.status === 'success' ? "bg-green-50 dark:bg-green-900/20 text-green-600" : "bg-red-50 dark:bg-red-900/20 text-red-600")
                            : "bg-blue-50 dark:bg-blue-900/20 text-blue-600"
                        )}>
                          {activeTab === 'login' 
                            ? (log.status === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />)
                            : <Activity size={20} />
                          }
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-stone-900 dark:text-white">{log.username}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-full font-mono uppercase tracking-wider">
                              {activeTab === 'login' ? log.role : log.action}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-stone-500 dark:text-stone-400">
                            <div className="flex items-center gap-1">
                              <Clock size={14} />
                              {new Date(activeTab === 'login' ? log.loginAt : log.timestamp).toLocaleString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <Globe size={14} />
                              {log.ipAddress}
                            </div>
                            {activeTab === 'login' && log.device && (
                              <div className="flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300">
                                {getDeviceIcon(log.device.deviceType)}
                                <span className="text-stone-900 dark:text-white">
                                  {log.device.model || `${log.device.os} (${log.device.browser})`}
                                </span>
                              </div>
                            )}
                            {activeTab === 'activity' && log.targetType && (
                              <div className="flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300">
                                <FileText size={14} />
                                Resource: <span className="text-stone-900 dark:text-white uppercase">{log.targetType}</span>
                              </div>
                            )}
                          </div>
                          
                          {activeTab === 'login' && log.status === 'failure' && (
                            <p className="text-xs text-red-500 mt-1 font-medium bg-red-50 dark:bg-red-900/10 p-2 rounded-lg border border-red-100 dark:border-red-900/20">
                              EXCEPTION: {log.failureReason}
                            </p>
                          )}

                          {activeTab === 'activity' && log.details && (
                            <div className="mt-2 text-[10px] font-mono text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800/50 p-2 rounded-lg border border-stone-100 dark:border-stone-800 overflow-x-auto max-w-full">
                              <details>
                                <summary className="cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors">View Payload Details</summary>
                                <pre className="mt-2">{JSON.stringify(log.details, null, 2)}</pre>
                              </details>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-stone-400 dark:text-stone-500 italic text-sm">
                  Registry is empty for this criteria
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
