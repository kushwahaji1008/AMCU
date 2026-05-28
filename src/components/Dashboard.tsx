import React, { useState, useEffect, useMemo } from 'react';
import { toDate } from '../firebase';
import { Link } from 'react-router-dom';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../AuthContext';
import { CollectionTransaction } from '../types';
import { format, subDays } from 'date-fns';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { 
  TrendingUp, Users, Milk, IndianRupee, Calendar, 
  RefreshCw, Activity, Bell, Wifi
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { cn } from '../lib/utils';
import { reportApi } from '../services/api';

export default function Dashboard() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { handleError } = useErrorHandler();
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
  const [trendData, setTrendData] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState(7); // Default to 7 days
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.dairyId) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await reportApi.getDashboard();
        const data = response.data;
        
        setStats(prev => ({
          ...prev,
          todayQty: data.todayQty,
          morningQty: data.morningQty,
          eveningQty: data.eveningQty,
          todayAmount: data.todayAmount,
          totalFarmers: data.totalFarmers,
          avgFat: data.avgFat,
          avgSnf: data.avgSnf,
        }));
        
        setRecentTxns(data.recentTxns || []);
        setTrendData(data.trendData || []);
        
        // Mock top farmers for now as backend doesn't return it yet
        // Or calculate it from trendData if it has enough info
        const farmerMap = new Map<string, number>();
        (data.trendData || []).forEach((txn: any) => {
          farmerMap.set(txn.farmerName, (farmerMap.get(txn.farmerName) || 0) + txn.quantity);
        });
        const sorted = Array.from(farmerMap.entries())
          .map(([name, qty]) => ({ name, qty }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5);
        setTopFarmers(sorted);

      } catch (error) {
        handleError(error, "Failed to fetch dashboard stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [profile?.dairyId, timeRange]);

  const processedChartData = useMemo(() => {
    const dailyMap = new Map<string, { qty: number; morning: number; evening: number; fatSum: number; snfSum: number; count: number; cow: number; buffalo: number }>();
    
    // Initialize map with all days in range
    for (let i = 0; i < timeRange; i++) {
      const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
      dailyMap.set(dateStr, { qty: 0, morning: 0, evening: 0, fatSum: 0, snfSum: 0, count: 0, cow: 0, buffalo: 0 });
    }

    trendData.forEach(txn => {
      const dateStr = format(toDate(txn.date || txn.timestamp), 'yyyy-MM-dd');
      if (dailyMap.has(dateStr)) {
        const current = dailyMap.get(dateStr)!;
        current.qty += txn.quantity;
        if (txn.shift === 'Morning') current.morning += txn.quantity;
        else current.evening += txn.quantity;
        
        if (txn.milkType === 'Cow') current.cow += txn.quantity;
        else if (txn.milkType === 'Buffalo') current.buffalo += txn.quantity;
        
        current.fatSum += txn.fat;
        current.snfSum += txn.snf;
        current.count += 1;
      }
    });

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date: format(toDate(date), 'MMM dd'),
        quantity: Number((data.qty || 0).toFixed(1)),
        morning: Number((data.morning || 0).toFixed(1)),
        evening: Number((data.evening || 0).toFixed(1)),
        cow: Number((data.cow || 0).toFixed(1)),
        buffalo: Number((data.buffalo || 0).toFixed(1)),
        avgFat: data.count > 0 ? Number(((data.fatSum || 0) / data.count).toFixed(2)) : 0,
        avgSnf: data.count > 0 ? Number(((data.snfSum || 0) / data.count).toFixed(2)) : 0,
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
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-serif font-bold text-stone-900 dark:text-white tracking-tight">{t('dashboard')}</h1>
          <p className="text-stone-500 dark:text-stone-400 mt-2 text-lg">{t('welcome')}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 glass-card px-4 py-2 rounded-2xl text-xs font-medium text-stone-500 dark:text-stone-400">
            <RefreshCw size={14} className="text-emerald-500 animate-spin-slow" />
            Synced: Just now
          </div>
          <div className="flex items-center gap-2 glass-card p-1 rounded-2xl">
            {[7, 15].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-semibold transition-all",
                  timeRange === days 
                    ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-lg" 
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-stone-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
              <Milk className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500 px-3 py-1 rounded-full shadow-lg shadow-emerald-500/20">Live</span>
          </div>
          <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mb-2">Today's Total</p>
          <p className="text-4xl font-serif font-bold mb-6">{(stats.todayQty || 0).toFixed(1)} <span className="text-xl font-normal opacity-60">kg</span></p>
          <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/10 relative z-10">
            <div>
              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mb-1">Morning</p>
              <p className="text-base font-semibold">{(stats.morningQty || 0).toFixed(1)} kg</p>
            </div>
            <div>
              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mb-1">Evening</p>
              <p className="text-base font-semibold">{(stats.eveningQty || 0).toFixed(1)} kg</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="glass-card p-8 rounded-[2.5rem] relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl">
              <IndianRupee className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <Activity className="text-stone-200 dark:text-stone-700" size={20} />
          </div>
          <p className="text-stone-500 dark:text-stone-400 text-xs font-bold uppercase tracking-widest mb-2">Today's Revenue</p>
          <p className="text-4xl font-serif font-bold text-stone-900 dark:text-white mb-6">₹{(stats.todayAmount || 0).toLocaleString()}</p>
          <div className="pt-6 border-t border-stone-100 dark:border-stone-800">
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1">Pending Payments</p>
            <p className="text-base font-semibold text-amber-600 dark:text-amber-400">₹{(stats.pendingPayments || 0).toLocaleString()}</p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="glass-card p-8 rounded-[2.5rem]"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-stone-500 dark:text-stone-400 text-xs font-bold uppercase tracking-widest mb-2">Farmers Served</p>
          <p className="text-4xl font-serif font-bold text-stone-900 dark:text-white mb-6">{stats.totalFarmers}</p>
          <div className="pt-6 border-t border-stone-100 dark:border-stone-800">
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1">Avg. Quality</p>
            <p className="text-base font-semibold text-stone-600 dark:text-stone-300">{(stats.avgFat || 0).toFixed(1)}% FAT / {(stats.avgSnf || 0).toFixed(1)}% SNF</p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="glass-card p-8 rounded-[2.5rem]"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em]">Hardware Status</h3>
            <Link to="/devices" className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-widest">Manage</Link>
          </div>
          <div className="space-y-5">
            {[
              { label: 'Weighing Scale', icon: Wifi, status: 'online' },
              { label: 'Milk Analyzer', icon: Activity, status: 'online' },
              { label: 'Printer', icon: RefreshCw, status: 'warning' },
            ].map((device) => (
              <div key={device.label} className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 rounded-xl flex items-center justify-center group-hover:bg-stone-100 dark:group-hover:bg-stone-700 transition-colors">
                    <device.icon size={16} className="text-stone-400 dark:text-stone-500" />
                  </div>
                  <span className="text-sm font-medium text-stone-600 dark:text-stone-300">{device.label}</span>
                </div>
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full shadow-sm",
                  device.status === 'online' ? "bg-emerald-500 shadow-emerald-500/20" : "bg-amber-500 shadow-amber-500/20"
                )} />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart & Notifications */}
        <div className="lg:col-span-2 space-y-8">
          {/* Trend Graph */}
          <div className="glass-card p-8 rounded-[2.5rem]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-serif font-bold text-stone-900 dark:text-white">Collection Trend</h3>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full shadow-sm shadow-blue-500/20"></span>
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Qty (kg)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-amber-500 rounded-full shadow-sm shadow-amber-500/20"></span>
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">FAT %</span>
                </div>
              </div>
            </div>
            <div className="h-[300px] w-full">
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
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                    dy={15}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#fff' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="quantity" 
                    stroke="#2563eb" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorQty)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Shift Comparison Chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Shift Comparison</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-amber-400 rounded-full"></span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">M</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-indigo-500 rounded-full"></span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">E</span>
                  </div>
                </div>
              </div>
              <div className="h-[200px] w-full">
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

            <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-serif font-medium text-stone-900 dark:text-white">Milk Type</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-blue-400 rounded-full"></span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">Cow</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-stone-400 rounded-full"></span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">Buf</span>
                  </div>
                </div>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processedChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#fff' }}
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Bar dataKey="cow" fill="#60a5fa" radius={[4, 4, 0, 0]} barSize={12} />
                    <Bar dataKey="buffalo" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { name: 'Collection', path: '/collection', icon: Milk, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
              { name: 'Farmers', path: '/farmers', icon: Users, color: 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400' },
              { name: 'Payments', path: '/payments', icon: IndianRupee, color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
              { name: 'Reports', path: '/reports', icon: Calendar, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
            ].map((action) => (
              <Link 
                key={action.name}
                to={action.path}
                className="glass-card p-8 rounded-[2.5rem] hover:shadow-xl transition-all group text-center"
              >
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform group-hover:scale-110 group-hover:-rotate-3 shadow-sm", action.color)}>
                  <action.icon size={28} />
                </div>
                <span className="text-sm font-bold text-stone-900 dark:text-white uppercase tracking-widest">{action.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Sidebar: Notifications & Recent */}
        <div className="space-y-10">
          {/* Notification Panel */}
          <div className="glass-card rounded-[2.5rem] overflow-hidden">
            <div className="p-8 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell size={20} className="text-stone-900 dark:text-white" />
                <h3 className="text-xl font-serif font-bold text-stone-900 dark:text-white">Alerts</h3>
              </div>
              <span className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-bold px-3 py-1 rounded-full">3 New</span>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {alerts.map((alert, idx) => (
                <div key={alert.id || `alert-${idx}`} className="p-6 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer">
                  <div className="flex gap-4">
                    <div className={cn(
                      "mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 shadow-sm",
                      alert.type === 'warning' ? "bg-amber-500 shadow-amber-500/20" : 
                      alert.type === 'error' ? "bg-red-500 shadow-red-500/20" : "bg-blue-500 shadow-blue-500/20"
                    )}></div>
                    <div>
                      <p className="text-sm font-medium text-stone-900 dark:text-white leading-relaxed">{alert.message}</p>
                      <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 mt-2 uppercase tracking-widest">{alert.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full py-4 text-xs font-bold text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white bg-stone-50/50 dark:bg-stone-800/50 transition-colors uppercase tracking-[0.2em]">
              View All Notifications
            </button>
          </div>

          {/* Top Farmers */}
          <div className="glass-card rounded-[2.5rem] overflow-hidden">
            <div className="p-8 border-b border-stone-100 dark:border-stone-800">
              <h3 className="text-xl font-serif font-bold text-stone-900 dark:text-white">Top Members (7D)</h3>
            </div>
            <div className="p-8 space-y-6">
              {topFarmers.map((farmer, idx) => (
                <div key={farmer.name || `farmer-${idx}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shadow-sm",
                      idx === 0 ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500"
                    )}>
                      {idx + 1}
                    </div>
                    <span className="text-sm font-semibold text-stone-900 dark:text-white">{farmer.name}</span>
                  </div>
                  <span className="text-sm font-mono font-medium text-stone-500 dark:text-stone-400">{(farmer.qty || 0).toFixed(1)} kg</span>
                </div>
              ))}
              {topFarmers.length === 0 && (
                <p className="text-center text-stone-400 dark:text-stone-500 text-sm italic">No data available</p>
              )}
            </div>
          </div>

          {/* Recent Transactions (Mini) */}
          <div className="glass-card rounded-[2.5rem] overflow-hidden">
            <div className="p-8 border-b border-stone-100 dark:border-stone-800">
              <h3 className="text-xl font-serif font-bold text-stone-900 dark:text-white">Recent Activity</h3>
            </div>
            <div className="divide-y divide-stone-50 dark:divide-stone-800">
              {recentTxns.map((txn, idx) => (
                <div key={txn.id || `txn-${idx}`} className="p-6 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold text-stone-900 dark:text-white">{txn.farmerName}</p>
                    <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mt-1">{txn.shift} • {(txn.quantity || 0).toFixed(1)} kg</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-stone-900 dark:text-white">₹{(txn.amount || 0).toFixed(0)}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest mt-1">Success</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/reports" className="block w-full py-4 text-center text-xs font-bold text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white bg-stone-50/50 dark:bg-stone-800/50 transition-colors uppercase tracking-[0.2em]">
              View Collection Report
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
