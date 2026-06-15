import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';
import { LedgerEntry, Farmer } from '../types';
import { format } from 'date-fns';
import { 
  BookOpen, Search, Filter, ArrowUpRight, ArrowDownLeft, 
  User, Download, RefreshCw, ShoppingCart, DollarSign, Wallet,
  Calendar, CheckCircle2, MessageSquare, AlertCircle, Users, Scale
} from 'lucide-react';
import { cn } from '../lib/utils';
import { paymentApi, farmerApi, saleApi } from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function Ledger() {
  const { t, language } = useLanguage();
  const { handleError } = useErrorHandler();
  
  // Tab State: 'farmers' | 'customers'
  const [activeLedgerType, setActiveLedgerType] = useState<'farmers' | 'customers'>('farmers');
  
  // Loading & Base States
  const [loading, setLoading] = useState(true);
  const [farmersList, setFarmersList] = useState<Farmer[]>([]);
  const [farmersMap, setFarmersMap] = useState<Record<string, string>>({});
  
  // Farmer Ledger states
  const [farmerEntries, setFarmerEntries] = useState<LedgerEntry[]>([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState<string>('');
  const [farmerSearchTerm, setFarmerSearchTerm] = useState('');
  const [farmerFilterType, setFarmerFilterType] = useState<'All' | 'Credit' | 'Debit'>('All');

  // Customer Ledger states
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerFilterType, setCustomerFilterType] = useState<'All' | 'Sale' | 'Payment'>('All');
  const [loadingCustomerHistory, setLoadingCustomerHistory] = useState(false);

  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        setLoading(true);
        // Load Farmers
        const farmersRes = await farmerApi.getAll();
        const fList = farmersRes.data || [];
        setFarmersList(fList);
        const fMap: Record<string, string> = {};
        fList.forEach((f: Farmer) => {
          fMap[f.id] = f.name;
        });
        setFarmersMap(fMap);

        // Load Customers
        const customersRes = await saleApi.getCustomers();
        setCustomers(customersRes.data || []);

        // Load Farmer Ledger Entries
        const ledgerRes = await paymentApi.getLedger();
        setFarmerEntries(ledgerRes.data || []);
      } catch (error) {
        handleError(error, "Failed to fetch ledger base data");
      } finally {
        setLoading(false);
      }
    };

    fetchBaseData();
  }, []);

  // Fetch customer history when selected customer changes
  useEffect(() => {
    if (selectedCustomerId) {
      const fetchHistory = async () => {
        try {
          setLoadingCustomerHistory(true);
          const res = await saleApi.getCustomerHistory(selectedCustomerId);
          setCustomerHistory(res.data || []);
        } catch (err) {
          handleError(err, "Failed to load customer history");
        } finally {
          setLoadingCustomerHistory(false);
        }
      };
      fetchHistory();
    } else {
      setCustomerHistory([]);
    }
  }, [selectedCustomerId]);

  // Farmer Ledger Filtering
  const filteredFarmerEntries = farmerEntries.filter(entry => {
    const farmerName = farmersMap[entry.farmerId] || 'Unknown Farmer';
    const matchesFarmerSelector = !selectedFarmerId || entry.farmerId === selectedFarmerId;
    const matchesSearch = farmerName.toLowerCase().includes(farmerSearchTerm.toLowerCase()) || 
                          (entry.description || '').toLowerCase().includes(farmerSearchTerm.toLowerCase());
    const matchesFilter = farmerFilterType === 'All' || (entry.type || '').toLowerCase() === farmerFilterType.toLowerCase();
    
    return matchesFarmerSelector && matchesSearch && matchesFilter;
  });

  // Calculate Farmer Stats if a specific farmer is chosen
  const selectedFarmerObj = farmersList.find(f => f.id === selectedFarmerId);
  const farmerStats = React.useMemo(() => {
    if (!selectedFarmerId) return null;
    const entries = farmerEntries.filter(e => e.farmerId === selectedFarmerId);
    const totalEarned = entries.filter(e => e.type.toLowerCase() === 'credit').reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalPaid = entries.filter(e => e.type.toLowerCase() === 'debit').reduce((sum, e) => sum + (e.amount || 0), 0);
    return {
      totalEarned,
      totalPaid,
      balance: selectedFarmerObj?.balance ?? (totalEarned - totalPaid)
    };
  }, [selectedFarmerId, farmerEntries, selectedFarmerObj]);

  // Customer Ledger Filtering & Mapping running balances
  const runningBalanceHistory = React.useMemo(() => {
    // Chronological running balance calculation (oldest to newest)
    const sortedAsc = [...customerHistory].sort((a, b) => new Date(a.date || a.timestamp || a.createdAt).getTime() - new Date(b.date || b.timestamp || b.createdAt).getTime());
    let currentBal = 0;
    
    const mapped = sortedAsc.map(item => {
      if (item.entryType === 'sale') {
        const isCredit = item.paymentMode === 'Credit';
        if (isCredit) {
          currentBal += item.amount;
        }
      } else if (item.entryType === 'payment') {
        currentBal -= item.amount;
      }
      return {
        ...item,
        runningBalance: currentBal
      };
    });

    // Return descending for UI listing (newest first)
    return mapped.sort((a, b) => new Date(b.date || b.timestamp || b.createdAt).getTime() - new Date(a.date || a.timestamp || a.createdAt).getTime());
  }, [customerHistory]);

  const filteredCustomerHistory = runningBalanceHistory.filter(item => {
    const matchesSearch = (item.notes || '').toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                          (item.milkType || '').toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                          (item.customerName || '').toLowerCase().includes(customerSearchTerm.toLowerCase());
    const matchesFilter = customerFilterType === 'All' || 
                          (customerFilterType === 'Sale' && item.entryType === 'sale') ||
                          (customerFilterType === 'Payment' && item.entryType === 'payment');
    return matchesSearch && matchesFilter;
  });

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);

  // Stats calculation for Customer
  const customerStats = React.useMemo(() => {
    if (!selectedCustomerId) return null;
    const sales = customerHistory.filter(item => item.entryType === 'sale');
    const payments = customerHistory.filter(item => item.entryType === 'payment');
    
    const totalSalesVal = sales.reduce((sum, item) => sum + item.amount, 0);
    const totalPaidVal = payments.reduce((sum, item) => sum + item.amount, 0);
    return {
      totalSales: totalSalesVal,
      totalPaid: totalPaidVal,
      balance: selectedCustomerObj?.balance ?? (totalSalesVal - totalPaidVal)
    };
  }, [selectedCustomerId, customerHistory, selectedCustomerObj]);

  return (
    <div className="space-y-6">
      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">
            {language === 'hi' ? 'वित्तीय लेजर' : 'Financial Ledger'}
          </h1>
          <p className="text-stone-500 dark:text-stone-400">
            {language === 'hi' ? 'किसानों और ग्राहकों के सभी लेन-देन और शेष राशि देखें' : 'View financial statement ledger for both Farmers and Customers'}
          </p>
        </div>
        
        <button className="flex items-center gap-2 bg-white dark:bg-stone-900 px-4 py-2 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all">
          <Download size={18} />
          {language === 'hi' ? 'पीडीएफ डाउनलोड' : 'Export PDF'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-stone-100/80 dark:bg-stone-800/50 rounded-2xl max-w-md border border-stone-100 dark:border-stone-800">
        <button
          onClick={() => setActiveLedgerType('farmers')}
          className={cn(
            "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2",
            activeLedgerType === 'farmers'
              ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm"
              : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          )}
        >
          <Users size={16} />
          {language === 'hi' ? 'किसानों का लेजर' : 'Farmer Ledger'}
        </button>
        <button
          onClick={() => setActiveLedgerType('customers')}
          className={cn(
            "flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2",
            activeLedgerType === 'customers'
              ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm"
              : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          )}
        >
          <ShoppingCart size={16} />
          {language === 'hi' ? 'ग्राहकों का लेजर' : 'Customer Ledger'}
        </button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm p-12 text-center">
          <RefreshCw className="w-8 h-8 text-stone-300 animate-spin mx-auto mb-2" />
          <p className="text-stone-400 text-sm">Loading ledger databases...</p>
        </div>
      ) : activeLedgerType === 'farmers' ? (
        /* Farmer Ledger Tab Content */
        <div className="space-y-6">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-4 space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Select Farmer (Farmer Wise)</label>
              <select
                value={selectedFarmerId}
                onChange={(e) => setSelectedFarmerId(e.target.value)}
                className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl outline-none focus:ring-1 focus:ring-stone-400 text-stone-900 dark:text-white"
              >
                <option value="">{language === 'hi' ? 'सभी किसान' : 'All Farmers / General'}</option>
                {farmersList.map(f => (
                  <option key={f.id} value={f.id}>{f.farmerId || f.id} - {f.name} ({f.village})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-5 space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Search Transactions</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <input
                  type="text"
                  placeholder={language === 'hi' ? 'विवरण खोजें...' : 'Search description or farmer name...'}
                  value={farmerSearchTerm}
                  onChange={(e) => setFarmerSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl outline-none text-stone-900 dark:text-white placeholder-stone-400"
                />
              </div>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Type Filter</label>
              <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-xl">
                {(['All', 'Credit', 'Debit'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFarmerFilterType(type)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
                      farmerFilterType === type 
                        ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" 
                        : "text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                    )}
                  >
                    {type === 'Credit' ? (language === 'hi' ? 'क्रेडिट' : 'Credit') : type === 'Debit' ? (language === 'hi' ? 'डेबिट' : 'Debit') : (language === 'hi' ? 'सभी' : 'All')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Individual Farmer Summary Cards */}
          {selectedFarmerId && farmerStats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm flex items-center justify-between">
                <div>
                  <span className="block text-xs font-medium text-stone-400 uppercase tracking-wider">Total Supply Earnings</span>
                  <span className="block text-2xl font-serif font-bold text-emerald-600 dark:text-emerald-400 mt-1">₹{farmerStats.totalEarned.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                  <ArrowUpRight size={24} />
                </div>
              </div>

              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm flex items-center justify-between">
                <div>
                  <span className="block text-xs font-medium text-stone-400 uppercase tracking-wider">Total Payments Settled</span>
                  <span className="block text-2xl font-serif font-bold text-red-600 dark:text-red-400 mt-1">₹{farmerStats.totalPaid.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-2xl">
                  <ArrowDownLeft size={24} />
                </div>
              </div>

              <div className="bg-stone-900 dark:bg-stone-800 p-6 rounded-3xl border border-stone-800 text-white shadow-sm flex items-center justify-between">
                <div>
                  <span className="block text-xs font-medium text-stone-400 uppercase tracking-wider">Outstanding Balance Due</span>
                  <span className="block text-2xl font-serif font-bold mt-1">₹{farmerStats.balance.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-white/10 text-white rounded-2xl">
                  <Wallet size={24} />
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-4 bg-stone-50/50 dark:bg-stone-800/10 border-b border-stone-50 dark:border-stone-800 flex justify-between items-center">
              <span className="text-xs font-bold text-stone-500 uppercase">
                {language === 'hi' ? `किसानों के लेन-देन (${filteredFarmerEntries.length})` : `Farmer Wise Transactions (${filteredFarmerEntries.length})`}
              </span>
            </div>
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
                  {filteredFarmerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-stone-400 italic">No ledger entries found</td>
                    </tr>
                  ) : (
                    filteredFarmerEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-stone-900 dark:text-white">
                              {format(new Date(entry.date), 'MMM dd, yyyy')}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {format(new Date(entry.date), 'hh:mm a')}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-500 font-bold">
                              {farmersMap[entry.farmerId]?.charAt(0) || 'F'}
                            </div>
                            <span className="text-sm font-medium text-stone-900 dark:text-white">
                              {farmersMap[entry.farmerId] || 'Unknown Farmer'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-stone-600 dark:text-stone-300">{entry.description}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className={cn(
                            "flex items-center justify-end gap-1 font-bold text-sm",
                            (entry.type || '').toLowerCase() === 'credit' ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {(entry.type || '').toLowerCase() === 'credit' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                            <span>₹{(entry.amount || 0).toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-mono font-medium text-stone-900 dark:text-white">
                            ₹{(entry.balanceAfter || 0).toFixed(2)}
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
      ) : (
        /* Customer Ledger Tab Content */
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-4 space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Select Customer (Customer Wise)</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl outline-none focus:ring-1 focus:ring-stone-400 text-stone-900 dark:text-white"
              >
                <option value="">{language === 'hi' ? '--- ग्राहक चुनें ---' : '--- Choose a Customer ---'}</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.village || 'N/A'})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-5 space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Search History</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <input
                  type="text"
                  placeholder={language === 'hi' ? 'नोट्स या दूध का प्रकार खोजें...' : 'Search by notes, milk type...'}
                  value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  disabled={!selectedCustomerId}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl outline-none text-stone-900 dark:text-white placeholder-stone-400 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Type Filter</label>
              <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-xl">
                {(['All', 'Sale', 'Payment'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setCustomerFilterType(type)}
                    disabled={!selectedCustomerId}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50",
                      customerFilterType === type 
                        ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm" 
                        : "text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                    )}
                  >
                    {type === 'Sale' ? (language === 'hi' ? 'दूध बिक्री' : 'Milk Sale') : type === 'Payment' ? (language === 'hi' ? 'भुगतान' : 'Payment') : (language === 'hi' ? 'सभी' : 'All')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!selectedCustomerId ? (
            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-stone-100 dark:bg-stone-800 text-stone-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search size={28} />
              </div>
              <p className="font-bold text-stone-700 dark:text-stone-300">
                {language === 'hi' ? 'कृपया ऊपर से ग्राहक चुनें' : 'Please Select a Customer'}
              </p>
              <p className="text-stone-400 text-xs mt-1">
                {language === 'hi' ? 'चयनित ग्राहक के विस्तृत दूध बिक्री एवं भुगतान के लेजर विवरण देखने के लिए।' : 'To load and calculate detailed ledger statements of milk sales and payment credits.'}
              </p>
            </div>
          ) : loadingCustomerHistory ? (
            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm p-12 text-center">
              <RefreshCw className="w-8 h-8 text-stone-300 animate-spin mx-auto mb-2" />
              <p className="text-stone-400 text-sm">Fetching chronological customer history...</p>
            </div>
          ) : (
            <>
              {/* Customer summary panel */}
              {customerStats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-medium text-stone-400 uppercase tracking-wider">Total Purchases</span>
                      <span className="block text-2xl font-serif font-bold text-stone-900 dark:text-white mt-1">₹{customerStats.totalSales.toFixed(2)}</span>
                    </div>
                    <div className="p-3 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-2xl">
                      <ShoppingCart size={24} />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-medium text-stone-400 uppercase tracking-wider font-bold">Total Paid</span>
                      <span className="block text-2xl font-serif font-bold text-emerald-600 dark:text-emerald-400 mt-1">₹{customerStats.totalPaid.toFixed(2)}</span>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                      <DollarSign size={24} />
                    </div>
                  </div>

                  <div className="bg-orange-500 text-white p-6 rounded-3xl shadow-sm flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-medium text-orange-200 uppercase tracking-wider font-bold">Current Debt / Balance</span>
                      <span className="block text-2xl font-serif font-bold mt-1">₹{customerStats.balance.toFixed(2)}</span>
                    </div>
                    <div className="p-3 bg-white/10 text-white rounded-2xl">
                      <AlertCircle size={24} />
                    </div>
                  </div>
                </div>
              )}

              {/* Customer history list */}
              <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden animate-in fade-in duration-300">
                <div className="p-4 bg-stone-50/50 dark:bg-stone-800/10 border-b border-stone-50 dark:border-stone-800 flex justify-between items-center">
                  <span className="text-xs font-bold text-stone-500 uppercase">
                    {language === 'hi' ? `${selectedCustomerObj?.name || 'ग्राहक'} का लेजर विवरण` : `${selectedCustomerObj?.name || 'Customer'}'s Historical Ledger Statement`}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border-b">
                    <thead>
                      <tr className="bg-stone-50/50 dark:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800">
                        <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Date & Time</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Type</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Transaction Details</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Notes</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Amount</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Debt Balance After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {filteredCustomerHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-stone-400 italic">No customer transactions matched your criteria</td>
                        </tr>
                      ) : (
                        filteredCustomerHistory.map((item, idx) => {
                          const isSale = item.entryType === 'sale';
                          return (
                            <tr key={item.id || idx} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-stone-900 dark:text-white">
                                    {format(new Date(item.date || item.timestamp || item.createdAt), 'MMM dd, yyyy')}
                                  </span>
                                  <span className="text-[10px] text-stone-400">
                                    {format(new Date(item.date || item.timestamp || item.createdAt), 'hh:mm a')}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block",
                                  isSale
                                    ? "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/30"
                                    : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/30"
                                )}>
                                  {isSale ? (language === 'hi' ? 'दूध बिक्री' : 'Milk Sale') : (language === 'hi' ? 'भुगतान प्राप्त' : 'Payment Recd')}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-stone-900 dark:text-white font-medium">
                                  {isSale ? (
                                    <span>
                                      {item.quantity} L {item.milkType} @ ₹{item.rate}/L
                                    </span>
                                  ) : (
                                    <span>Payment via {item.paymentMode || item.paymentMethod || 'Cash'}</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-stone-400">
                                  {isSale ? `Payment Status: ${item.paymentMode || 'Credit'}` : 'Receipt of clear dues'}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs text-stone-500 italic">
                                  {item.notes || '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className={cn(
                                  "font-bold text-sm",
                                  isSale
                                    ? (item.paymentMode === 'Credit' ? "text-orange-600" : "text-stone-900 dark:text-white")
                                    : "text-emerald-600"
                                )}>
                                  {isSale ? '+' : '-'} ₹{(item.amount || 0).toFixed(2)}
                                  {isSale && item.paymentMode !== 'Credit' && (
                                    <span className="block text-[10px] font-normal text-emerald-500 brightness-95">Paid Direct</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right text-sm font-mono font-bold text-stone-900 dark:text-white">
                                ₹{item.runningBalance.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
