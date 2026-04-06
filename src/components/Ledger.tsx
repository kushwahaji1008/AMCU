import React, { useState, useEffect } from 'react';
import { handleFirestoreError, OperationType, toDate } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../AuthContext';
import { LedgerEntry, Farmer } from '../types';
import { format } from 'date-fns';
import { 
  BookOpen, Search, Filter, ArrowUpRight, ArrowDownLeft, 
  Calendar, User, Download, RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Ledger() {
  const { t } = useLanguage();
  const { db } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [farmers, setFarmers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Credit' | 'Debit'>('All');

  useEffect(() => {
    // Fetch farmers for mapping IDs to names
    const unsubFarmers = onSnapshot(collection(db, 'farmers'), (snapshot) => {
      const farmerMap: Record<string, string> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as Farmer;
        farmerMap[doc.id] = data.name;
      });
      setFarmers(farmerMap);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'farmers'));

    // Fetch ledger entries
    const q = query(collection(db, 'ledger'), orderBy('timestamp', 'desc'), limit(100));
    const unsubLedger = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'ledger'));

    return () => {
      unsubFarmers();
      unsubLedger();
    };
  }, []);

  const filteredEntries = entries.filter(entry => {
    const farmerName = farmers[entry.farmerId] || 'Unknown Farmer';
    const matchesSearch = farmerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         entry.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'All' || entry.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">{t('ledger')}</h1>
          <p className="text-stone-500 dark:text-stone-400">View all financial transactions and balances</p>
        </div>
        
        <button className="flex items-center gap-2 bg-white dark:bg-stone-900 px-4 py-2 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all">
          <Download size={18} />
          Export PDF
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          <input
            type="text"
            placeholder="Search by farmer name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-2xl focus:ring-2 focus:ring-stone-900 dark:focus:ring-white outline-none transition-all text-stone-900 dark:text-white"
          />
        </div>
        
        <div className="flex bg-white dark:bg-stone-900 p-1 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
          {(['All', 'Credit', 'Debit'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-medium transition-all",
                filterType === type 
                  ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm" 
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50/50 dark:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800">
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Date & Time</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Farmer</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Description</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-stone-300 animate-spin mx-auto mb-2" />
                    <p className="text-stone-400 text-sm">Loading ledger entries...</p>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <BookOpen className="w-12 h-12 text-stone-200 dark:text-stone-800 mx-auto mb-4" />
                    <p className="text-stone-500 dark:text-stone-400 font-medium">No ledger entries found</p>
                    <p className="text-stone-400 text-xs mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-stone-900 dark:text-white">
                          {format(toDate(entry.timestamp), 'MMM dd, yyyy')}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {format(toDate(entry.timestamp), 'hh:mm a')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-500">
                          <User size={14} />
                        </div>
                        <span className="text-sm font-medium text-stone-900 dark:text-white">
                          {farmers[entry.farmerId] || 'Unknown Farmer'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-stone-600 dark:text-stone-300">{entry.description}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={cn(
                        "flex items-center justify-end gap-1 font-medium",
                        entry.type === 'Credit' ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      )}>
                        {entry.type === 'Credit' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                        <span>₹{entry.amount.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-mono font-medium text-stone-900 dark:text-white">
                        ₹{entry.balanceAfter.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
