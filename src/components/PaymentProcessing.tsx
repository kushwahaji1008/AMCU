import React, { useState, useEffect } from 'react';
import { CreditCard, Search, FileText, Calendar, DollarSign, CheckCircle2, User, ArrowRight, History, Wallet, IndianRupee } from 'lucide-react';
import { auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, Timestamp, serverTimestamp, getDocs } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Farmer, CollectionTransaction, Payment } from '../types';
import { recordTransaction } from '../lib/ledger';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function PaymentProcessing() {
  const { profile, db } = useAuth();
  const [searchId, setSearchId] = useState('');
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Check'>('Cash');
  const [reference, setReference] = useState('');

  useEffect(() => {
    setLoading(true);
    
    // Fetch all farmers
    const unsubscribeFarmers = onSnapshot(collection(db, 'farmers'), (snapshot) => {
      setFarmers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Farmer)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'farmers'));

    // Fetch all transactions (might be large, in real app we'd filter by date or use aggregations)
    const unsubscribeTxns = onSnapshot(collection(db, 'collections'), (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionTransaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'collections'));

    // Fetch all payments
    const unsubscribePayments = onSnapshot(query(collection(db, 'payments'), orderBy('timestamp', 'desc')), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'payments'));

    return () => {
      unsubscribeFarmers();
      unsubscribeTxns();
      unsubscribePayments();
    };
  }, []);

  const getFarmerBalance = (farmer: Farmer) => {
    return farmer.balance || 0;
  };

  const [showOverpayConfirm, setShowOverpayConfirm] = useState(false);

  const handleProcessPayment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!selectedFarmer || !paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Please select a farmer and enter a valid amount');
      return;
    }

    const amount = parseFloat(paymentAmount);
    const balance = getFarmerBalance(selectedFarmer);

    if (amount > balance + 0.01 && !showOverpayConfirm) {
      setShowOverpayConfirm(true);
      return;
    }

    setProcessing(true);
    try {
      const paymentData: Omit<Payment, 'id'> = {
        farmerId: selectedFarmer.farmerId,
        farmerName: selectedFarmer.name,
        amount: amount,
        method: paymentMethod,
        reference: reference,
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: serverTimestamp(),
        operatorId: profile?.uid || 'system',
        status: 'Completed',
        dairyId: profile?.dairyId || 'global'
      };

      const paymentRef = await addDoc(collection(db, 'payments'), paymentData);
      
      await recordTransaction(
        db,
        selectedFarmer.id,
        'Debit',
        amount,
        `Payment: ${paymentMethod}${reference ? ` (${reference})` : ''}`,
        paymentRef.id
      );
      
      toast.success(`Payment of ₹${amount} processed for ${selectedFarmer.name}`);
      setPaymentAmount('');
      setReference('');
      setSelectedFarmer(null);
      setShowOverpayConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'payments');
    } finally {
      setProcessing(false);
    }
  };

  const filteredFarmers = farmers.filter(f => 
    f.name.toLowerCase().includes(searchId.toLowerCase()) || 
    f.farmerId.includes(searchId)
  ).filter(f => (f.balance || 0) > 0 || searchId !== '');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Payment Processing</h1>
          <p className="text-stone-500 dark:text-stone-400">Process payments to farmers for milk collection</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Farmer Selection & Payment Form */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">1. Select Farmer</h2>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="text"
                  placeholder="Search Farmer..."
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                />
              </div>
              
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {filteredFarmers.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFarmer(f)}
                    className={cn(
                      "w-full p-3 rounded-xl border text-left transition-all flex justify-between items-center",
                      selectedFarmer?.id === f.id 
                        ? "bg-stone-900 border-stone-900 text-white dark:bg-white dark:text-stone-900" 
                        : "bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800"
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium">{f.name}</p>
                      <p className={cn("text-xs", selectedFarmer?.id === f.id ? "opacity-70" : "text-stone-400")}>ID: {f.farmerId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold">₹{(f.balance || 0).toFixed(2)}</p>
                    </div>
                  </button>
                ))}
                {filteredFarmers.length === 0 && !loading && (
                  <p className="text-center text-sm text-stone-400 py-4">No farmers found with pending balance</p>
                )}
              </div>
            </div>
          </div>

          {selectedFarmer && (
            <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">2. Payment Details</h2>
              <form onSubmit={handleProcessPayment} className="space-y-4">
                <div className="p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">Farmer</span>
                    <span className="text-sm font-medium text-stone-900 dark:text-white">{selectedFarmer.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">Pending Balance</span>
                    <span className="text-lg font-mono font-bold text-stone-900 dark:text-white">₹{(getFarmerBalance(selectedFarmer) || 0).toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Amount to Pay (₹)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Cash', 'UPI', 'Check'] as const).map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-medium border transition-all",
                          paymentMethod === method 
                            ? "bg-stone-900 border-stone-900 text-white dark:bg-white dark:text-stone-900" 
                            : "bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800 text-stone-600 dark:text-stone-400"
                        )}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Reference (Optional)</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={paymentMethod === 'UPI' ? 'Transaction ID' : paymentMethod === 'Check' ? 'Check Number' : 'Notes'}
                    className="w-full px-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                  />
                </div>

                {showOverpayConfirm && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl space-y-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Warning: Payment amount (₹{paymentAmount}) exceeds pending balance (₹{(getFarmerBalance(selectedFarmer) || 0).toFixed(2)}).
                    </p>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => handleProcessPayment()}
                        className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
                      >
                        Confirm Anyway
                      </button>
                      <button 
                        type="button"
                        onClick={() => setShowOverpayConfirm(false)}
                        className="flex-1 py-2 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-lg text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showOverpayConfirm && (
                  <button
                    type="submit"
                    disabled={processing}
                    className="w-full py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors flex items-center justify-center gap-2"
                  >
                    {processing ? 'Processing...' : (
                      <>
                        <DollarSign size={20} />
                        Confirm Payment
                      </>
                    )}
                  </button>
                )}
              </form>
            </div>
          )}
        </div>

        {/* Right Column: Payment History */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <History size={20} className="text-stone-400" />
                <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Recent Payments</h2>
              </div>
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                {loading ? 'Loading...' : `Total ${payments.length} Records`}
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Farmer</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Reference</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-stone-500 dark:text-stone-400">
                        {p.timestamp instanceof Timestamp ? format(p.timestamp.toDate(), 'dd MMM yyyy') : p.date}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-stone-900 dark:text-white">{p.farmerName}</div>
                        <div className="text-xs text-stone-400">ID: {p.farmerId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-medium uppercase tracking-wider",
                          p.method === 'Cash' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20" :
                          p.method === 'UPI' ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20" :
                          "bg-amber-50 text-amber-600 dark:bg-amber-900/20"
                        )}>
                          {p.method}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-500 dark:text-stone-400 truncate max-w-[150px]">
                        {p.reference || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono font-bold text-stone-900 dark:text-white text-right">
                        ₹{(p.amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-stone-400 dark:text-stone-500 italic">
                        No payment records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
