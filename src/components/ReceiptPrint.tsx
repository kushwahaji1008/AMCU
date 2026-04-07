import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';
import { Printer, Search, FileText, Calendar, Download, Share2, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { CollectionTransaction } from '../types';
import { format, startOfDay, endOfDay } from 'date-fns';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { collectionApi } from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function ReceiptPrint() {
  const { t } = useLanguage();
  const { handleError } = useErrorHandler();
  const [searchId, setSearchId] = useState('');
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<CollectionTransaction | null>(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const response = await collectionApi.getReport(filterDate);
        let data = response.data;

        if (searchId) {
          data = data.filter((d: any) => 
            d.farmerId.includes(searchId) || 
            d.farmerName.toLowerCase().includes(searchId.toLowerCase())
          );
        }

        setTransactions(data);
      } catch (err) {
        handleError(err, 'Failed to load transactions');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [filterDate, searchId]);

  const handlePrint = (txn?: CollectionTransaction) => {
    if (txn) {
      setSelectedTxn(txn);
      // Small delay to allow state update and rendering before print
      setTimeout(() => {
        window.print();
      }, 100);
    } else {
      setSelectedTxn(null);
      window.print();
    }
  };

  const handleExport = () => {
    if (transactions.length === 0) {
      toast.error('No data to export');
      return;
    }
    const headers = ['Date', 'Shift', 'Farmer ID', 'Farmer Name', 'Milk Type', 'Quantity', 'FAT', 'SNF', 'Rate', 'Amount'];
    const csvContent = [
      headers.join(','),
      ...transactions.map(t => [
        t.date ? format(new Date(t.date), 'yyyy-MM-dd HH:mm') : '',
        t.shift,
        t.farmerId,
        `"${t.farmerName}"`,
        t.milkType,
        t.quantity,
        t.fat,
        t.snf,
        t.rate,
        t.amount
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `milk_collection_${filterDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported successfully');
  };

  return (
    <div className="space-y-8 print:p-0">
      <div className="flex justify-between items-end print:hidden">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">{t('receipts')}</h1>
          <p className="text-stone-500 dark:text-stone-400">Generate and print collection receipts and periodic bills</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-xl font-medium text-stone-900 dark:text-white hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => handlePrint()}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
          >
            <Printer size={18} />
            Print List
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block">
        <div className="lg:col-span-1 space-y-6 print:hidden">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">{t('search')} & Filter</h2>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="text"
                  placeholder="Farmer ID or Name"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        <div className={cn("lg:col-span-2", selectedTxn ? "print:hidden" : "print:block")}>
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center print:hidden">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Recent Transactions</h2>
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                {loading ? 'Loading...' : `Found ${transactions.length}`}
              </span>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {transactions.map((txn) => (
                <div key={txn.id} className="p-6 flex items-center justify-between hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors print:border-b print:border-stone-100">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 rounded-xl flex items-center justify-center print:hidden">
                      <FileText className="text-stone-400 dark:text-stone-500" size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-900 dark:text-white">
                        {txn.farmerName} ({txn.farmerId})
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {txn.date ? format(new Date(txn.date), 'dd MMM yyyy, hh:mm a') : '...'} • {txn.shift}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right mr-4">
                      <p className="text-sm font-medium text-stone-900 dark:text-white font-mono">₹{(txn.amount || 0).toFixed(2)}</p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-wider">{(txn.quantity || 0).toFixed(1)}kg • {(txn.fat || 0).toFixed(1)}% FAT</p>
                    </div>
                    <button 
                      onClick={() => handlePrint(txn)}
                      className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors print:hidden"
                    >
                      <Printer size={16} />
                    </button>
                    <button className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors print:hidden">
                      <Share2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && !loading && (
                <div className="p-12 text-center text-stone-400 dark:text-stone-500 italic">
                  No transactions found for the selected criteria.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Print-only Receipt Layout */}
        {selectedTxn && (
          <div className="hidden print:block absolute top-0 left-0 w-full bg-white z-[100] p-4 text-stone-900">
            <div className="max-w-xs mx-auto border border-stone-300 p-4 space-y-4 text-[12px]">
              <div className="text-center border-b border-stone-200 pb-4">
                <h1 className="text-lg font-serif font-bold uppercase tracking-widest">MilkFlow AMCU</h1>
                <p className="text-[10px] text-stone-500">Collection Receipt</p>
              </div>

              <div className="grid grid-cols-2 gap-y-2">
                <div className="text-stone-500">Receipt No:</div>
                <div className="font-mono text-right">#RC-{selectedTxn.id.slice(-6).toUpperCase()}</div>
                
                <div className="text-stone-500">Date & Time:</div>
                <div className="text-right">
                  {selectedTxn.date ? format(new Date(selectedTxn.date), 'dd/MM/yyyy HH:mm') : ''}
                </div>

                <div className="text-stone-500">Shift:</div>
                <div className="text-right">{selectedTxn.shift}</div>

                <div className="text-stone-500">Member:</div>
                <div className="text-right font-bold">{selectedTxn.farmerName} ({selectedTxn.farmerId})</div>
              </div>

              <div className="border-y border-stone-200 py-2 space-y-1">
                <div className="flex justify-between">
                  <span>Milk Type:</span>
                  <span className="font-bold">{selectedTxn.milkType}</span>
                </div>
                <div className="flex justify-between">
                  <span>Quantity:</span>
                  <span className="font-bold">{(selectedTxn.quantity || 0).toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span>FAT:</span>
                  <span className="font-bold">{(selectedTxn.fat || 0).toFixed(1)} %</span>
                </div>
                <div className="flex justify-between">
                  <span>SNF:</span>
                  <span className="font-bold">{(selectedTxn.snf || 0).toFixed(1)} %</span>
                </div>
                <div className="flex justify-between">
                  <span>Rate:</span>
                  <span className="font-bold">₹{(selectedTxn.rate || 0).toFixed(2)} /kg</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-1">
                <span className="font-bold uppercase">Total Amount:</span>
                <span className="text-xl font-serif font-bold">₹{(selectedTxn.amount || 0).toFixed(2)}</span>
              </div>

              <div className="pt-4 text-center text-[8px] text-stone-400 border-t border-stone-100">
                <p>Thank you for your business!</p>
                <p>Generated by MilkFlow AMCU System</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
