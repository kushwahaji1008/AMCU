import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { RateChart, RateSettings } from '../types';
import { Settings2, Plus, Search, Trash2, Edit2, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { rateApi } from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function RateChartManagement() {
  const { profile } = useAuth();
  const { handleError } = useErrorHandler();
  const [activeTab, setActiveTab] = useState<'Cow' | 'Buffalo' | 'Formula'>('Cow');
  const [rates, setRates] = useState<RateChart[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newRate, setNewRate] = useState({
    fat: '',
    snf: '',
    rate: '',
    effectiveFrom: format(new Date(), 'yyyy-MM-dd'),
  });
  const [rateSettings, setRateSettings] = useState<RateSettings>({
    fatMultiplier1: 3.96,
    snfMultiplier1: 2.64,
    fatMultiplier2: 7.77,
    snfDeductions: {
      '9.0': 0,
      '8.9': 0.5,
      '8.8': 1,
      '8.7': 1.5,
      '8.6': 2,
      '8.5': 2.5,
      '8.4': 3,
      '8.3': 3.5,
    },
    minFatForFormula1: 3.0,
    maxFatForFormula1: 6.0,
  });

  useEffect(() => {
    const fetchRates = async () => {
      if (activeTab === 'Formula') return;
      try {
        const response = await rateApi.getAll();
        // Filter by milkType if needed, but backend currently returns all
        // Let's assume we might need to filter client-side if backend doesn't support it yet
        const allRates = response.data;
        setRates(allRates.filter((r: any) => r.milkType === activeTab));
      } catch (err) {
        handleError(err, "Failed to fetch rates");
      }
    };
    fetchRates();
  }, [activeTab]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await rateApi.getSettings();
        if (response.data && Object.keys(response.data).length > 0) {
          setRateSettings(response.data as RateSettings);
        }
      } catch (err) {
        handleError(err, "Failed to fetch rate settings");
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await rateApi.saveSettings(rateSettings);
      toast.success('Formula settings saved successfully');
    } catch (err) {
      handleError(err, 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const rateData: any = {
        milkType: activeTab,
        rate: parseFloat(newRate.rate),
        fat: parseFloat(newRate.fat),
        snf: parseFloat(newRate.snf),
        effectiveFrom: newRate.effectiveFrom,
      };

      await rateApi.create(rateData);
      toast.success('Rate added successfully');
      setIsAdding(false);
      setNewRate({
        fat: '',
        snf: '',
        rate: '',
        effectiveFrom: format(new Date(), 'yyyy-MM-dd'),
      });
      
      // Refresh list
      const response = await rateApi.getAll();
      setRates(response.data.filter((r: any) => r.milkType === activeTab));
    } catch (err) {
      handleError(err, 'Failed to add rate');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rate?')) return;
    try {
      await rateApi.delete(id);
      toast.success('Rate deleted');
      setRates(rates.filter(r => r.id !== id));
    } catch (err) {
      handleError(err, 'Failed to delete rate');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Rate Chart Management</h1>
          <p className="text-stone-500 dark:text-stone-400">Manage milk pricing based on FAT and SNF</p>
        </div>
        {activeTab !== 'Formula' && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
          >
            <Plus size={18} />
            Add New Rate
          </button>
        )}
      </div>

      {isAdding && activeTab !== 'Formula' && (
        <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Add New {activeTab} Rate</h2>
            <button onClick={() => setIsAdding(false)} className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleAddRate} className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">FAT %</label>
              <input
                type="number"
                step="0.1"
                required
                value={newRate.fat}
                onChange={(e) => setNewRate({ ...newRate, fat: e.target.value })}
                className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                placeholder="0.0"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">SNF %</label>
              <input
                type="number"
                step="0.1"
                required
                value={newRate.snf}
                onChange={(e) => setNewRate({ ...newRate, snf: e.target.value })}
                className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                placeholder="0.0"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Rate (₹/kg)</label>
              <input
                type="number"
                step="0.01"
                required
                value={newRate.rate}
                onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                placeholder="0.00"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={18} />
                {loading ? 'Saving...' : 'Save Rate'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
        <div className="flex border-b border-stone-100 dark:border-stone-800">
          {(['Cow', 'Buffalo', 'Formula'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-4 text-sm font-medium transition-colors",
                activeTab === tab 
                  ? "text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-white" 
                  : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400"
              )}
            >
              {tab} {tab === 'Formula' ? 'Settings' : 'Rate Chart'}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'Formula' ? (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-stone-900 dark:text-white flex items-center gap-2">
                    <Settings2 size={18} className="text-stone-400" />
                    Formula 1 (3.0 ≤ FAT &lt; 6.0)
                  </h3>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">FAT Multiplier</label>
                    <input
                      type="number"
                      step="0.01"
                      value={rateSettings.fatMultiplier1}
                      onChange={(e) => setRateSettings({ ...rateSettings, fatMultiplier1: parseFloat(e.target.value) })}
                      className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">SNF Multiplier</label>
                    <input
                      type="number"
                      step="0.01"
                      value={rateSettings.snfMultiplier1}
                      onChange={(e) => setRateSettings({ ...rateSettings, snfMultiplier1: parseFloat(e.target.value) })}
                      className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-stone-900 dark:text-white flex items-center gap-2">
                    <Settings2 size={18} className="text-stone-400" />
                    Formula 2 (FAT ≥ 6.0)
                  </h3>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">FAT Multiplier</label>
                    <input
                      type="number"
                      step="0.01"
                      value={rateSettings.fatMultiplier2}
                      onChange={(e) => setRateSettings({ ...rateSettings, fatMultiplier2: parseFloat(e.target.value) })}
                      className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    />
                  </div>
                  <p className="text-xs text-stone-500 italic">Rate = FAT * Multiplier - SNF Deduction %</p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-stone-900 dark:text-white flex items-center gap-2">
                    <Settings2 size={18} className="text-stone-400" />
                    SNF Deductions (%)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(rateSettings.snfDeductions)
                      .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
                      .map(([snf, deduction]) => (
                        <div key={snf} className="space-y-1">
                          <label className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">SNF {snf}</label>
                          <input
                            type="number"
                            step="0.1"
                            value={deduction}
                            onChange={(e) => {
                              const newDeductions = { ...rateSettings.snfDeductions, [snf]: parseFloat(e.target.value) };
                              setRateSettings({ ...rateSettings, snfDeductions: newDeductions });
                            }}
                            className="w-full p-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-lg focus:outline-none text-sm dark:text-white"
                          />
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100 dark:border-stone-800 flex justify-end">
                <button
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="px-8 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors flex items-center gap-2"
                >
                  <Check size={18} />
                  {loading ? 'Saving...' : 'Save Formula Settings'}
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-6">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                  <input
                    type="text"
                    placeholder="Search rates..."
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-100 dark:border-stone-800">
                      <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">FAT %</th>
                      <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">SNF %</th>
                      <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Rate (₹/kg)</th>
                      <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Effective From</th>
                      <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                    {rates.map((rate) => (
                      <tr key={rate.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                        <td className="py-4 px-4 text-sm text-stone-600 dark:text-stone-300 font-mono">{rate.fat?.toFixed(1) || '0.0'}</td>
                        <td className="py-4 px-4 text-sm text-stone-600 dark:text-stone-300 font-mono">{rate.snf?.toFixed(1) || '0.0'}</td>
                        <td className="py-4 px-4 text-sm font-medium text-stone-900 dark:text-white font-mono">₹{rate.rate?.toFixed(2) || '0.00'}</td>
                        <td className="py-4 px-4 text-sm text-stone-500 dark:text-stone-400">{rate.effectiveFrom}</td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors">
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteRate(rate.id!)}
                              className="p-2 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {rates.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-stone-400 dark:text-stone-500 italic">No rates defined for {activeTab}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
