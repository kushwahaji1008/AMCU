import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Printer, Search, FileText, Calendar, Download, Share2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function ReceiptPrint() {
  const { t } = useLanguage();
  const [searchId, setSearchId] = useState('');

  const handlePrint = (id?: number) => {
    toast.info(id ? `Printing receipt #RC-${1000 + id}...` : 'Printing selected receipts...');
    window.print();
  };

  return (
    <div className="space-y-8 print:p-0">
      <div className="flex justify-between items-end print:hidden">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900">{t('receipts')}</h1>
          <p className="text-stone-500">Generate and print collection receipts and periodic bills</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-6 py-3 bg-white border border-stone-100 rounded-xl font-medium text-stone-900 hover:bg-stone-50 transition-colors">
            <Download size={18} />
            Export PDF
          </button>
          <button 
            onClick={() => handlePrint()}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
          >
            <Printer size={18} />
            Print Selected
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block">
        <div className="lg:col-span-1 space-y-6 print:hidden">
          <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 mb-4">{t('search')} & Filter</h2>
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

        <div className="lg:col-span-2 print:w-full">
          <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center print:hidden">
              <h2 className="text-lg font-serif font-medium text-stone-900">Recent Receipts</h2>
              <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">Showing last 10</span>
            </div>
            <div className="divide-y divide-stone-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-6 flex items-center justify-between hover:bg-stone-50/50 transition-colors print:border-b print:border-stone-200">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-stone-50 rounded-xl flex items-center justify-center print:hidden">
                      <FileText className="text-stone-400" size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-900">Receipt #RC-{(1000 + i)}</p>
                      <p className="text-xs text-stone-500">Farmer: Rajesh Kumar (101) • 2026-03-30</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-stone-900 font-mono">₹{(450.0 + i * 25).toFixed(2)}</span>
                    <button 
                      onClick={() => handlePrint(i)}
                      className="p-2 text-stone-400 hover:text-stone-900 transition-colors print:hidden"
                    >
                      <Printer size={16} />
                    </button>
                    <button className="p-2 text-stone-400 hover:text-stone-900 transition-colors print:hidden">
                      <Share2 size={16} />
                    </button>
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
