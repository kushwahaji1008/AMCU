import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Farmer, CollectionTransaction, LedgerEntry } from '../types';
import { 
  User, Phone, MapPin, Milk, IndianRupee, Calendar, 
  ArrowLeft, TrendingUp, CreditCard, Activity,
  ChevronRight, Download, Printer, QrCode, Edit2, Trash2, X,
  History, ArrowUpRight, ArrowDownLeft, Wallet
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { format } from 'date-fns';
import { toDate } from '../firebase';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { farmerApi, collectionApi, paymentApi } from '../services/api';

export default function FarmerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { handleError } = useErrorHandler();
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'collections' | 'ledger'>('collections');
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editData, setEditData] = useState({
    farmerId: '',
    name: '',
    mobile: '',
    village: '',
    cattleType: 'Cow' as 'Cow' | 'Buffalo' | 'Mixed',
    bankAccount: '',
    ifsc: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const downloadBarcode = () => {
    if (!farmer) return;
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, farmer.farmerId, {
        format: "CODE128",
        lineColor: "#000",
        width: 2,
        height: 100,
        displayValue: true,
        fontSize: 20,
        margin: 10
      });

      const url = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.href = url;
      link.download = `Barcode_${farmer.farmerId}_${farmer.name.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Barcode for ${farmer.name} downloaded`);
    } catch (err) {
      console.error('Barcode generation failed:', err);
      toast.error('Failed to generate barcode');
    }
  };

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [farmerRes, ledgerRes] = await Promise.all([
        farmerApi.getById(id),
        paymentApi.getLedger()
      ]);
      
      setFarmer(farmerRes.data);
      
      // Filter ledger for this farmer
      const farmerLedger = ledgerRes.data.filter((entry: LedgerEntry) => entry.farmerId === farmerRes.data.id);
      setLedger(farmerLedger);
      
      // Fetch transactions for this farmer
      // Note: In a real app, we'd have a specific API for this
      const collectionsRes = await collectionApi.getReport(format(new Date(), 'yyyy-MM-dd'));
      const farmerCollections = collectionsRes.data.filter((c: any) => c.farmerId === farmerRes.data.id);
      setTransactions(farmerCollections);
      
    } catch (err) {
      handleError(err, 'Failed to fetch farmer details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleEditClick = () => {
    if (!farmer) return;
    setEditData({
      farmerId: farmer.farmerId,
      name: farmer.name,
      mobile: farmer.mobile,
      village: farmer.village,
      cattleType: farmer.cattleType,
      bankAccount: farmer.bankAccount || '',
      ifsc: farmer.ifsc || '',
    });
    setIsEditing(true);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!editData.farmerId.trim()) newErrors.farmerId = 'Member ID is required';
    if (!editData.name.trim()) newErrors.name = 'Full Name is required';
    if (!editData.village.trim()) newErrors.village = 'Village is required';
    
    const mobileRegex = /^[0-9]{10}$/;
    if (!editData.mobile.trim()) {
      newErrors.mobile = 'Mobile number is required';
    } else if (!mobileRegex.test(editData.mobile.trim())) {
      newErrors.mobile = 'Mobile number must be 10 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdateFarmer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !id) return;
    
    setSubmitting(true);
    try {
      await farmerApi.update(id, editData);
      setFarmer(prev => prev ? { ...prev, ...editData } : null);
      toast.success('Profile updated successfully!');
      setIsEditing(false);
    } catch (err) {
      handleError(err, 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFarmer = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await farmerApi.delete(id);
      toast.success('Farmer deleted successfully');
      navigate('/farmers');
    } catch (err) {
      handleError(err, 'Failed to delete farmer');
    } finally {
      setSubmitting(false);
    }
  };

  const stats = useMemo(() => {
    const totalQty = transactions.reduce((sum, t) => sum + t.quantity, 0);
    const totalAmt = transactions.reduce((sum, t) => sum + t.amount, 0);
    const avgFat = transactions.length > 0 
      ? transactions.reduce((sum, t) => sum + t.fat, 0) / transactions.length 
      : 0;
    
    return { totalQty, totalAmt, avgFat };
  }, [transactions]);

  const chartData = useMemo(() => {
    return [...transactions]
      .reverse()
      .slice(-15)
      .map(t => ({
        date: format(new Date(t.date), 'MMM dd'),
        qty: t.quantity,
        amt: t.amount
      }));
  }, [transactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-stone-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!farmer) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500">Farmer not found</p>
        <button onClick={() => navigate('/farmers')} className="mt-4 text-stone-900 font-medium hover:underline">
          Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/farmers')}
            className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} className="text-stone-600 dark:text-stone-400" />
          </button>
          <div>
            <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">{farmer.name}</h1>
            <p className="text-stone-500 dark:text-stone-400 flex items-center gap-2">
              <span className="font-mono text-xs bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded uppercase tracking-wider dark:text-stone-300">ID: {farmer.farmerId}</span>
              <button 
                onClick={downloadBarcode}
                className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
              >
                <Download size={10} />
                Download Barcode
              </button>
              • {farmer.village}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={downloadBarcode}
            className="p-3 border border-stone-100 dark:border-stone-800 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-stone-600 dark:text-stone-400"
            title="Download Barcode"
          >
            <QrCode size={20} />
          </button>
          <button className="p-3 border border-stone-100 dark:border-stone-800 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-stone-600 dark:text-stone-400">
            <Printer size={20} />
          </button>
          <button 
            onClick={() => setIsDeleting(true)}
            className="p-3 border border-red-100 dark:border-red-900/30 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
            title="Delete Farmer"
          >
            <Trash2 size={20} />
          </button>
          <button 
            onClick={handleEditClick}
            className="p-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
          >
            Edit Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats & Info */}
        <div className="space-y-8">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
              <Wallet className="text-stone-900 dark:text-white mb-3" size={24} />
              <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Pending Balance</p>
              <p className="text-xl font-serif font-medium text-stone-900 dark:text-white">₹{(farmer.balance || 0).toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
              <IndianRupee className="text-emerald-600 dark:text-emerald-400 mb-3" size={24} />
              <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Total Earned</p>
              <p className="text-xl font-serif font-medium text-stone-900 dark:text-white">₹{stats.totalAmt.toLocaleString()}</p>
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800">
              <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Information</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <Phone size={18} className="text-stone-400 dark:text-stone-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Mobile Number</p>
                  <p className="text-sm font-medium text-stone-900 dark:text-white">{farmer.mobile || 'Not provided'}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-2 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <Activity size={18} className="text-stone-400 dark:text-stone-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Cattle Type</p>
                  <p className="text-sm font-medium text-stone-900 dark:text-white">{farmer.cattleType}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-2 bg-stone-50 dark:bg-stone-800 rounded-xl">
                  <CreditCard size={18} className="text-stone-400 dark:text-stone-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Bank Details</p>
                  <p className="text-sm font-medium text-stone-900 dark:text-white">{farmer.bankAccount || 'No account linked'}</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500">{farmer.ifsc}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: History & Charts */}
        <div className="lg:col-span-2 space-y-8">
          {/* Tabs */}
          <div className="flex gap-4 border-b border-stone-100 dark:border-stone-800">
            <button
              onClick={() => setActiveTab('collections')}
              className={cn(
                "pb-4 text-sm font-medium transition-all relative",
                activeTab === 'collections' ? "text-stone-900 dark:text-white" : "text-stone-400"
              )}
            >
              Collection History
              {activeTab === 'collections' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-stone-900 dark:bg-white rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={cn(
                "pb-4 text-sm font-medium transition-all relative",
                activeTab === 'ledger' ? "text-stone-900 dark:text-white" : "text-stone-400"
              )}
            >
              Financial Ledger
              {activeTab === 'ledger' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-stone-900 dark:bg-white rounded-full" />}
            </button>
          </div>

          {activeTab === 'collections' ? (
            <>
              {/* Trend Chart */}
              <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Milk Trend</h3>
                  <div className="flex items-center gap-2 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                    <TrendingUp size={14} />
                    Last 15 Entries
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-stone-800" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--tw-colors-stone-900)' }}
                        itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Area type="monotone" dataKey="qty" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorQty)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-stone-50 dark:border-stone-800 flex items-center justify-between">
                  <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Recent Entries</h3>
                  <button className="text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white flex items-center gap-1">
                    <Download size={14} />
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                        <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Shift</th>
                        <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Qty (kg)</th>
                        <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">FAT/SNF</th>
                        <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                      {transactions.map((t) => (
                        <tr key={t.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                          <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-300">
                            {format(toDate(t.timestamp), 'MMM dd, yyyy')}
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              t.shift === 'Morning' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                            )}>
                              {t.shift}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-stone-600 dark:text-stone-300">{(t.quantity || 0).toFixed(1)}</td>
                          <td className="px-6 py-4 text-sm font-mono text-stone-600 dark:text-stone-300">{(t.fat || 0).toFixed(1)} / {(t.snf || 0).toFixed(1)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-stone-900 dark:text-white">₹{(t.amount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-stone-400 dark:text-stone-500 italic">No transactions found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* Ledger View */
            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-6 border-b border-stone-50 dark:border-stone-800 flex items-center justify-between">
                <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Financial Statement</h3>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded">
                    <ArrowUpRight size={10} />
                    Credit (Milk)
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                    <ArrowDownLeft size={10} />
                    Debit (Paid)
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                      <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Date & Time</th>
                      <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Description</th>
                      <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider text-right">Amount</th>
                      <th className="px-6 py-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                    {ledger.map((entry) => (
                      <tr key={entry.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                        <td className="px-6 py-4 text-sm text-stone-500 dark:text-stone-400">
                          {format(new Date(entry.date), 'MMM dd, hh:mm a')}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-stone-900 dark:text-white">{entry.description}</p>
                          <p className="text-[10px] text-stone-400 uppercase tracking-wider">Ref: {entry.referenceId.slice(-6).toUpperCase()}</p>
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-sm font-bold text-right",
                          entry.type.toLowerCase() === 'credit' ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                        )}>
                          {entry.type.toLowerCase() === 'credit' ? '+' : '-'} ₹{(entry.amount || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono font-medium text-stone-900 dark:text-white text-right">
                          ₹{(entry.balanceAfter || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {ledger.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-stone-400 dark:text-stone-500 italic">No ledger entries found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-stone-900/20 dark:bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 w-full max-w-lg rounded-3xl shadow-xl overflow-hidden border border-stone-100 dark:border-stone-800">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800 flex items-center justify-between">
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Edit Farmer Details</h2>
              <button onClick={() => setIsEditing(false)} className="text-stone-400 hover:text-stone-900 dark:hover:text-white">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdateFarmer} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Member ID</label>
                  <input
                    required
                    value={editData.farmerId}
                    onChange={e => setEditData({...editData, farmerId: e.target.value})}
                    className={cn(
                      "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                      errors.farmerId ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
                    )}
                  />
                  {errors.farmerId && <p className="text-[10px] text-red-500 font-medium">{errors.farmerId}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Cattle Type</label>
                  <select
                    value={editData.cattleType}
                    onChange={e => setEditData({...editData, cattleType: e.target.value as any})}
                    className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                  >
                    <option value="Cow">Cow</option>
                    <option value="Buffalo">Buffalo</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-400 uppercase">Full Name</label>
                <input
                  required
                  value={editData.name}
                  onChange={e => setEditData({...editData, name: e.target.value})}
                  className={cn(
                    "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                    errors.name ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
                  )}
                />
                {errors.name && <p className="text-[10px] text-red-500 font-medium">{errors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Mobile</label>
                  <input
                    value={editData.mobile}
                    onChange={e => setEditData({...editData, mobile: e.target.value})}
                    className={cn(
                      "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                      errors.mobile ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
                    )}
                  />
                  {errors.mobile && <p className="text-[10px] text-red-500 font-medium">{errors.mobile}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Village</label>
                  <input
                    required
                    value={editData.village}
                    onChange={e => setEditData({...editData, village: e.target.value})}
                    className={cn(
                      "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                      errors.village ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
                    )}
                  />
                  {errors.village && <p className="text-[10px] text-red-500 font-medium">{errors.village}</p>}
                </div>
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Update Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {isDeleting && (
        <div className="fixed inset-0 bg-stone-900/20 dark:bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 w-full max-w-md rounded-3xl shadow-xl overflow-hidden border border-stone-100 dark:border-stone-800 p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Delete Farmer?</h2>
              <p className="text-stone-500 dark:text-stone-400">
                Are you sure you want to delete this farmer? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setIsDeleting(false)}
                className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFarmer}
                disabled={submitting}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
