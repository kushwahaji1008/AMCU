import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  MessageSquare, 
  ArrowUpRight, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Filter,
  RefreshCw,
  Send,
  Smartphone
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { saleApi } from '../services/api';
import { Customer } from '../types';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useLanguage } from '../LanguageContext';
import { smsService } from '../services/smsService';

export default function DueManagement() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'High' | 'Low'>('All');
  const [sendingSms, setSendingSms] = useState<string | null>(null);

  useEffect(() => {
    fetchDues();
  }, []);

  const fetchDues = async () => {
    try {
      setLoading(true);
      const response = await saleApi.getCustomers();
      // Filter for only those who have a balance > 0
      const withDues = (response.data || []).filter((c: Customer) => (c.balance || 0) > 0);
      setCustomers(withDues.sort((a: Customer, b: Customer) => (b.balance || 0) - (a.balance || 0)));
    } catch (err) {
      toast.error('Failed to load customer dues');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendPaymentRequest = async (customer: Customer) => {
    if (!customer.mobile) {
      toast.error('Customer mobile number not found');
      return;
    }

    try {
      setSendingSms(customer.id);
      const message = `Dear ${customer.name}, this is a reminder regarding your outstanding milk due of Rs.${(customer.balance || 0).toFixed(2)}. Please settle the payment at your earliest convenience. Thank you. - DugdhaSetu`;
      
      const res = await smsService.sendDirectSMS(customer.mobile, message);
      if (res.success) {
        toast.success(`Request sent to ${customer.name}`);
      } else {
        toast.error(`Failed to send SMS: ${res.message}`);
      }
    } catch (err) {
      toast.error('Message delivery failed');
    } finally {
      setSendingSms(null);
    }
  };

  const filteredDues = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         c.mobile.includes(searchTerm);
    
    if (filterType === 'High') return matchesSearch && (c.balance || 0) > 1000;
    if (filterType === 'Low') return matchesSearch && (c.balance || 0) <= 1000;
    return matchesSearch;
  });

  const totalDueAmount = customers.reduce((acc, c) => acc + (c.balance || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white uppercase tracking-tight">Due Management</h1>
          <p className="text-stone-500 text-sm mt-1">Monitor outstanding customer payments and send reminders</p>
        </div>
        <button 
          onClick={fetchDues}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-xl font-medium text-stone-900 dark:text-white hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors shadow-sm"
        >
          <RefreshCw size={18} className={cn(loading && "animate-spin")} />
          Refresh Registry
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card rounded-[2rem] p-6 flex items-center gap-5">
          <div className="w-14 h-14 bg-orange-50 dark:bg-orange-950/30 rounded-2xl flex items-center justify-center text-orange-600 dark:text-orange-400">
            <DollarSign size={28} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Total Outstanding</span>
            <span className="text-2xl font-serif font-bold text-stone-900 dark:text-white">₹{totalDueAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="glass-card rounded-[2rem] p-6 flex items-center gap-5">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Users size={28} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Debtor Count</span>
            <span className="text-2xl font-serif font-bold text-stone-900 dark:text-white">{customers.length} Accounts</span>
          </div>
        </div>

        <div className="glass-card rounded-[2rem] p-6 flex items-center gap-5">
          <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Clock size={28} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Avg. Account Due</span>
            <span className="text-2xl font-serif font-bold text-stone-900 dark:text-white">
              ₹{customers.length > 0 ? Math.round(totalDueAmount / customers.length).toLocaleString() : 0}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filters Panel */}
        <div className="space-y-6">
          <div className="glass-card rounded-[2rem] p-6 sticky top-24">
            <h2 className="text-sm font-bold text-stone-900 dark:text-white uppercase tracking-widest mb-6 border-b border-stone-100 dark:border-stone-800 pb-4">Filters</h2>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Search Customer</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" size={16} />
                  <input 
                    type="text" 
                    placeholder="Name or Mobile..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">Due Intensity</label>
                <div className="space-y-2">
                  {(['All', 'High', 'Low'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all",
                        filterType === type 
                          ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-md translate-x-1" 
                          : "text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Filter size={14} />
                        {type === 'High' ? 'Critical (>₹1000)' : type === 'Low' ? 'Manageable (≤₹1000)' : 'All Accounts'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Dues Table */}
        <div className="lg:col-span-3">
          <div className="glass-card rounded-[2rem] overflow-hidden border border-stone-100 dark:border-stone-800">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center bg-stone-50/50 dark:bg-stone-800/30">
              <h2 className="font-serif font-bold text-lg text-stone-900 dark:text-white">Active Debtors Registry</h2>
              <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                {filteredDues.length} Customers with pending dues
              </span>
            </div>

            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {loading ? (
                <div className="p-20 text-center flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 animate-spin text-stone-300" />
                  <p className="text-sm font-bold text-stone-400 uppercase tracking-widest">Hydrating Registry...</p>
                </div>
              ) : filteredDues.length > 0 ? (
                filteredDues.map((customer) => (
                  <div key={customer.id} className="p-6 hover:bg-stone-50/50 dark:hover:bg-stone-800/20 transition-all group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center font-serif font-bold text-xl transition-all group-hover:scale-110 shadow-sm",
                          (customer.balance || 0) > 1000 
                            ? "bg-red-50 text-red-600 dark:bg-red-950/30" 
                            : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                        )}>
                          {customer.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-stone-900 dark:text-white leading-tight mb-1">{customer.name}</h3>
                          <div className="flex items-center gap-3 text-xs text-stone-400 font-medium">
                            <span className="flex items-center gap-1.5"><Smartphone size={12} /> {customer.mobile}</span>
                            <span className="w-1 h-1 bg-stone-200 dark:bg-stone-700 rounded-full" />
                            <span>{customer.village}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-8 justify-between md:justify-end">
                        <div className="text-right">
                          <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 px-1">Outstanding Balance</span>
                          <span className={cn(
                            "text-2xl font-serif font-bold leading-none",
                            (customer.balance || 0) > 1000 ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-white"
                          )}>
                            ₹{(customer.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <button
                          onClick={() => sendPaymentRequest(customer)}
                          disabled={!!sendingSms}
                          className="flex items-center gap-2 px-5 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl text-xs font-bold shadow-xl transition-all active:scale-95 disabled:opacity-50 hover:bg-stone-800 dark:hover:bg-white/90"
                        >
                          {sendingSms === customer.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Send size={16} />
                          )}
                          Send Request
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-20 text-center text-stone-400 italic">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No customer dues found matching your criteria</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
