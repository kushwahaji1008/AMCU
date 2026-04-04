import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { Farmer, CollectionTransaction } from '../types';
import { 
  User, Phone, MapPin, Milk, IndianRupee, Calendar, 
  ArrowLeft, TrendingUp, CreditCard, Activity,
  ChevronRight, Download, Printer
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { format, parseISO, subDays } from 'date-fns';
import { cn } from '../lib/utils';

export default function FarmerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    // Fetch farmer details
    const fetchFarmer = async () => {
      try {
        const farmerDoc = await getDoc(doc(db, 'farmers', id));
        if (farmerDoc.exists()) {
          setFarmer({ id: farmerDoc.id, ...farmerDoc.data() } as Farmer);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `farmers/${id}`);
      }
    };

    // Fetch transactions
    const q = query(
      collection(db, 'collections'),
      where('farmerId', '==', id), // This assumes farmerId in collections matches doc ID or a specific field
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribeTxns = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionTransaction)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'collections'));

    fetchFarmer();
    return () => unsubscribeTxns();
  }, [id]);

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
        date: format(parseISO(t.timestamp), 'MMM dd'),
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
            className="p-2 hover:bg-stone-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} className="text-stone-600" />
          </button>
          <div>
            <h1 className="text-3xl font-serif font-medium text-stone-900">{farmer.name}</h1>
            <p className="text-stone-500 flex items-center gap-2">
              <span className="font-mono text-xs bg-stone-100 px-2 py-0.5 rounded uppercase tracking-wider">ID: {farmer.farmerId}</span>
              • {farmer.village}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-3 border border-stone-100 rounded-2xl hover:bg-stone-50 transition-colors text-stone-600">
            <Printer size={20} />
          </button>
          <button className="p-3 bg-stone-900 text-white rounded-2xl hover:bg-stone-800 transition-colors">
            Edit Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats & Info */}
        <div className="space-y-8">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
              <Milk className="text-blue-600 mb-3" size={24} />
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Total Milk</p>
              <p className="text-xl font-serif font-medium text-stone-900">{stats.totalQty.toFixed(1)} kg</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
              <IndianRupee className="text-emerald-600 mb-3" size={24} />
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Total Earned</p>
              <p className="text-xl font-serif font-medium text-stone-900">₹{stats.totalAmt.toLocaleString()}</p>
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-50">
              <h3 className="text-lg font-serif font-medium text-stone-900">Information</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-stone-50 rounded-xl">
                  <Phone size={18} className="text-stone-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Mobile Number</p>
                  <p className="text-sm font-medium text-stone-900">{farmer.mobile || 'Not provided'}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-2 bg-stone-50 rounded-xl">
                  <Activity size={18} className="text-stone-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Cattle Type</p>
                  <p className="text-sm font-medium text-stone-900">{farmer.cattleType}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-2 bg-stone-50 rounded-xl">
                  <CreditCard size={18} className="text-stone-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Bank Details</p>
                  <p className="text-sm font-medium text-stone-900">{farmer.bankAccount || 'No account linked'}</p>
                  <p className="text-xs text-stone-400">{farmer.ifsc}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: History & Charts */}
        <div className="lg:col-span-2 space-y-8">
          {/* Trend Chart */}
          <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-serif font-medium text-stone-900">Collection History</h3>
              <div className="flex items-center gap-2 text-xs font-medium text-stone-400 uppercase tracking-wider">
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
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="qty" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorQty)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-50 flex items-center justify-between">
              <h3 className="text-lg font-serif font-medium text-stone-900">Recent Entries</h3>
              <button className="text-xs font-medium text-stone-500 hover:text-stone-900 flex items-center gap-1">
                <Download size={14} />
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50/50">
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Shift</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Qty (kg)</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">FAT/SNF</th>
                    <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-stone-600">
                        {format(parseISO(t.timestamp), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          t.shift === 'Morning' ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
                        )}>
                          {t.shift}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-stone-600">{t.quantity.toFixed(1)}</td>
                      <td className="px-6 py-4 text-sm font-mono text-stone-600">{t.fat.toFixed(1)} / {t.snf.toFixed(1)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-stone-900">₹{t.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-stone-400 italic">No transactions found</td>
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
