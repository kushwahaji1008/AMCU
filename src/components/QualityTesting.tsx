import React, { useState } from 'react';
import { Beaker, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function QualityTesting() {
  const [searchId, setSearchId] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-stone-900">Quality Testing</h1>
        <p className="text-stone-500">Perform and record milk quality tests</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
          <h2 className="text-lg font-serif font-medium text-stone-900 mb-4">Sample Identification</h2>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input
                type="text"
                placeholder="Enter Sample ID or Farmer ID"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 transition-all"
              />
            </div>
            <button className="px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors">
              Search
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
          <h2 className="text-lg font-serif font-medium text-stone-900 mb-4">Test Parameters</h2>
          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">FAT %</label>
                <input type="number" step="0.1" className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none" placeholder="0.0" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">SNF %</label>
                <input type="number" step="0.1" className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none" placeholder="0.0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">CLR</label>
                <input type="number" className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none" placeholder="28" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Water %</label>
                <input type="number" className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none" placeholder="0" />
              </div>
            </div>
            <button type="submit" className="w-full py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-all">
              Save Test Results
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
