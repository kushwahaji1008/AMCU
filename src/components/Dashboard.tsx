import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where, Timestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { useLanguage } from '../LanguageContext';
import { CollectionTransaction, Farmer } from '../types';
import { format, startOfDay, endOfDay, subDays, parseISO } from 'date-fns';
import { 
  TrendingUp, Users, Milk, IndianRupee, Calendar, ChevronDown, 
  AlertTriangle, CheckCircle2, Wifi, RefreshCw, ArrowRight,
  Activity, Bell
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  BarChart,
  Bar
} from 'recharts';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    todayQty: 0,
    morningQty: 0,
    eveningQty: 0,
    todayAmount: 0,
    totalFarmers: 0,
    avgFat: 0,
    avgSnf: 0,
    pendingPayments: 0,
  });
  const [recentTxns, setRecentTxns] = useState<CollectionTransaction[]>([]);
  const [topFarmers, setTopFarmers] = useState<{name: string, qty: number}[]>([]);
  const [trendData, setTrendData] = useState<CollectionTransaction[]>([]);
  const [timeRange, setTimeRange] = useState(7); // Default to 7 days
  const [deviceStatus, setDeviceStatus] = useState({
    scale: 'online',
    analyzer: 'online',
    printer: 'online'
  });

  useEffect(() => {
    // Stats for today
    const today = new Date();
    const q = query(
      collection(db, 'collections'),
      where('timestamp', '>=', startOfDay(today).toISOString()),
      where('timestamp', '<=', endOfDay(today).toISOString())
    );

    const unsubscribeStats = onSnapshot(q, (snapshot) => {
      let qty = 0;
      let morningQty = 0;
      let eveningQty = 0;
      let amt = 0;
      let fatSum = 0;
      let snfSum = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data() as CollectionTransaction;
        qty += data.quantity;
        if (data.shift === 'Morning') morningQty += data.quantity;
        else eveningQty += data.quantity;
        
        amt += data.amount;
        fatSum += data.fat;
        snfSum += data.snf;
      });
      
      setStats(prev => ({
        ...prev,
        todayQty: qty,
        morningQty,
        eveningQty,
        todayAmount: amt,
        avgFat: snapshot.size > 0 ? fatSum / snapshot.size : 0,
        avgSnf: snapshot.size > 0 ? snfSum / snapshot.size : 0,
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'collections'));

    // Total farmers
    const unsubscribeFarmers = onSnapshot(collection(db, 'farmers'), (snapshot) => {
      setStats(prev => ({ ...prev, totalFarmers: snapshot.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'farmers'));

    // Recent transactions
    const qRecent = query(collection(db, 'collections'), orderBy('timestamp', 'desc'), limit(5));
    const unsubscribeRecent = onSnapshot(qRecent, (snapshot) => {
      setRecentTxns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionTransaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'collections'));

    // Top farmers this week
    const weekStart = startOfDay(subDays(new Date(), 7));
    const qTop = query(
      collection(db, 'collections'),
      where('timestamp', '>=', weekStart.toISOString())
    );

    const unsubscribeTop = onSnapshot(qTop, (snapshot) => {
      const farmerMap = new Map<string, number>();
      snapshot.docs.forEach(doc => {
        const data = doc.data() as CollectionTransaction;
        farmerMap.set(data.farmerName, (farmerMap.get(data.farmerName) || 0) + data.quantity);
      });
      const sorted = Array.from(farmerMap.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      setTopFarmers(sorted);
    });

    // Trend data
    const startDate = startOfDay(subDays(new Date(), timeRange - 1));
    const qTrend = query(
      collection(db, 'collections'),
      where('timestamp', '>=', startDate.toISOString()),
      orderBy('timestamp', 'asc')
    );

    const unsubscribeTrend = onSnapshot(qTrend, (snapshot) => {
      setTrendData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionTransaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'collections'));

    return () => {
      unsubscribeStats();
      unsubscribeFarmers();
      unsubscribeRecent();
      unsubscribeTop();
      unsubscribeTrend();
    };
  }, [timeRange]);

  const processedChartData = useMemo(() => {
    const dailyMap = new Map<string, { qty: number; morning: number; evening: number; fatSum: number; snfSum: number; count: number }>();
    
    // Initialize map with all days in range
    for (let i = 0; i < timeRange; i++) {
      const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
      dailyMap.set(dateStr, { qty: 0, morning: 0, evening: 0, fatSum: 0, snfSum: 0, count: 0 });
    }

    trendData.forEach(txn => {
      const dateStr = format(parseISO(txn.timestamp), 'yyyy-MM-dd');
      if (dailyMap.has(dateStr)) {
        const current = dailyMap.get(dateStr)!;
        current.qty += txn.quantity;
        if (txn.shift === 'Morning') current.morning += txn.quantity;
        else current.evening += txn.quantity;
        current.fatSum += txn.fat;
        current.snfSum += txn.snf;
        current.count += 1;
      }
    });

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date: format(parseISO(date), 'MMM dd'),
        quantity: Number(data.qty.toFixed(1)),
        morning: Number(data.morning.toFixed(1)),
        evening: Number(data.evening.toFixed(1)),
        avgFat: data.count > 0 ? Number((data.fatSum / data.count).toFixed(2)) : 0,
        avgSnf: data.count > 0 ? Number((data.snfSum / data.count).toFixed(2)) : 0,
        fullDate: date
      }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [trendData, timeRange]);

  const alerts = useMemo(() => {
    const list = [];
    if (stats.avgFat < 3.5 && stats.todayQty > 0) {
      list.push({ id: 'fat-low', type: 'warning', message: 'Average FAT content is lower than usual (3.5%)', time: 'Just now' });
    }
    if (stats.todayQty > 500) {
      list.push({ id: 'high-vol', type: 'info', message: 'High collection volume today. Ensure storage capacity.', time: '10m ago' });
    }
    if (recentTxns.some(t => t.fat > 10)) {
      list.push({ id: 'fat-anomaly', type: 'error', message: 'Abnormal FAT detected in recent entry. Review required.', time: '5m ago' });
    }
    return list;
  }, [stats.avgFat, stats.todayQty, recentTxns]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">{t('dashboard')}</h1>
          <p className="text-stone-500 dark:text-stone-400">{t('welcome')}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white dark:bg-stone-900 px-4 py-2 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm text-xs font-medium text-stone-500 dark:text-stone-400">
            <RefreshCw size={14} className="text-emerald-500 animate-spin-slow" />
            Synced: Just now
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-stone-900 p-1 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm">
            {[7, 15].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-medium transition-all",
                  timeRange === days 
                    ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm" 
                    : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-50 dark:hover:bg-stone-800"
                )}
              >
                {days}D
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-stone-900 p-6 rounded-3xl text-white shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-white/10 rounded-2xl">
              <Milk className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500 px-2 py-1 rounded-full">Live</span>
          </div>
          <p className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-1">Today's Total</p>
          <p className="text-3xl font-serif font-medium mb-4">{stats.todayQty.toFixed(1)} <span className="text-lg">kg</span></p>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-[10px] text-stone-500 uppercase tracking-wider">Morning</p>
              <p className="text-sm font-medium">{stats.morningQty.toFixed(1)} kg</p>
            </div>
            <div>
              <p className="text-[10px] text-stone-500 uppercase tracking-wider">Evening</p>
              <p className="text-sm font-medium">{stats.eveningQty.toFixed(1)} kg</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl">
              <IndianRupee className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <Activity className="text-stone-200 dark:text-stone-700" size={16} />
          </div>
          <p className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider mb-1">Today's Revenue</p>
          <p className="text-3xl font-serif font-medium text-stone-900 dark:text-white mb-4">₹{stats.todayAmount.toLocaleString()}</p>
          <div className="pt-4 border-t border-stone-50 dark:border-stone-800">
            <p className="text-[10px] text-stone-400 uppercase tracking-wider">Pending Payments</p>
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">₹{stats.pendingPayments.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider mb-1">Farmers Served</p>
          <p className="text-3xl font-serif font-medium text-stone-900 dark:text-white mb-4">{stats.totalFarmers}</p>
          <div className="pt-4 border-t border-stone-50 dark:border-stone-800">
            <p className="text-[10px] text-stone-400 uppercase tracking-wider">Avg. Quality</p>
            <p className="text-sm font-medium text-stone-600 dark:text-stone-300">{stats.avgFat.toFixed(1)}% FAT / {stats.avgSnf.toFixed(1)}% SNF</p>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Hardware Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-stone-50 dark:bg-stone-800 rounded-lg flex items-center justify-center">
                  <Wifi size={14} className="text-stone-400 dark:text-stone-500" />
                </div>
                <span className="text-sm text-stone-600 dark:text-stone-300">Weighing Scale</span>
              </div>
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-stone-50 dark:bg-stone-800 rounded-lg flex items-center justify-center">
                  <Activity size={14} className="text-stone-400 dark:text-stone-500" />
                </div>
                <span className="text-sm text-stone-600 dark:text-stone-300">Milk Analyzer</span>
              </div>
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-stone-50 dark:bg-stone-800 rounded-lg flex items-center justify-center">
                  <RefreshCw size={14} className="text-stone-400 dark:text-stone-500" />
                </div>
                <span className="text-sm text-stone-600 dark:text-stone-300">Printer</span>
              </div>
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart & Notifications */}
        <div className="lg:col-span-2 space-y-8">
          {/* Trend Graph */}
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Collection Trend</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">Qty (kg)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">FAT %</span>
                </div>
              </div>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={processedChartData}>
                  <defs>
                    <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#fff' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="quantity" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorQty)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Shift Comparison Chart */}
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Shift Comparison</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-amber-400 rounded-full"></span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">Morning</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-indigo-500 rounded-full"></span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">Evening</span>
                </div>
              </div>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processedChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#fff' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="morning" fill="#fbbf24" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar dataKey="evening" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { name: 'Collection', path: '/collection', icon: Milk, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
              { name: 'Farmers', path: '/farmers', icon: Users, color: 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400' },
              { name: 'Payments', path: '/payments', icon: IndianRupee, color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
              { name: 'Reports', path: '/reports', icon: Calendar, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
            ].map((action) => (
              <Link 
                key={action.name}
                to={action.path}
                className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md transition-all group text-center"
              >
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-transform group-hover:scale-110", action.color)}>
                  <action.icon size={24} />
                </div>
                <span className="text-sm font-medium text-stone-900 dark:text-white">{action.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Sidebar: Notifications & Recent */}
        <div className="space-y-8">
          {/* Notification Panel */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-stone-900 dark:text-white" />
                <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Alerts</h3>
              </div>
              <span className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">3 New</span>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {alerts.map((alert) => (
                <div key={alert.id} className="p-4 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                  <div className="flex gap-3">
                    <div className={cn(
                      "mt-1 w-2 h-2 rounded-full shrink-0",
                      alert.type === 'warning' ? "bg-amber-500" : 
                      alert.type === 'error' ? "bg-red-500" : "bg-blue-500"
                    )}></div>
                    <div>
                      <p className="text-sm text-stone-900 dark:text-white leading-snug">{alert.message}</p>
                      <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">{alert.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full py-3 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white bg-stone-50/50 dark:bg-stone-800/50 transition-colors">
              View All Notifications
            </button>
          </div>

          {/* Top Farmers */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800">
              <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Top Members (7D)</h3>
            </div>
            <div className="p-6 space-y-4">
              {topFarmers.map((farmer, idx) => (
                <div key={farmer.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                      idx === 0 ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                    )}>
                      {idx + 1}
                    </div>
                    <span className="text-sm font-medium text-stone-900 dark:text-white">{farmer.name}</span>
                  </div>
                  <span className="text-sm font-mono text-stone-500 dark:text-stone-400">{farmer.qty.toFixed(1)} kg</span>
                </div>
              ))}
              {topFarmers.length === 0 && (
                <p className="text-center text-stone-400 dark:text-stone-500 text-sm italic">No data available</p>
              )}
            </div>
          </div>

          {/* Recent Transactions (Mini) */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800">
              <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Recent Activity</h3>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {recentTxns.map((txn) => (
                <div key={txn.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-stone-900 dark:text-white">{txn.farmerName}</p>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wider">{txn.shift} • {txn.quantity.toFixed(1)} kg</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-stone-900 dark:text-white">₹{txn.amount.toFixed(0)}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Success</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/reports" className="block w-full py-3 text-center text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white bg-stone-50/50 dark:bg-stone-800/50 transition-colors">
              View Collection Report
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
