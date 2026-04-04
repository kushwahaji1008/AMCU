import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { collection, addDoc, query, where, getDocs, Timestamp, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { Farmer, CollectionTransaction, RateChart } from '../types';
import { format } from 'date-fns';
import { Search, Milk, Calculator, Printer, CheckCircle2, AlertCircle, Users, ShieldAlert, Settings2, QrCode } from 'lucide-react';
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
    isManual: false,
    manualReason: '',
  });

  const [calculated, setCalculated] = useState({
    rate: 0,
    amount: 0,
  });

  const [rateCharts, setRateCharts] = useState<RateChart[]>([]);
  const [isShiftClosed, setIsShiftClosed] = useState(false);
  const shift = new Date().getHours() < 12 ? 'Morning' : 'Evening';

  useEffect(() => {
    const q = query(collection(db, 'rateCharts'), orderBy('fat', 'asc'), orderBy('snf', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRateCharts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RateChart)));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const today = new Date();
    const q = query(
      collection(db, 'shiftSummaries'),
      where('date', '==', format(today, 'yyyy-MM-dd')),
      where('shift', '==', shift)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIsShiftClosed(!snapshot.empty);
    });

    return () => unsubscribe();
  }, [shift]);

  // Rate calculation logic using RateChart from DB
  useEffect(() => {
    const qty = parseFloat(formData.quantity) || 0;
    const fat = parseFloat(formData.fat) || 0;
    const snf = parseFloat(formData.snf) || 0;

    if (qty > 0 && fat > 0) {
      // Find matching rate in chart
      // We look for the rate where fat and snf match (or are the closest lower values)
      const matchingRate = rateCharts
        .filter(r => r.milkType === formData.milkType && r.fat <= fat && r.snf <= snf)
        .sort((a, b) => (b.fat + b.snf) - (a.fat + a.snf))[0];

      let rate = matchingRate ? matchingRate.rate : 0;

      // Fallback if no rate found in chart
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
  }, [formData, rateCharts]);

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
      toast.error(`The ${shift} shift for today is already closed. No further entries allowed.`);
      return;
    }
    if (!farmer || !calculated.amount) return;

    setLoading(true);
    try {
      const txn: any = {
        timestamp: serverTimestamp(),
        shift: new Date().getHours() < 12 ? 'Morning' : 'Evening',
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
        isManual: formData.isManual,
        isApproved: formData.isManual ? false : true,
      };

      if (formData.isManual) {
        txn.manualReason = formData.manualReason;
      }

      await addDoc(collection(db, 'collections'), txn);
      
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
        setFormData({ quantity: '', fat: '', snf: '', clr: '', milkType: 'Cow', isManual: false, manualReason: '' });
      }, 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'collections');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Milk Collection</h1>
        <p className="text-stone-500 dark:text-stone-400">Record a new milk pour</p>
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
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isManual: !formData.isManual })}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                formData.isManual 
                  ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30" 
                  : "bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-100 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700"
              )}
            >
              <Settings2 size={14} />
              {formData.isManual ? 'Manual Mode ON' : 'Manual Entry'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {formData.isManual && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
                  <ShieldAlert size={18} />
                  Manual Entry Fallback Active
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                  Device integration bypassed. Please provide a reason. This entry will require supervisor approval before final settlement.
                </p>
                <select
                  required={formData.isManual}
                  value={formData.manualReason}
                  onChange={(e) => setFormData({ ...formData, manualReason: e.target.value })}
                  className="w-full p-2.5 bg-white dark:bg-stone-800 border border-amber-200 dark:border-amber-900/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:text-white"
                >
                  <option value="">Select Reason for Manual Entry</option>
                  <option value="Weighing Scale Offline">Weighing Scale Offline</option>
                  <option value="Milk Analyzer Error">Milk Analyzer Error</option>
                  <option value="Bluetooth Connection Failed">Bluetooth Connection Failed</option>
                  <option value="Device Calibration Required">Device Calibration Required</option>
                  <option value="Other">Other (Specify in notes)</option>
                </select>
              </div>
            )}
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
    </div>
  );
}
