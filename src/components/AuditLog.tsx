import React, { useState } from 'react';
import { Shield, Search, FileText, Calendar, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

export default function AuditLog() {
  const [searchId, setSearchId] = useState('');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Audit Log & Exceptions</h1>
          <p className="text-stone-500 dark:text-stone-400">Monitor system activities and security exceptions</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-xl font-medium text-stone-900 dark:text-white hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
          <FileText size={18} />
          Export Audit Log
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
                  placeholder="User or Action"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="date"
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                />
              </div>
              <button className="w-full py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors">
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">System Activity</h2>
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Showing last 20 events</span>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {/* Real audit logs should be fetched and mapped here */}
              <div className="p-12 text-center text-stone-400 dark:text-stone-500 italic text-sm">
                No activity logs found
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
