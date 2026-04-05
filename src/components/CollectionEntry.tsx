import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { collection, addDoc, query, where, getDocs, Timestamp, serverTimestamp, onSnapshot, orderBy, doc, runTransaction } from 'firebase/firestore';
import { Farmer, CollectionTransaction, RateChart, RateSettings } from '../types';
import { recordTransaction } from '../lib/ledger';
import { format } from 'date-fns';
import { Search, Milk, Calculator, Printer, CheckCircle2, AlertCircle, Users, QrCode } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { cn } from '../lib/utils';

export default function CollectionEntry() {
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

  useEffect(() => {
    const q = query(collection(db, 'rateCharts'), orderBy('fat', 'asc'), orderBy('snf', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRateCharts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RateChart)));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'rateSettings'), (snapshot) => {
      if (snapshot.exists()) {
        setRateSettings(snapshot.data() as RateSettings);
      } else {
        // Default settings if not found
        setRateSettings({
          fatMultiplier1: 3.96,
          snfMultiplier1: 2.64,
          fatMultiplier2: 7.77,
          snfDeductions: {
            '9.0': 0,
            '8.9': 0.5,
            '8.8': 1,
            '8.7': 1.5,
            '8.6': 2,
            '8.5': 2.5,
            '8.4': 3,
            '8.3': 3.5,
          },
          minFatForFormula1: 3.0,
          maxFatForFormula1: 6.0,
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'shiftSummaries'),
      where('date', '==', selectedDate),
      where('shift', '==', selectedShift)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const isManuallyClosed = !snapshot.empty;
      
      // Auto-close logic based on time
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const currentHour = now.getHours();
      
      let isExpired = false;
      if (selectedDate < today) {
        isExpired = true;
      } else if (selectedDate === today) {
        if (selectedShift === 'Morning' && currentHour >= 13) {
          isExpired = true;
        }
        // Evening shift technically closes at midnight, which becomes the next day (handled by selectedDate < today)
      }

      setIsShiftClosed(isManuallyClosed || isExpired);
    });

    return () => unsubscribe();
  }, [selectedDate, selectedShift]);

  useEffect(() => {
    // We need to filter by date. Since timestamp is a Firestore Timestamp, 
    // we need to calculate the start and end of the selected day.
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'collections'),
      where('shift', '==', selectedShift),
      where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
      where('timestamp', '<=', Timestamp.fromDate(endOfDay)),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CollectionTransaction[];
      setTransactions(docs);
    }, (err) => {
      console.error("Error fetching transactions:", err);
    });

    return () => unsubscribe();
  }, [selectedDate, selectedShift]);

  // Rate calculation logic using RateChart from DB or Formula
  useEffect(() => {
    const qty = parseFloat(formData.quantity) || 0;
    const fat = parseFloat(formData.fat) || 0;
    const snf = parseFloat(formData.snf) || 0;

    if (qty > 0 && fat > 0) {
      let rate = 0;

      if (rateSettings) {
        if (fat >= rateSettings.minFatForFormula1 && fat < rateSettings.maxFatForFormula1) {
          // Formula 1: Rate = fat * 3.96 + snf * 2.64
          rate = fat * rateSettings.fatMultiplier1 + snf * rateSettings.snfMultiplier1;
        } else {
          // Formula 2: Rate based on SNF deductions
          const snfKey = snf.toFixed(1);
          const deductionPercent = rateSettings.snfDeductions[snfKey];
          
          if (deductionPercent !== undefined) {
            // rate = fat * 7.77 - deduction%
            const baseRate = fat * rateSettings.fatMultiplier2;
            rate = baseRate * (1 - deductionPercent / 100);
          } else {
            // Fallback if SNF not in deduction list
            // Find closest lower SNF in the list
            const sortedSnfs = Object.keys(rateSettings.snfDeductions)
              .map(Number)
              .sort((a, b) => b - a);
            
            const closestSnf = sortedSnfs.find(s => s <= snf);
            if (closestSnf !== undefined) {
              const deductionPercent = rateSettings.snfDeductions[closestSnf.toFixed(1)];
              const baseRate = fat * rateSettings.fatMultiplier2;
              rate = baseRate * (1 - deductionPercent / 100);
            }
          }
        }
      }

      // If formula didn't result in a rate, check the chart
      if (!rate) {
        const matchingRate = rateCharts
          .filter(r => r.milkType === formData.milkType && r.fat !== undefined && r.snf !== undefined && r.fat <= fat && r.snf <= snf)
          .sort((a, b) => ((b.fat || 0) + (b.snf || 0)) - ((a.fat || 0) + (a.snf || 0)))[0];

        rate = matchingRate ? (matchingRate.rate || 0) : 0;
      }

      // Final fallback
      if (!rate) {
        const baseRate = formData.milkType === 'Cow' ? 35 : 45;
        const fatStd = formData.milkType === 'Cow' ? 3.5 : 6.0;
        rate = baseRate + (fat - fatStd) * 5 + (snf - 8.5) * 2;
      }
      
      setCalculated({
        rate: Math.max(rate, 20),
        amount: qty * Math.max(rate, 20),
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
      const q = query(collection(db, 'farmers'), where('farmerId', '==', searchId));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setError('Farmer not found');
      } else {
        const data = snapshot.docs[0].data() as Farmer;
        setFarmer({ ...data, id: snapshot.docs[0].id });
        setFormData(prev => ({ ...prev, milkType: data.cattleType }));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'farmers');
    } finally {
      setLoading(false);
    }
  };

  const fetchFarmerById = async (id: string) => {
    setLoading(true);
    setError(null);
    setFarmer(null);
    
    try {
      const q = query(collection(db, 'farmers'), where('farmerId', '==', id));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setError('Farmer not found');
        toast.error('Farmer not found');
      } else {
        const data = snapshot.docs[0].data() as Farmer;
        setFarmer({ ...data, id: snapshot.docs[0].id });
        setFormData(prev => ({ ...prev, milkType: data.cattleType }));
        setSearchId(id);
        toast.success(`Farmer ${data.name} identified`);
        setIsScanning(false);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'farmers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (isScanning) {
      // Small delay to ensure the DOM element is rendered
      const timer = setTimeout(() => {
        scanner = new Html5QrcodeScanner(
          "qr-reader",
          { fps: 10, qrbox: { width: 250, height: 250 } },
          /* verbose= */ false
        );

        scanner.render(
          (decodedText) => {
            fetchFarmerById(decodedText);
          },
          (error) => {
            // console.warn(error);
          }
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
    if (isShiftClosed) {
      toast.error(`The ${selectedShift} shift for ${selectedDate} is already closed. No further entries allowed.`);
      return;
    }
    if (!farmer || !calculated.amount) return;

    setLoading(true);
    try {
      // Create a timestamp that matches the selected date but current time
      const now = new Date();
      const entryDate = new Date(selectedDate);
      entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      const txn: any = {
        timestamp: Timestamp.fromDate(entryDate),
        shift: selectedShift,
        farmerId: farmer.farmerId,
        farmerName: farmer.name,
        milkType: formData.milkType,
        quantity: parseFloat(formData.quantity),
        fat: parseFloat(formData.fat),
        snf: parseFloat(formData.snf),
        clr: parseFloat(formData.clr) || 0,
        rate: calculated.rate,
        amount: calculated.amount,
        operatorId: auth.currentUser?.uid || 'unknown',
      };

      // Record in collections and update ledger atomically
      const txnRef = await addDoc(collection(db, 'collections'), txn);
      
      await recordTransaction(
        farmer.id,
        'Credit',
        txn.amount,
        `Milk Collection: ${txn.quantity}kg @ ₹${txn.rate}/kg (${txn.fat}% FAT, ${txn.snf}% SNF)`,
        txnRef.id
      );
      
      // Trigger Notification (Fire and Forget)
      if (farmer.mobile) {
        const message = `DugdhaSetu: ${farmer.name}, Milk Collection Recorded. Qty: ${txn.quantity}kg, FAT: ${txn.fat}%, Amount: ₹${txn.amount.toFixed(2)}. Thank you!`;
        
        const sendNotify = async (type: 'sms' | 'whatsapp') => {
          try {
            const res = await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mobile: farmer.mobile, message, type })
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || `Failed to send ${type}`);
            }
            if (data.simulated) {
              console.info(`[SIMULATION] ${type} notification simulated:`, data.message);
            }
          } catch (err: any) {
            const isConfigError = err.message.includes('credentials missing') || err.message.includes('not configured');
            
            if (isConfigError) {
              console.info(`${type} Notification skipped (Twilio not configured):`, err.message);
            } else {
              console.error(`${type} Notification failed:`, err);
              toast.error(`Notification failed: ${err.message}`, {
                id: 'notify-error' // prevent multiple toasts
              });
            }
          }
        };

        sendNotify('sms');
        sendNotify('whatsapp');
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setFarmer(null);
        setSearchId('');
        setFormData({ quantity: '', fat: '', snf: '', clr: '', milkType: 'Cow' });
      }, 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'collections');
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
                  <span className="text-lg font-serif font-medium text-stone-900 dark:text-white">₹{calculated.rate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl">
                  <span className="text-sm opacity-70">Total Amount</span>
                  <span className="text-2xl font-serif font-medium">₹{calculated.amount.toFixed(2)}</span>
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
            Total: ₹{transactions.reduce((acc, t) => acc + t.amount, 0).toFixed(2)}
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
                    {txn.timestamp instanceof Timestamp ? format(txn.timestamp.toDate(), 'hh:mm a') : '...'}
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
                  <td className="py-4 px-6 text-sm font-medium text-stone-900 dark:text-white">{txn.quantity.toFixed(1)}</td>
                  <td className="py-4 px-6 text-sm text-stone-500 dark:text-stone-400">{txn.fat.toFixed(1)} / {txn.snf.toFixed(1)}</td>
                  <td className="py-4 px-6 text-sm text-stone-500 dark:text-stone-400">₹{txn.rate.toFixed(2)}</td>
                  <td className="py-4 px-6 text-sm font-medium text-stone-900 dark:text-white text-right">₹{txn.amount.toFixed(2)}</td>
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
                {selectedTxn.timestamp instanceof Timestamp ? format(selectedTxn.timestamp.toDate(), 'dd/MM/yyyy HH:mm') : ''}
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
                <span className="font-bold">{selectedTxn.quantity.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between">
                <span>FAT:</span>
                <span className="font-bold">{selectedTxn.fat.toFixed(1)} %</span>
              </div>
              <div className="flex justify-between">
                <span>SNF:</span>
                <span className="font-bold">{selectedTxn.snf.toFixed(1)} %</span>
              </div>
              <div className="flex justify-between">
                <span>Rate:</span>
                <span className="font-bold">₹{selectedTxn.rate.toFixed(2)} /kg</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-1">
              <span className="font-bold uppercase">Total Amount:</span>
              <span className="text-xl font-serif font-bold">₹{selectedTxn.amount.toFixed(2)}</span>
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
