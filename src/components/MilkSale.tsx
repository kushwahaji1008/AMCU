import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  UserPlus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  History, 
  Loader2, 
  MessageSquare,
  ArrowRight,
  TrendingUp,
  User,
  Plus,
  X
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { saleApi } from '../services/api';
import { Customer, MilkSale as MilkSaleType } from '../types';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useLanguage } from '../LanguageContext';

export const MilkSale: React.FC = () => {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'sale' | 'payment'>('sale');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recentSales, setRecentSales] = useState<MilkSaleType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Sale Form State
  const [milkType, setMilkType] = useState<'Cow' | 'Buffalo' | 'Mixed'>('Mixed');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Credit' | 'UPI'>('Cash');
  const [notes, setNotes] = useState('');

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');
  
  // New Customer Modal State
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    mobile: '',
    village: '',
    type: 'Individual' as 'Individual' | 'Commercial'
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerHistory(selectedCustomer.id);
    } else {
      setCustomerHistory([]);
    }
  }, [selectedCustomer]);

  const fetchCustomerHistory = async (id: string) => {
    try {
      setLoadingHistory(true);
      const res = await saleApi.getCustomerHistory(id);
      setCustomerHistory(res.data || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [custRes, salesRes] = await Promise.all([
        saleApi.getCustomers(),
        saleApi.getRecent(10)
      ]);
      setCustomers(Array.isArray(custRes.data) ? custRes.data : []);
      setRecentSales(Array.isArray(salesRes.data) ? salesRes.data : []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.mobile.includes(searchTerm)
  );

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return;
    }
    
    if (!quantity || !rate) {
      toast.error('Please enter quantity and rate');
      return;
    }

    try {
      setLoading(true);
      const amount = parseFloat(quantity) * parseFloat(rate);
      
      const payload = {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerMobile: selectedCustomer.mobile,
        milkType,
        quantity: parseFloat(quantity),
        rate: parseFloat(rate),
        amount,
        paymentMode,
        notes,
        date: new Date().toISOString(),
        operatorId: profile?.uid,
        dairyId: profile?.dairyId
      };

      await saleApi.recordSale(payload);
      toast.success('Sale recorded successfully! Message sent.');
      
      // Reset form
      setQuantity('');
      setSelectedCustomer(null);
      setSearchTerm('');
      setNotes('');
      
      // Refresh list
      fetchData();
    } catch (err) {
      toast.error('Failed to record sale');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return;
    }
    if (!paymentAmount) {
      toast.error('Please enter amount');
      return;
    }

    try {
      setLoading(true);
      await saleApi.recordPayment({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        amount: parseFloat(paymentAmount),
        paymentMode: paymentMethod,
        notes,
        date: new Date().toISOString(),
        operatorId: profile?.uid,
        dairyId: profile?.dairyId
      });
      toast.success('Payment recorded and balance updated!');
      setPaymentAmount('');
      setSelectedCustomer(null);
      setNotes('');
      fetchData();
    } catch (err) {
      toast.error('Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const payload = {
        ...newCustomer,
        status: 'Active',
        dairyId: profile?.dairyId
      };
      await saleApi.createCustomer(payload);
      toast.success('Customer added successfully');
      setShowNewCustomerModal(false);
      setNewCustomer({ name: '', mobile: '', village: '', type: 'Individual' });
      fetchData();
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to add customer';
      toast.error(errorMsg);
      console.error('Add customer error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white uppercase tracking-tight">{t('milkSales')}</h1>
          <p className="text-stone-500 text-sm mt-1">Manage sales and collect payments from customers</p>
        </div>
        <div className="flex gap-3">
          <div className="flex p-1 bg-stone-100 dark:bg-stone-800 rounded-full mr-4">
            <button 
              onClick={() => setActiveTab('sale')}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold transition-all",
                activeTab === 'sale' ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" : "text-stone-400"
              )}
            >
              {t('recordSale').toUpperCase()}
            </button>
            <button 
              onClick={() => setActiveTab('payment')}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold transition-all",
                activeTab === 'payment' ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" : "text-stone-400"
              )}
            >
              {t('collectPayment').toUpperCase()}
            </button>
          </div>
          <button 
            onClick={() => setShowNewCustomerModal(true)}
            className="flex items-center gap-2 bg-stone-900 dark:bg-white text-white dark:text-stone-900 px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            Add New
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sale/Payment Entry Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-[2.5rem] p-8">
            {activeTab === 'sale' ? (
              <form onSubmit={handleSaleSubmit} className="space-y-6">
                {/* Customer Search & Select */}
                <div className="space-y-4">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Select Customer for Sale</label>
                  {!selectedCustomer ? (
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 bg-stone-100 dark:bg-stone-800 rounded-lg text-stone-300 group-focus-within:text-stone-900 dark:group-focus-within:text-white transition-colors">
                        <Search className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search by name, mobile or village..."
                        className="w-full pl-14 pr-4 py-5 bg-stone-50 dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-[1.5rem] focus:outline-none focus:ring-4 focus:ring-stone-900/5 transition-all text-stone-900 dark:text-white font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && filteredCustomers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-[2rem] shadow-2xl z-50 max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 p-2">
                          {filteredCustomers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(c);
                                setSearchTerm('');
                              }}
                              className="w-full p-4 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800 rounded-2xl transition-colors text-left group"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center font-serif font-bold text-stone-900 dark:text-white group-hover:bg-stone-200 dark:group-hover:bg-stone-700 transition-colors">
                                  {c.name.charAt(0)}
                                </div>
                                <div>
                                  <span className="block font-bold text-stone-900 dark:text-white">{c.name}</span>
                                  <span className="text-xs text-stone-400 font-medium">{c.mobile} • {c.village}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Balance</span>
                                <span className="font-serif font-bold text-stone-900 dark:text-white">₹{c.balance?.toFixed(2)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-6 bg-stone-900 dark:bg-white rounded-[2rem] text-white dark:text-stone-900 shadow-xl animate-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-stone-800 dark:bg-stone-100 flex items-center justify-center font-serif font-bold text-xl text-stone-200 dark:text-stone-900">
                          {selectedCustomer.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-none mb-1">{selectedCustomer.name}</h3>
                          <p className="opacity-60 text-xs font-medium">{selectedCustomer.mobile} • {selectedCustomer.village}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right px-4 border-r border-white/10 dark:border-stone-100">
                          <span className="block text-[10px] font-bold opacity-40 uppercase tracking-widest">Selected Balance</span>
                          <span className="font-serif font-bold text-lg">₹{selectedCustomer.balance?.toFixed(2)}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setSelectedCustomer(null)} 
                          className="p-3 hover:bg-white/10 dark:hover:bg-stone-100 rounded-full transition-colors text-white/40 dark:text-stone-900/40 hover:text-white dark:hover:text-stone-900"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Milk Type</label>
                    <div className="flex p-1 bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 rounded-2xl">
                      {(['Cow', 'Buffalo', 'Mixed'] as const).map((type) => (
                        <button key={type} type="button" onClick={() => setMilkType(type)} className={cn("flex-1 py-3 text-sm font-bold rounded-xl transition-all", milkType === type ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" : "text-stone-400")}>{type}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Payment Mode</label>
                    <div className="flex p-1 bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 rounded-2xl">
                    {(['Cash', 'Credit', 'UPI'] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => setPaymentMode(mode)} className={cn("flex-1 py-3 text-sm font-bold rounded-xl transition-all", paymentMode === mode ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" : "text-stone-400")}>{mode}</button>
                    ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Quantity (L)</label>
                    <input type="number" step="0.1" required className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-2xl" value={quantity} onChange={e => setQuantity(e.target.value)} />
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Rate (₹/L)</label>
                    <input type="number" step="0.5" required className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-2xl" value={rate} onChange={e => setRate(e.target.value)} />
                  </div>
                </div>

                {quantity && rate && (
                  <div className="p-6 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-700">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-stone-400 font-bold uppercase">Total Sale Amount</span>
                      <span className="text-2xl font-serif font-bold">₹{(parseFloat(quantity) * parseFloat(rate)).toFixed(2)}</span>
                    </div>
                    {paymentMode === 'Credit' && (
                      <div className="mt-2 text-xs text-orange-500 font-bold uppercase flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Will add to customer debt (Due)
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" disabled={loading} className="w-full py-5 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-[2rem] font-bold shadow-xl flex items-center justify-center gap-3">
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ShoppingCart className="w-6 h-6" />}
                  Record {paymentMode === 'Credit' ? 'Due' : 'Paid'} Sale
                </button>
              </form>
            ) : (
              <form onSubmit={handlePaymentSubmit} className="space-y-6">
                {/* Payment Form */}
                <div className="space-y-4">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Select Customer to Pay</label>
                  {!selectedCustomer ? (
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 bg-stone-100 dark:bg-stone-800 rounded-lg text-stone-300 group-focus-within:text-stone-900 dark:group-focus-within:text-white transition-colors">
                        <Search className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search for customer paying dues..."
                        className="w-full pl-14 pr-4 py-5 bg-stone-50 dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-[1.5rem] focus:outline-none focus:ring-4 focus:ring-stone-900/5 transition-all text-stone-900 dark:text-white font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && filteredCustomers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-[2rem] shadow-2xl z-50 max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 p-2">
                          {filteredCustomers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(c);
                                setSearchTerm('');
                              }}
                              className="w-full p-4 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800 rounded-2xl transition-colors text-left group"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center font-serif font-bold text-stone-900 dark:text-white group-hover:bg-stone-200 dark:group-hover:bg-stone-700 transition-colors">
                                  {c.name.charAt(0)}
                                </div>
                                <div>
                                  <span className="block font-bold text-stone-900 dark:text-white">{c.name}</span>
                                  <span className="text-xs text-stone-400 font-medium">{c.mobile} • {c.village}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Balance</span>
                                <span className="font-serif font-bold text-orange-600 dark:text-orange-400">₹{c.balance?.toFixed(2)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-6 bg-emerald-600 rounded-[2rem] text-white shadow-xl animate-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center font-serif font-bold text-xl text-white">
                          {selectedCustomer.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-none mb-1">{selectedCustomer.name}</h3>
                          <p className="opacity-70 text-xs font-medium">{selectedCustomer.mobile} • {selectedCustomer.village}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right px-4 border-r border-white/20">
                          <span className="block text-[10px] font-bold opacity-60 uppercase tracking-widest leading-none mb-1">Current Debt</span>
                          <span className="font-serif font-bold text-lg leading-none">₹{selectedCustomer.balance?.toFixed(2)}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setSelectedCustomer(null)} 
                          className="p-3 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Amount Received (₹)</label>
                    <input type="number" required placeholder="0.00" className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-2xl text-xl font-bold" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Payment Method</label>
                    <div className="flex p-1 bg-stone-50 dark:bg-stone-800/50 border rounded-2xl">
                    {(['Cash', 'UPI', 'Bank Transfer'] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => setPaymentMethod(mode)} className={cn("flex-1 py-3 text-xs font-bold rounded-xl transition-all", paymentMethod === mode ? "bg-white dark:bg-stone-700 text-stone-900 shadow-sm" : "text-stone-400")}>{mode.split(' ')[0]}</button>
                    ))}
                    </div>
                  </div>
                </div>

                {selectedCustomer && paymentAmount && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 rounded-2xl">
                    <span className="block text-[10px] text-green-600 font-bold uppercase mb-1">New Balance Preview</span>
                    <span className="text-lg font-bold">₹{selectedCustomer.balance?.toFixed(2)} → <span className="text-green-600">₹{(selectedCustomer.balance - parseFloat(paymentAmount || '0')).toFixed(2)}</span></span>
                  </div>
                )}

                <button type="submit" disabled={loading} className="w-full py-5 bg-green-600 text-white rounded-[2rem] font-bold shadow-xl hover:bg-green-700 flex items-center justify-center gap-3 transition-colors">
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                  Submit Payment
                </button>
              </form>
            )}
          </div>

          {/* Customer History Ledger (Shown when customer selected) */}
          {selectedCustomer && (
            <div className="glass-card rounded-[2.5rem] p-8 animate-in slide-in-from-bottom-5 duration-300">
               <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-stone-100 dark:bg-stone-800 rounded-lg text-stone-900 dark:text-white">
                    <History className="w-5 h-5" />
                  </div>
                  <h2 className="font-serif font-bold text-xl text-stone-900 dark:text-white">{selectedCustomer.name}'s Ledger</h2>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Outsanding Dues</span>
                  <span className="text-xl font-serif font-bold text-orange-600 dark:text-orange-400">₹{selectedCustomer.balance?.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                {loadingHistory ? (
                  <div className="py-12 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-stone-300" />
                  </div>
                ) : customerHistory.length > 0 ? (
                  <div className="divide-y divide-stone-50 dark:divide-stone-800">
                    {customerHistory.map((item, idx) => (
                      <div key={idx} className="py-4 flex justify-between items-center group">
                        <div className="flex gap-4 items-center">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            item.entryType === 'sale' 
                              ? "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300" 
                              : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                          )}>
                            {item.entryType === 'sale' ? <ShoppingCart size={18} /> : <ArrowRight size={18} className="rotate-90" />}
                          </div>
                          <div>
                            <span className="block font-bold text-sm text-stone-900 dark:text-white">
                              {item.entryType === 'sale' ? `${item.quantity}L ${item.milkType} Milk` : `Debt Payment (${item.paymentMode})`}
                            </span>
                            <span className="text-[10px] text-stone-400 font-medium">
                              {format(new Date(item.date), 'dd MMM yyyy, hh:mm a')}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            "block font-serif font-bold text-base",
                            item.entryType === 'sale' ? "text-stone-900 dark:text-white" : "text-emerald-600 dark:text-emerald-400"
                          )}>
                            {item.entryType === 'sale' ? `+ ₹${item.amount.toFixed(2)}` : `- ₹${item.amount.toFixed(2)}`}
                          </span>
                          <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                            {item.entryType === 'sale' ? item.paymentStatus : 'Settled'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-stone-400">
                    <p className="text-sm">No transaction history found for this customer.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Recent Side Panel */}
        <div className="space-y-6">
          <div className="glass-card rounded-[2.5rem] p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-stone-100 dark:bg-stone-800 rounded-lg text-stone-900 dark:text-white">
                  <History className="w-5 h-5" />
                </div>
                <h2 className="font-serif font-bold text-xl text-stone-900 dark:text-white">Recent Sales</h2>
              </div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest bg-stone-50 dark:bg-stone-800 px-3 py-1 rounded-full">Last 10</span>
            </div>

            <div className="space-y-4">
              {recentSales.length > 0 ? (
                recentSales.map((sale) => (
                  <div key={sale.id} className="p-5 border border-stone-100 dark:border-stone-800 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                       <div>
                         <span className="block font-bold text-stone-900 dark:text-white group-hover:text-stone-950 dark:group-hover:text-white transition-colors">{sale.customerName}</span>
                         <span className="text-[10px] text-stone-400 font-medium">{format(new Date(sale.date), 'dd MMM, hh:mm a')}</span>
                       </div>
                       <span className="text-sm font-bold text-stone-900 dark:text-white">₹{sale.amount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs">
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 bg-stone-100 dark:bg-stone-700 rounded text-stone-500 dark:text-stone-300">{sale.quantity}L</span>
                        <span className="px-2 py-0.5 bg-stone-100 dark:bg-stone-700 rounded text-stone-500 dark:text-stone-300">{sale.milkType}</span>
                      </div>
                      <div className={cn(
                        "flex items-center gap-1 font-bold",
                        sale.messageStatus === 'Sent' ? "text-green-500" : "text-stone-400"
                      )}>
                        <CheckCircle2 className="w-3 h-3" />
                        SMS
                      </div>
                    </div>
                    {sale.notes && (
                      <div className="mt-3 p-2 bg-stone-50 dark:bg-stone-900 rounded-lg text-[10px] text-stone-500 italic">
                        "{sale.notes}"
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12 px-6">
                  <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <History className="w-6 h-6 text-stone-300" />
                  </div>
                  <p className="text-stone-400 text-sm">No sales recorded yet</p>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card rounded-[2.5rem] p-8 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 overflow-hidden relative">
            <div className="relative z-10">
              <TrendingUp className="w-8 h-8 mb-4 opacity-50" />
              <h3 className="font-serif font-bold text-2xl mb-2">Grow your dairy</h3>
              <p className="text-sm opacity-70 mb-6 leading-relaxed">Systematically track direct customer sales to manage your daily stock more efficiently.</p>
              <button 
                onClick={() => fetchData()}
                className="text-xs font-bold uppercase tracking-widest bg-white/10 dark:bg-stone-900/10 px-6 py-3 rounded-xl hover:bg-white/20 transition-colors"
                disabled={loading}
              >
                Refresh Data
              </button>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 dark:bg-stone-900/5 rounded-full blur-3xl animate-pulse" />
          </div>
        </div>
      </div>

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-950/40 backdrop-blur-md" onClick={() => setShowNewCustomerModal(false)} />
          <div className="relative bg-white dark:bg-stone-900 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl">
                  <UserPlus className="w-8 h-8 text-stone-900 dark:text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-stone-900 dark:text-white">Register Customer</h2>
                  <p className="text-stone-500 text-xs mt-1">Add a new client to the registry</p>
                </div>
              </div>

              <form onSubmit={handleAddCustomer} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Customer Name</label>
                  <input
                    type="text"
                    required
                    className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 rounded-2xl text-stone-900 dark:text-white"
                    placeholder="Full Name"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    pattern="[0-9]{10}"
                    className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 rounded-2xl text-stone-900 dark:text-white"
                    placeholder="10-digit number"
                    value={newCustomer.mobile}
                    onChange={(e) => setNewCustomer({...newCustomer, mobile: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Village / Area</label>
                  <input
                    type="text"
                    className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 rounded-2xl text-stone-900 dark:text-white"
                    placeholder="Location"
                    value={newCustomer.village}
                    onChange={(e) => setNewCustomer({...newCustomer, village: e.target.value})}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerModal(false)}
                    className="flex-1 py-4 text-stone-500 font-bold hover:bg-stone-50 dark:hover:bg-stone-800 rounded-2xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl font-bold transition-all hover:scale-105"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Register'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
