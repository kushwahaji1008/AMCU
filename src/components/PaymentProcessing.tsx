import React, { useState } from 'react';
import { CreditCard, Search, FileText, Calendar, DollarSign, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function PaymentProcessing() {
  const [searchId, setSearchId] = useState('');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900">Payment Processing</h1>
          <p className="text-stone-500">Process payments to farmers for milk collection</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors">
          <DollarSign size={18} />
          Process Bulk Payments
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 mb-4">Payment Filters</h2>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder="Farmer ID or Name"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 transition-all"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="date"
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 transition-all"
                />
              </div>
              <button className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors">
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center">
              <h2 className="text-lg font-serif font-medium text-stone-900">Pending Payments</h2>
              <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">Showing last 10</span>
            </div>
            <div className="divide-y divide-stone-50">
              {/* Real data should be fetched and mapped here */}
              <div className="p-12 text-center text-stone-400 italic text-sm">
                No pending payments found
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
