import React, { useState } from 'react';
import { RefreshCw, Download, Upload, CheckCircle2, AlertCircle, Clock, Database, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Synchronization() {
  const [syncing, setSyncing] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900">Synchronization</h1>
          <p className="text-stone-500">Sync local data with the central server</p>
        </div>
        <button 
          onClick={() => setSyncing(true)}
          className="flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
        >
          <RefreshCw className={cn(syncing && "animate-spin")} size={18} />
          Sync Now
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 mb-4">Sync Status</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                <span className="text-sm text-stone-500">Connection</span>
                <span className="text-sm font-medium text-emerald-600 flex items-center gap-2">
                  <Globe size={14} />
                  Online
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                <span className="text-sm text-stone-500">Pending Uploads</span>
                <span className="text-lg font-serif font-medium text-stone-900">0</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                <span className="text-sm text-stone-500">Pending Downloads</span>
                <span className="text-lg font-serif font-medium text-stone-900">0</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                <span className="text-sm text-stone-500">Last Successful Sync</span>
                <span className="text-xs font-medium text-stone-900">2 mins ago</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center">
              <h2 className="text-lg font-serif font-medium text-stone-900">Sync History</h2>
              <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">Showing last 10 events</span>
            </div>
            <div className="divide-y divide-stone-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-6 flex items-center justify-between hover:bg-stone-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-stone-50 rounded-xl flex items-center justify-center">
                      <RefreshCw className="text-stone-400" size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-900">Automatic Sync Successful</p>
                      <p className="text-xs text-stone-500">Uploaded 12 transactions • Downloaded 2 farmer records</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-400">2026-03-30 10:{(30-i)} AM</span>
                    <CheckCircle2 className="text-emerald-500" size={16} />
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
