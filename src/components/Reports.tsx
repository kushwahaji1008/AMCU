import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { CollectionTransaction, ShiftSummary } from '../types';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { FileText, Download, Filter, Calendar as CalendarIcon, ShieldCheck, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

export default function Reports() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([]);
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let q;
    if (activeTab === 'pending') {
      q = query(
        collection(db, 'collections'),
        where('isManual', '==', true),
        where('isApproved', '==', false),
        orderBy('timestamp', 'desc')
      );
    } else {
      q = query(
        collection(db, 'collections'),
        where('timestamp', '>=', startOfDay(new Date(dateRange.start)).toISOString()),
        where('timestamp', '<=', endOfDay(new Date(dateRange.end)).toISOString()),
        orderBy('timestamp', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionTransaction)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'collections'));

    return () => unsubscribe();
  }, [dateRange]);

  const handleApprove = async (id: string) => {
    if (profile?.role !== 'admin' || !auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'collections', id), {
        isApproved: true,
        approvedBy: auth.currentUser.uid,
        approvedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `collections/${id}`);
    }
  };

  const exportToCSV = () => {
    if (transactions.length === 0) {
      toast.error('No records to export');
      return;
    }

    const headers = ['Date', 'Time', 'Farmer ID', 'Farmer Name', 'Shift', 'Milk Type', 'Quantity', 'FAT', 'SNF', 'Rate', 'Amount', 'Status'];
    const rows = transactions.map(t => [
      t.timestamp ? format(new Date(t.timestamp), 'yyyy-MM-dd') : '',
      t.timestamp ? format(new Date(t.timestamp), 'hh:mm a') : '',
      t.farmerId,
      t.farmerName,
      t.shift,
      t.milkType,
      t.quantity,
      t.fat,
      t.snf,
      t.rate,
      t.amount,
      t.isManual ? (t.isApproved ? 'Approved Manual' : 'Pending Manual') : 'Automatic'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `DugdhaSetu_Report_${dateRange.start}_to_${dateRange.end}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported as CSV');
  };

  const totalQty = transactions.reduce((sum, t) => sum + t.quantity, 0);
  const totalAmt = transactions.reduce((sum, t) => sum + t.amount, 0);
  const avgFat = transactions.length > 0 ? transactions.reduce((sum, t) => sum + t.fat, 0) / transactions.length : 0;
  const avgSnf = transactions.length > 0 ? transactions.reduce((sum, t) => sum + t.snf, 0) / transactions.length : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900">Reports</h1>
          <p className="text-stone-500">Analyze collection and payment data</p>
        </div>
        <div className="flex gap-2">
          <div className="flex p-1 bg-stone-100 rounded-xl mr-4">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === 'all' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              )}
            >
              All Records
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                activeTab === 'pending' ? "bg-white text-amber-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
              )}
            >
              Pending Approvals
              {activeTab !== 'pending' && transactions.filter(t => t.isManual && !t.isApproved).length > 0 && (
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
              )}
            </button>
          </div>
          <button 
            onClick={exportToCSV}
            className="flex items-center justify-center gap-2 px-4 py-2 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors">
            <FileText size={16} />
            Print Summary
          </button>
        </div>
      </div>

      {activeTab === 'all' && (
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Start Date</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input
                type="date"
                value={dateRange.start}
                onChange={e => setDateRange({...dateRange, start: e.target.value})}
                className="pl-10 pr-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">End Date</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input
                type="date"
                value={dateRange.end}
                onChange={e => setDateRange({...dateRange, end: e.target.value})}
                className="pl-10 pr-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center gap-2 px-4 py-2 bg-stone-50 rounded-xl text-stone-500 text-sm">
            <Filter size={16} />
            <span>{transactions.length} Records</span>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Total Quantity</p>
          <p className="text-2xl font-serif font-medium text-stone-900">{totalQty.toFixed(1)} kg</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Total Amount</p>
          <p className="text-2xl font-serif font-medium text-stone-900">₹{totalAmt.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Average FAT</p>
          <p className="text-2xl font-serif font-medium text-stone-900">{avgFat.toFixed(2)}%</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Average SNF</p>
          <p className="text-2xl font-serif font-medium text-stone-900">{avgSnf.toFixed(2)}%</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50">
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Date/Time</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Farmer</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Shift</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Qty</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">FAT/SNF</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Rate</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs text-stone-500">
                    {t.timestamp ? format(new Date(t.timestamp), 'dd MMM, hh:mm a') : 'Pending...'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-sm font-medium text-stone-900">{t.farmerName}</p>
                        <p className="text-[10px] text-stone-400">ID: {t.farmerId}</p>
                      </div>
                      {t.isManual && (
                        <div className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-tighter",
                          t.isApproved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {t.isApproved ? 'Manual (Appr)' : 'Manual (Pend)'}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      t.shift === 'Morning' ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
                    )}>
                      {t.shift}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600 font-mono">{t.quantity.toFixed(1)}</td>
                  <td className="px-6 py-4 text-sm text-stone-600 font-mono">{t.fat.toFixed(1)} / {t.snf.toFixed(1)}</td>
                  <td className="px-6 py-4 text-sm text-stone-600 font-mono">₹{t.rate.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-medium text-stone-900">₹{t.amount.toFixed(2)}</span>
                      {activeTab === 'pending' && profile?.role === 'admin' && (
                        <button
                          onClick={() => handleApprove(t.id)}
                          className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                          title="Approve Manual Entry"
                        >
                          <ShieldCheck size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-stone-400 italic">No records found for this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
