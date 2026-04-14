import React, { useState, useEffect } from 'react';
import { CollectionTransaction } from '../types';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { FileText, Download, Filter, Calendar as CalendarIcon, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Printer } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { collectionApi } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const { profile } = useAuth();
  const { handleError } = useErrorHandler();
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([]);
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const response = await collectionApi.getReport(dateRange.start, dateRange.end);
      let data = response.data || [];
      
      if (activeTab === 'pending') {
        data = data.filter((t: any) => t.isManual && !t.isApproved);
      }
      
      setTransactions(data);
    } catch (err) {
      handleError(err, 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [dateRange, activeTab]);

  const handleApprove = async (id: string) => {
    if (profile?.role !== 'admin') return;
    try {
      await collectionApi.update(id, {
        isApproved: true,
        approvedBy: profile.uid,
        approvedAt: new Date().toISOString(),
      });
      toast.success('Transaction approved');
      fetchReports();
    } catch (err) {
      handleError(err, 'Failed to approve transaction');
    }
  };

  const exportToCSV = () => {
    if (transactions.length === 0) {
      toast.error('No records to export');
      return;
    }

    const headers = ['Date', 'Time', 'Farmer ID', 'Farmer Name', 'Shift', 'Milk Type', 'Quantity', 'FAT', 'SNF', 'Rate', 'Amount', 'Status'];
    const rows = transactions.map(t => [
      t.date ? format(new Date(t.date), 'yyyy-MM-dd') : '',
      t.date ? format(new Date(t.date), 'hh:mm a') : '',
      t.farmerId,
      t.farmerName,
      t.shift,
      t.milkType,
      t.quantity,
      t.fat,
      t.snf,
      t.rate,
      t.amount || 0,
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

  const exportToPDF = () => {
    if (transactions.length === 0) {
      toast.error('No records to export');
      return;
    }

    try {
      const doc = new jsPDF();
      const dairyName = profile?.dairyName || 'DugdhaSetu';
      const dairyAddress = profile?.address || '';
      const dairyContact = profile?.phone || '';
      
      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(dairyName, 105, 15, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      if (dairyAddress) doc.text(dairyAddress, 105, 20, { align: 'center' });
      if (dairyContact) doc.text(`Contact: ${dairyContact}`, 105, 24, { align: 'center' });
      
      doc.line(14, 28, 196, 28);
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Collection Report', 105, 35, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${format(new Date(dateRange.start), 'dd/MM/yyyy')} to ${format(new Date(dateRange.end), 'dd/MM/yyyy')}`, 105, 42, { align: 'center' });
      doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 196, 42, { align: 'right' });
      
      // Table
      const tableData = transactions.map((t: any, index: number) => [
        index + 1,
        t.date ? format(new Date(t.date), 'dd/MM/yy') : '',
        t.shift.charAt(0),
        t.farmerName || t.farmerId,
        t.milkType.charAt(0),
        t.quantity.toFixed(1),
        t.fat.toFixed(1),
        t.snf.toFixed(1),
        t.rate.toFixed(2),
        (t.amount || 0).toFixed(2)
      ]);

      const totalQty = transactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
      const totalAmt = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

      autoTable(doc, {
        startY: 48,
        head: [['S.No', 'Date', 'S', 'Farmer Name', 'T', 'Qty', 'Fat', 'SNF', 'Rate', 'Amount']],
        body: tableData,
        foot: [[
          'Total', '', '', '', '', 
          totalQty.toFixed(1), 
          '', '', '', 
          totalAmt.toFixed(2)
        ]],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1 },
        headStyles: { fillColor: [41, 37, 36], textColor: 255 },
        footStyles: { fillColor: [245, 245, 244], textColor: [41, 37, 36], fontStyle: 'bold' }
      });

      doc.save(`Collection_Report_${dateRange.start}_to_${dateRange.end}.pdf`);
      toast.success('Report exported as PDF');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const totalQty = transactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
  const totalAmt = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  const avgFat = transactions.length > 0 ? transactions.reduce((sum, t) => sum + (t.fat || 0), 0) / transactions.length : 0;
  const avgSnf = transactions.length > 0 ? transactions.reduce((sum, t) => sum + (t.snf || 0), 0) / transactions.length : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Reports</h1>
          <p className="text-stone-500 dark:text-stone-400">Analyze collection and payment data</p>
        </div>
        <div className="flex gap-2">
          <div className="flex p-1 bg-stone-100 dark:bg-stone-800 rounded-xl mr-4">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === 'all' ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
              )}
            >
              All Records
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                activeTab === 'pending' ? "bg-white dark:bg-stone-700 text-amber-600 dark:text-amber-400 shadow-sm" : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
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
            className="flex items-center justify-center gap-2 px-4 py-2 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 rounded-xl text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button 
            onClick={exportToPDF}
            className="flex items-center justify-center gap-2 px-4 py-2 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 rounded-xl text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            <Printer size={16} />
            Export PDF
          </button>
          <button className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl text-sm font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors">
            <FileText size={16} />
            Print Summary
          </button>
        </div>
      </div>

      {activeTab === 'all' && (
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Start Date</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={16} />
              <input
                type="date"
                value={dateRange.start}
                onChange={e => setDateRange({...dateRange, start: e.target.value})}
                className="pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm focus:outline-none dark:text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">End Date</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={16} />
              <input
                type="date"
                value={dateRange.end}
                onChange={e => setDateRange({...dateRange, end: e.target.value})}
                className="pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm focus:outline-none dark:text-white"
              />
            </div>
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center gap-2 px-4 py-2 bg-stone-50 dark:bg-stone-800 rounded-xl text-stone-500 dark:text-stone-400 text-sm">
            <Filter size={16} />
            <span>{transactions.length} Records</span>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Total Quantity</p>
          <p className="text-2xl font-serif font-medium text-stone-900 dark:text-white">{(totalQty || 0).toFixed(1)} kg</p>
        </div>
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Total Amount</p>
          <p className="text-2xl font-serif font-medium text-stone-900 dark:text-white">₹{(totalAmt || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Average FAT</p>
          <p className="text-2xl font-serif font-medium text-stone-900 dark:text-white">{(avgFat || 0).toFixed(2)}%</p>
        </div>
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Average SNF</p>
          <p className="text-2xl font-serif font-medium text-stone-900 dark:text-white">{(avgSnf || 0).toFixed(2)}%</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Date/Time</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Farmer</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Shift</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Qty</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">FAT/SNF</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Rate</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
              {(transactions || []).map((t, idx) => (
                <tr key={t.id || `txn-${idx}`} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                  <td className="px-6 py-4 text-xs text-stone-500 dark:text-stone-400">
                    {t.date ? format(new Date(t.date), 'dd MMM, hh:mm a') : 'Pending...'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-sm font-medium text-stone-900 dark:text-white">{t.farmerName}</p>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500">ID: {t.farmerId}</p>
                      </div>
                      {t.isManual && (
                        <div className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-tighter",
                          t.isApproved ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                        )}>
                          {t.isApproved ? 'Manual (Appr)' : 'Manual (Pend)'}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      t.shift === 'Morning' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                    )}>
                      {t.shift}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-300 font-mono">{(t.quantity || 0).toFixed(1)}</td>
                  <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-300 font-mono">{(t.fat || 0).toFixed(1)} / {(t.snf || 0).toFixed(1)}</td>
                  <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-300 font-mono">₹{(t.rate || 0).toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-medium text-stone-900 dark:text-white">₹{(t.amount || 0).toFixed(2)}</span>
                      {activeTab === 'pending' && profile?.role === 'admin' && (
                        <button
                          onClick={() => handleApprove(t.id)}
                          className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
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
                  <td colSpan={7} className="px-6 py-12 text-center text-stone-400 dark:text-stone-500 italic">No records found for this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
