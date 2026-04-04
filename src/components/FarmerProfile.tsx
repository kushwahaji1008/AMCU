import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { Farmer, CollectionTransaction } from '../types';
import { 
  User, Phone, MapPin, Milk, IndianRupee, Calendar, 
  ArrowLeft, TrendingUp, CreditCard, Activity,
  ChevronRight, Download, Printer, QrCode
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { format, parseISO, subDays } from 'date-fns';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function FarmerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([]);
  const [loading, setLoading] = useState(true);

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
          <button className="p-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors">
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
              <Milk className="text-blue-600 dark:text-blue-400 mb-3" size={24} />
              <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Total Milk</p>
              <p className="text-xl font-serif font-medium text-stone-900 dark:text-white">{stats.totalQty.toFixed(1)} kg</p>
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
          {/* Trend Chart */}
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Collection History</h3>
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
                        {format(parseISO(t.timestamp), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          t.shift === 'Morning' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                        )}>
                          {t.shift}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-stone-600 dark:text-stone-300">{t.quantity.toFixed(1)}</td>
                      <td className="px-6 py-4 text-sm font-mono text-stone-600 dark:text-stone-300">{t.fat.toFixed(1)} / {t.snf.toFixed(1)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-stone-900 dark:text-white">₹{t.amount.toFixed(2)}</td>
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
        </div>
      </div>
    </div>
  );
}
