import React, { useState } from 'react';
import { Database, Download, Upload, RefreshCw, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { cn } from '../lib/utils';

export default function BackupRestore() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-stone-900">Backup & Restore</h1>
        <p className="text-stone-500">Manage system data backups and restoration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm space-y-6">
          <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center">
            <Download className="text-stone-400" size={32} />
          </div>
          <div>
            <h2 className="text-xl font-serif font-medium text-stone-900">Create Backup</h2>
            <p className="text-sm text-stone-500 mt-2">Download a full backup of your system data, including farmer records, collection history, and settings.</p>
          </div>
          <div className="pt-4">
            <button className="w-full py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-all flex items-center justify-center gap-2">
              <Download size={20} />
              Download Full Backup
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm space-y-6">
          <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center">
            <Upload className="text-stone-400" size={32} />
          </div>
          <div>
            <h2 className="text-xl font-serif font-medium text-stone-900">Restore System</h2>
            <p className="text-sm text-stone-500 mt-2">Restore your system from a previously saved backup file. Warning: This will overwrite existing data.</p>
          </div>
          <div className="pt-4">
            <button className="w-full py-4 bg-white border border-stone-100 text-stone-900 rounded-2xl font-medium hover:bg-stone-50 transition-all flex items-center justify-center gap-2">
              <Upload size={20} />
              Choose Backup File
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex justify-between items-center">
          <h2 className="text-lg font-serif font-medium text-stone-900">Backup History</h2>
          <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">Showing last 5 backups</span>
        </div>
        <div className="divide-y divide-stone-50">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 flex items-center justify-between hover:bg-stone-50/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-stone-50 rounded-xl flex items-center justify-center">
                  <FileText className="text-stone-400" size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-900">Backup_2026-03-{30-i}.zip</p>
                  <p className="text-xs text-stone-500">Size: 12.4 MB • Created by: Admin</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-400">2026-03-{30-i} 10:00 AM</span>
                <button className="p-2 text-stone-400 hover:text-stone-900 transition-colors">
                  <Download size={16} />
                </button>
                <button className="p-2 text-stone-400 hover:text-red-600 transition-colors">
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
