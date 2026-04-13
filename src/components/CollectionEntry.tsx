import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { collectionApi, farmerApi, rateApi } from '../services/api';
import { useAuth } from '../AuthContext';
import { Farmer, CollectionTransaction, RateChart, RateSettings } from '../types';
import { format } from 'date-fns';
import { Search, Milk, Calculator, Printer, CheckCircle2, AlertCircle, Users, QrCode } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { cn } from '../lib/utils';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { smsService } from '../services/smsService';

export default function CollectionEntry() {
  const { profile } = useAuth();
  const { handleError } = useErrorHandler();
  const [searchId, setSearchId] = useState('');
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [formData, setFormData] = useState({
    quantity: '',
    fat: '',
    snf: '',
    clr: '',
    milkType: 'Cow' as 'Cow' | 'Buffalo' | 'Mixed',
  });

  const [calculated, setCalculated] = useState({
    rate: 0,
    amount: 0,
  });

  const [rateCharts, setRateCharts] = useState<RateChart[]>([]);
  const [rateSettings, setRateSettings] = useState<RateSettings | null>(null);
  const [isShiftClosed, setIsShiftClosed] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedShift, setSelectedShift] = useState<'Morning' | 'Evening'>(
    new Date().getHours() < 13 ? 'Morning' : 'Evening'
  );
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([]);
  const [selectedTxn, setSelectedTxn] = useState<CollectionTransaction | null>(null);

  const fetchRateCharts = async () => {
    try {
      const response = await rateApi.getAll();
      setRateCharts(response.data);
    } catch (err) {
      handleError(err, 'Failed to fetch rate charts');
    }
  };

  const fetchRateSettings = async () => {
    try {
      const response = await rateApi.getSettings();
      if (response.data && Object.keys(response.data).length > 0) {
        setRateSettings(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch rate settings', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await collectionApi.getReport(selectedDate);
      // Filter by shift on frontend for now
      const filtered = response.data.filter((t: any) => t.shift === selectedShift);
      setTransactions(filtered);
    } catch (err) {
      handleError(err, 'Failed to fetch transactions');
    }
  };

  useEffect(() => {
    fetchRateCharts();
    fetchRateSettings();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [selectedDate, selectedShift]);

  // Rate calculation logic
  useEffect(() => {
    const qty = parseFloat(formData.quantity) || 0;
    const fat = parseFloat(formData.fat) || 0;
    const snf = parseFloat(formData.snf) || 0;

    if (qty > 0 && fat > 0) {
      let rate = 0;
      
      // 1. Check if there's an explicit rate chart entry
      const explicitRate = rateCharts.find(
        r => r.milkType === formData.milkType && 
             fat >= (r.fatMin || r.fat || 0) && fat <= (r.fatMax || r.fat || 100) &&
             snf >= (r.snfMin || r.snf || 0) && snf <= (r.snfMax || r.snf || 100)
      );

      if (explicitRate && explicitRate.rate) {
        rate = explicitRate.rate;
      } else if (rateSettings) {
        // 2. Use formula from settings
        if (fat < (rateSettings.maxFatForFormula1 || 6.0)) {
          // Formula 1: Rate = (FAT * fatMultiplier1) + (SNF * snfMultiplier1)
          rate = (fat * (rateSettings.fatMultiplier1 || 3.96)) + (snf * (rateSettings.snfMultiplier1 || 2.64));
        } else {
          // Formula 2: Rate = FAT * fatMultiplier2 - SNF Deduction
          const snfKey = snf.toFixed(1);
          const deduction = rateSettings.snfDeductions?.[snfKey] || 0;
          rate = (fat * (rateSettings.fatMultiplier2 || 7.77)) - deduction;
        }
      } else {
        // 3. Fallback
        const baseRate = formData.milkType === 'Cow' ? 35 : 45;
        const fatStd = formData.milkType === 'Cow' ? 3.5 : 6.0;
        rate = baseRate + (fat - fatStd) * 5 + (snf - 8.5) * 2;
        rate = Math.max(rate, 20);
      }
      
      // Round rate to 2 decimal places
      rate = Math.round(rate * 100) / 100;
      
      setCalculated({
        rate: rate,
        amount: Math.round(qty * rate * 100) / 100,
      });
    } else {
      setCalculated({ rate: 0, amount: 0 });
    }
  }, [formData, rateCharts, rateSettings]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId) return;
    
    setLoading(true);
    setError(null);
    setFarmer(null);
    
    try {
      const response = await farmerApi.search(searchId);
      const found = response.data;
      
      if (!found) {
        setError('Farmer not found');
      } else {
        setFarmer(found);
        setFormData(prev => ({ ...prev, milkType: found.cattleType }));
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('Farmer not found');
      } else {
        handleError(err, 'Search failed');
        setError('Search failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFarmerById = async (id: string) => {
    setLoading(true);
    setError(null);
    setFarmer(null);
    
    try {
      const response = await farmerApi.search(id);
      const found = response.data;
      
      if (!found) {
        setError('Farmer not found');
        toast.error('Farmer not found');
      } else {
        setFarmer(found);
        setFormData(prev => ({ ...prev, milkType: found.cattleType }));
        setSearchId(id);
        toast.success(`Farmer ${found.name} identified`);
        setIsScanning(false);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('Farmer not found');
        toast.error('Farmer not found');
      } else {
        handleError(err, 'Fetch failed');
        setError('Fetch failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (isScanning) {
      const timer = setTimeout(() => {
        scanner = new Html5QrcodeScanner(
          "qr-reader",
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false
        );

        scanner.render(
          (decodedText) => {
            fetchFarmerById(decodedText);
          },
          (error) => {}
        );
      }, 100);

      return () => {
        clearTimeout(timer);
        if (scanner) {
          scanner.clear().catch(err => console.error("Failed to clear scanner", err));
        }
      };
    }
  }, [isScanning]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmer || !calculated.amount) return;

    setLoading(true);
    try {
      const txnData = {
        farmerId: farmer.id, // Use the MongoDB _id
        farmerName: farmer.name,
        date: new Date(selectedDate),
        shift: selectedShift,
        milkType: formData.milkType,
        quantity: parseFloat(formData.quantity),
        fat: parseFloat(formData.fat),
        snf: parseFloat(formData.snf),
        clr: parseFloat(formData.clr) || 0,
        rate: calculated.rate,
        operatorId: profile?.uid || 'unknown',
        dairyId: profile?.dairyId || '',
      };

      await collectionApi.create(txnData);
      
      // Send SMS to farmer
      if (farmer.mobile) {
        const smsMsg = `Dear ${farmer.name}, Milk collected: ${txnData.quantity}L, FAT: ${txnData.fat}, SNF: ${txnData.snf}, Rate: Rs.${txnData.rate}/L. Total: Rs.${calculated.amount}. - DugdhaSetu`;
        smsService.sendDirectSMS(farmer.mobile, smsMsg).catch(err => console.error('SMS Error:', err));
      }

      setSuccess(true);
      fetchTransactions();
      setTimeout(() => {
        setSuccess(false);
        setFarmer(null);
        setSearchId('');
        setFormData({ quantity: '', fat: '', snf: '', clr: '', milkType: 'Cow' });
      }, 3000);
    } catch (err: any) {
      handleError(err, 'Failed to save entry');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (txn: CollectionTransaction) => {
    setSelectedTxn(txn);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Milk Collection</h1>
          <p className="text-stone-500 dark:text-stone-400">Record a new milk pour</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white dark:bg-stone-900 p-2 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="flex flex-col">
            <label className="text-[10px] font-medium text-stone-400 uppercase tracking-wider px-2">Date</label>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm font-medium text-stone-900 dark:text-white px-2 py-1"
            />
          </div>
          <div className="w-px h-8 bg-stone-100 dark:bg-stone-800" />
          <div className="flex flex-col">
            <label className="text-[10px] font-medium text-stone-400 uppercase tracking-wider px-2">Shift</label>
            <select 
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value as 'Morning' | 'Evening')}
              className="bg-transparent border-none focus:ring-0 text-sm font-medium text-stone-900 dark:text-white px-2 py-1 appearance-none cursor-pointer"
            >
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Search & Farmer Info */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">1. Identify Farmer</h2>
            <div className="flex gap-2 mb-4">
              <form onSubmit={handleSearch} className="flex flex-1 gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                  <input
                    type="text"
                    placeholder="Enter Member ID (e.g. 101)"
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
                >
                  {loading ? '...' : 'Search'}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setIsScanning(!isScanning)}
                className={cn(
                  "p-3 rounded-xl border transition-all flex items-center justify-center",
                  isScanning 
                    ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30" 
                    : "bg-stone-50 dark:bg-stone-800 border-stone-100 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
                )}
                title="Scan QR Code"
              >
                <QrCode size={24} />
              </button>
            </div>

            {isScanning && (
              <div className="mb-6 overflow-hidden rounded-2xl border-2 border-dashed border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 p-2">
                <div id="qr-reader" className="w-full"></div>
                <p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-2">Scan Farmer ID QR Code</p>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {farmer && (
              <div className="mt-6 p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white dark:bg-stone-900 rounded-xl flex items-center justify-center border border-stone-100 dark:border-stone-800">
                    <Users className="text-stone-400 dark:text-stone-500" size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-900 dark:text-white">{farmer.name}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{farmer.village} • {farmer.cattleType}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {farmer && (
            <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">Calculation Summary</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <span className="text-sm text-stone-500 dark:text-stone-400">Rate per kg</span>
                  <span className="text-lg font-serif font-medium text-stone-900 dark:text-white">₹{(calculated.rate || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl">
                  <span className="text-sm opacity-70">Total Amount</span>
                  <span className="text-2xl font-serif font-medium">₹{(calculated.amount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Entry Form */}
        <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">2. Collection Details</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Milk Type</label>
                <select
                  value={formData.milkType}
                  onChange={(e) => setFormData({ ...formData, milkType: e.target.value as any })}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                >
                  <option value="Cow">Cow</option>
                  <option value="Buffalo">Buffalo</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Quantity (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none font-mono dark:text-white"
                  placeholder="0.0"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">FAT %</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={formData.fat}
                  onChange={(e) => setFormData({ ...formData, fat: e.target.value })}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none font-mono dark:text-white"
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">SNF %</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={formData.snf}
                  onChange={(e) => setFormData({ ...formData, snf: e.target.value })}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none font-mono dark:text-white"
                  placeholder="8.5"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">CLR</label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.clr}
                  onChange={(e) => setFormData({ ...formData, clr: e.target.value })}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none font-mono dark:text-white"
                  placeholder="28"
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={!farmer || loading || !formData.quantity || !formData.fat}
                className={cn(
                  "w-full py-4 rounded-2xl font-medium flex items-center justify-center gap-2 transition-all",
                  success 
                    ? "bg-emerald-500 text-white" 
                    : "bg-stone-900 dark:bg-white text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-100 disabled:opacity-50"
                )}
              >
                {success ? (
                  <>
                    <CheckCircle2 size={20} />
                    Entry Saved Successfully
                  </>
                ) : (
                  <>
                    <Calculator size={20} />
                    {loading ? 'Saving...' : 'Save & Print Receipt'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bottom Section: Recent Transactions for Selected Date/Shift */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden mt-8">
        <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
          <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">
            Collection Transactions ({selectedShift} - {format(new Date(selectedDate), 'dd MMM yyyy')})
          </h2>
          <div className="text-sm text-stone-500 dark:text-stone-400">
            Total: ₹{transactions.reduce((acc, t) => acc + (t.amount || 0), 0).toFixed(2)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="py-4 px-6 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Time</th>
                <th className="py-4 px-6 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Farmer</th>
                <th className="py-4 px-6 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Milk</th>
                <th className="py-4 px-6 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Qty (kg)</th>
                <th className="py-4 px-6 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">FAT/SNF</th>
                <th className="py-4 px-6 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Rate</th>
                <th className="py-4 px-6 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider text-right">Amount</th>
                <th className="py-4 px-6 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
              {transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                  <td className="py-4 px-6 text-sm text-stone-500 dark:text-stone-400">
                    {txn.date ? format(new Date(txn.date), 'hh:mm a') : '...'}
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm font-medium text-stone-900 dark:text-white">{txn.farmerName}</div>
                    <div className="text-xs text-stone-400 dark:text-stone-500">ID: {txn.farmerId}</div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-[10px] font-medium uppercase tracking-wider",
                      txn.milkType === 'Cow' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    )}>
                      {txn.milkType}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-sm font-medium text-stone-900 dark:text-white">{(txn.quantity || 0).toFixed(1)}</td>
                  <td className="py-4 px-6 text-sm text-stone-500 dark:text-stone-400">{(txn.fat || 0).toFixed(1)} / {(txn.snf || 0).toFixed(1)}</td>
                  <td className="py-4 px-6 text-sm text-stone-500 dark:text-stone-400">₹{(txn.rate || 0).toFixed(2)}</td>
                  <td className="py-4 px-6 text-sm font-medium text-stone-900 dark:text-white text-right">₹{(txn.amount || 0).toFixed(2)}</td>
                  <td className="py-4 px-6 text-right print:hidden">
                    <button 
                      onClick={() => handlePrint(txn)}
                      className="p-2 text-stone-400 hover:text-stone-900 transition-colors"
                    >
                      <Printer size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400 dark:text-stone-500 italic">
                    No transactions recorded for this shift.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
  );
}
