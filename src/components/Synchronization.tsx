import React, { useState } from 'react';
import { RefreshCw, Download, Upload, CheckCircle2, AlertCircle, Clock, Database, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Synchronization() {
  const [syncing, setSyncing] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Synchronization</h1>
          <p className="text-stone-500 dark:text-stone-400">Sync local data with the central server</p>
        </div>
        <button 
          onClick={() => setSyncing(true)}
          className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
        >
          <RefreshCw className={cn(syncing && "animate-spin")} size={18} />
          Sync Now
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">Sync Status</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                <span className="text-sm text-stone-500 dark:text-stone-400">Connection</span>
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Globe size={14} />
                  Online
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                <span className="text-sm text-stone-500 dark:text-stone-400">Pending Uploads</span>
                <span className="text-lg font-serif font-medium text-stone-900 dark:text-white">0</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                <span className="text-sm text-stone-500 dark:text-stone-400">Pending Downloads</span>
                <span className="text-lg font-serif font-medium text-stone-900 dark:text-white">0</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                <span className="text-sm text-stone-500 dark:text-stone-400">Last Successful Sync</span>
                <span className="text-xs font-medium text-stone-900 dark:text-white">2 mins ago</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Sync History</h2>
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Showing last 10 events</span>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-6 flex items-center justify-between hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 rounded-xl flex items-center justify-center">
                      <RefreshCw className="text-stone-400 dark:text-stone-500" size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-900 dark:text-white">Automatic Sync Successful</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">Uploaded 12 transactions • Downloaded 2 farmer records</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-400 dark:text-stone-500">2026-03-30 10:{(30-i)} AM</span>
                    <CheckCircle2 className="text-emerald-500 dark:text-emerald-400" size={16} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
