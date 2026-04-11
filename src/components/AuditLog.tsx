import React, { useState, useEffect } from 'react';
import { Shield, Search, FileText, Calendar, AlertCircle, CheckCircle2, Clock, Smartphone, Monitor, Tablet, MapPin, User, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../services/api';
import { toast } from 'sonner';

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

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/login-logs');
      setLogs(response.data);
    } catch (error: any) {
      toast.error('Failed to fetch audit logs');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => 
    log.username.toLowerCase().includes(searchId.toLowerCase()) ||
    log.role.toLowerCase().includes(searchId.toLowerCase()) ||
    (log.device?.model?.toLowerCase().includes(searchId.toLowerCase()))
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
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Audit Log & Exceptions</h1>
          <p className="text-stone-500 dark:text-stone-400">Monitor system activities and security exceptions</p>
        </div>
        <button 
          onClick={fetchLogs}
          className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-xl font-medium text-stone-900 dark:text-white hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
        >
          <Clock size={18} />
          Refresh Logs
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">Filters</h2>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="text"
                  placeholder="User, Role or Device"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white text-sm"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="date"
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">System Activity</h2>
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                {loading ? 'Loading...' : `Showing ${filteredLogs.length} events`}
              </span>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {loading ? (
                <div className="p-12 text-center text-stone-400 dark:text-stone-500 italic text-sm">
                  Fetching logs...
                </div>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <div key={log.id} className="p-6 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "p-2 rounded-xl shrink-0",
                          log.status === 'success' ? "bg-green-50 dark:bg-green-900/20 text-green-600" : "bg-red-50 dark:bg-red-900/20 text-red-600"
                        )}>
                          {log.status === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-stone-900 dark:text-white">{log.username}</span>
                            <span className="text-xs px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-full uppercase tracking-wider">
                              {log.role}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-stone-500 dark:text-stone-400">
                            <div className="flex items-center gap-1">
                              <Clock size={14} />
                              {log.loginAt ? new Date(log.loginAt).toLocaleString() : 'N/A'}
                            </div>
                            <div className="flex items-center gap-1">
                              <Globe size={14} />
                              {log.ipAddress}
                            </div>
                            {log.device && (
                              <div className="flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300">
                                {getDeviceIcon(log.device.deviceType)}
                                {log.device.model ? (
                                  <span className="text-stone-900 dark:text-white font-semibold">
                                    {log.device.model}
                                  </span>
                                ) : (
                                  `${log.device.os} (${log.device.browser})`
                                )}
                              </div>
                            )}
                          </div>
                          {log.status === 'failure' && (
                            <p className="text-xs text-red-500 mt-1 font-medium">
                              Reason: {log.failureReason}
                            </p>
                          )}
                        </div>
                      </div>
                      {log.location && (
                        <div className="text-right hidden sm:block">
                          <div className="flex items-center justify-end gap-1 text-xs text-stone-500 dark:text-stone-400">
                            <MapPin size={12} />
                            {log.location.city}, {log.location.country}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-stone-400 dark:text-stone-500 italic text-sm">
                  No activity logs found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
