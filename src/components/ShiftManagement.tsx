import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { ShiftSummary, CollectionTransaction } from '../types';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Clock, CheckCircle2, AlertCircle, History, ArrowRight, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { toast } from 'sonner';
import { collectionApi, shiftApi } from '../services/api';

export default function ShiftManagement() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { handleError } = useErrorHandler();
  const [currentShift, setCurrentShift] = useState<'Morning' | 'Evening'>(
    new Date().getHours() < 13 ? 'Morning' : 'Evening'
  );
  const [shiftStats, setShiftStats] = useState({
    totalFarmers: 0,
    totalQuantity: 0,
    totalAmount: 0,
    avgFat: 0,
    avgSnf: 0,
  });
  const [pastSummaries, setPastSummaries] = useState<ShiftSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isShiftSummarized, setIsShiftSummarized] = useState(false);
  const [isShiftExpired, setIsShiftExpired] = useState(false);

  const fetchShiftData = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Fetch collections for today's shift
      const collectionsRes = await collectionApi.getDailyReport(today);
      const shiftCollections = collectionsRes.data.filter((c: any) => c.shift === currentShift);
      
      let qty = 0;
      let amt = 0;
      let fatSum = 0;
      let snfSum = 0;
      const farmerIds = new Set();

      shiftCollections.forEach((data: any) => {
        qty += data.quantity;
        amt += data.totalAmount || data.amount;
        fatSum += data.fat;
        snfSum += data.snf;
        farmerIds.add(data.farmerId);
      });

      setShiftStats({
        totalFarmers: farmerIds.size,
        totalQuantity: qty,
        totalAmount: amt,
        avgFat: shiftCollections.length > 0 ? fatSum / shiftCollections.length : 0,
        avgSnf: shiftCollections.length > 0 ? snfSum / shiftCollections.length : 0,
      });

      // Check if shift is summarized
      const summaryRes = await shiftApi.getSummary(today, currentShift);
      setIsShiftSummarized(!!summaryRes.data);

      // Fetch past summaries
      const recentRes = await shiftApi.getRecent(10);
      setPastSummaries(recentRes.data);

    } catch (err) {
      handleError(err, 'Failed to load shift data');
    }
  };

  useEffect(() => {
    fetchShiftData();

    // Auto-close logic based on time
    const timer = setInterval(() => {
      const now = new Date();
      const currentHour = now.getHours();
      let expired = false;
      if (currentShift === 'Morning' && currentHour >= 13) {
        expired = true;
      }
      setIsShiftExpired(expired);
    }, 10000);

    return () => clearInterval(timer);
  }, [currentShift]);

  const handleCloseShift = async () => {
    if (isShiftSummarized) return;
    setLoading(true);
    try {
      const summary = {
        date: format(new Date(), 'yyyy-MM-dd'),
        shift: currentShift,
        totalFarmers: shiftStats.totalFarmers,
        totalQuantity: shiftStats.totalQuantity,
        avgFat: shiftStats.avgFat,
        avgSnf: shiftStats.avgSnf,
        totalAmount: shiftStats.totalAmount,
        closedAt: new Date(),
        closedBy: profile?.name || 'Unknown',
        dairyId: profile?.dairyId || 'global'
      };

      await shiftApi.createSummary(summary);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      fetchShiftData();
    } catch (err) {
      handleError(err, 'Failed to close shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">{t('shifts')}</h1>
          <p className="text-stone-500 dark:text-stone-400">Open, close and review collection shifts</p>
        </div>
        <div className="flex bg-white dark:bg-stone-900 p-1 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <button
              onClick={() => setCurrentShift('Morning')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-medium transition-all",
                currentShift === 'Morning' ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm" : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
              )}
            >
              {t('morning')}
            </button>
            <button
              onClick={() => setCurrentShift('Evening')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-medium transition-all",
                currentShift === 'Evening' ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm" : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
              )}
            >
              {t('evening')}
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Current Shift Status */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 dark:opacity-10 dark:text-white">
              <Clock size={120} />
            </div>
            
            <div className="flex items-center gap-4 mb-8">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center",
                isShiftSummarized ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" : 
                isShiftExpired ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" :
                "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              )}>
                <Clock size={24} />
              </div>
              <div>
                <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">
                  {currentShift} Shift - {format(new Date(), 'dd MMM yyyy')}
                </h2>
                <p className={cn(
                  "text-sm font-medium",
                  isShiftSummarized ? "text-emerald-600 dark:text-emerald-400" : 
                  isShiftExpired ? "text-amber-600 dark:text-amber-400" :
                  "text-blue-600 dark:text-blue-400"
                )}>
                  {isShiftSummarized ? 'Shift Closed & Summarized' : 
                   isShiftExpired ? 'Shift Expired (Auto-Closed)' : 
                   'Shift Active & Open'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-10">
              <div>
                <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Farmers</p>
                <p className="text-2xl font-serif font-medium text-stone-900 dark:text-white">{shiftStats.totalFarmers}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Quantity</p>
                <p className="text-2xl font-serif font-medium text-stone-900 dark:text-white">{(shiftStats.totalQuantity || 0).toFixed(1)} kg</p>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Avg FAT</p>
                <p className="text-2xl font-serif font-medium text-stone-900 dark:text-white">{(shiftStats.avgFat || 0).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Total Amount</p>
                <p className="text-2xl font-serif font-medium text-stone-900 dark:text-white">₹{shiftStats.totalAmount.toLocaleString()}</p>
              </div>
            </div>

            {!isShiftSummarized ? (
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleCloseShift}
                  disabled={loading || shiftStats.totalFarmers === 0}
                  className={cn(
                    "flex-1 py-4 rounded-2xl font-medium flex items-center justify-center gap-2 transition-all",
                    success ? "bg-emerald-500 text-white" : 
                    isShiftExpired ? "bg-amber-600 hover:bg-amber-700 text-white" :
                    "bg-stone-900 dark:bg-white text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-100 disabled:opacity-50"
                  )}
                >
                  {success ? (
                    <>
                      <CheckCircle2 size={20} />
                      Shift Summarized Successfully
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      {loading ? 'Processing...' : isShiftExpired ? 'Finalize & Generate Summary' : 'Close Shift & Save Summary'}
                    </>
                  )}
                </button>
                <button className="px-8 py-4 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 rounded-2xl font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                  Print Summary
                </button>
              </div>
            ) : (
              <div className="p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 flex items-center gap-3 text-stone-500 dark:text-stone-400">
                <CheckCircle2 size={20} className="text-emerald-500" />
                <p className="text-sm font-medium">This shift has been closed and summarized.</p>
              </div>
            )}
          </div>

          {/* Shift History */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800 flex items-center gap-2">
              <History size={20} className="text-stone-400 dark:text-stone-500" />
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Recent Shift History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Shift</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Qty</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Closed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                  {pastSummaries.map((summary) => (
                    <tr key={summary.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-stone-900 dark:text-white font-medium">
                        {format(new Date(summary.date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          summary.shift === 'Morning' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                        )}>
                          {summary.shift}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-300 font-mono">{(summary.totalQuantity || 0).toFixed(1)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-stone-900 dark:text-white">₹{summary.totalAmount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center">
                            <User size={12} className="text-stone-400 dark:text-stone-500" />
                          </div>
                          <span className="text-xs text-stone-500 dark:text-stone-400">{summary.closedBy}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pastSummaries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-stone-400 dark:text-stone-500 italic">No shift history available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-stone-50 dark:bg-stone-900/50 p-6 rounded-3xl border border-stone-100 dark:border-stone-800">
            <h3 className="text-sm font-serif font-medium text-stone-900 dark:text-white mb-4 uppercase tracking-wider">Shift Guidelines</h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">Ensure all milk pours for the current shift are recorded before closing.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">Closing a shift makes all transactions in that shift read-only for operators.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">Shift summaries are used for daily reconciliation and payment settlement.</p>
              </li>
            </ul>
          </div>

          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h3 className="text-sm font-serif font-medium text-stone-900 dark:text-white mb-4 uppercase tracking-wider">Today's Progress</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-stone-400 dark:text-stone-500">Morning Shift</span>
                  <span className="text-stone-900 dark:text-white font-medium">Completed</span>
                </div>
                <div className="h-1.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-emerald-500"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-stone-400 dark:text-stone-500">Evening Shift</span>
                  <span className="text-stone-900 dark:text-white font-medium">{new Date().getHours() >= 12 ? 'In Progress' : 'Pending'}</span>
                </div>
                <div className="h-1.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                  <div className={cn(
                    "h-full transition-all duration-1000",
                    new Date().getHours() >= 12 ? "w-1/2 bg-amber-500" : "w-0"
                  )}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
