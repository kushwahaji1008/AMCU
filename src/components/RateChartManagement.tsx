import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { RateChart } from '../types';
import { Settings2, Plus, Search, FileText, Trash2, Edit2, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function RateChartManagement() {
  const [activeTab, setActiveTab] = useState<'Cow' | 'Buffalo'>('Cow');
  const [rates, setRates] = useState<RateChart[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newRate, setNewRate] = useState({
    fat: '',
    snf: '',
    rate: '',
    effectiveFrom: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    const q = query(
      collection(db, 'rateCharts'),
      where('milkType', '==', activeTab),
      orderBy('fat', 'asc'),
      orderBy('snf', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RateChart[];
      setRates(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'rateCharts'));

    return () => unsubscribe();
  }, [activeTab]);

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const rateData: Omit<RateChart, 'id'> = {
        milkType: activeTab,
        baseRate: parseFloat(newRate.rate),
        fatStandard: parseFloat(newRate.fat),
        snfStandard: parseFloat(newRate.snf),
        fatStep: 0.1,
        snfStep: 0.1,
        effectiveFrom: newRate.effectiveFrom,
      };

      await addDoc(collection(db, 'rateCharts'), rateData);
      toast.success('Rate added successfully');
      setIsAdding(false);
      setNewRate({
        fat: '',
        snf: '',
        rate: '',
        effectiveFrom: format(new Date(), 'yyyy-MM-dd'),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'rateCharts');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rate?')) return;
    try {
      await deleteDoc(doc(db, 'rateCharts', id));
      toast.success('Rate deleted');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'rateCharts');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900">Rate Chart Management</h1>
          <p className="text-stone-500">Manage milk pricing based on FAT and SNF</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
        >
          <Plus size={18} />
          Add New Rate
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-serif font-medium text-stone-900">Add New {activeTab} Rate</h2>
            <button onClick={() => setIsAdding(false)} className="p-2 text-stone-400 hover:text-stone-900">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleAddRate} className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">FAT %</label>
              <input
                type="number"
                step="0.1"
                required
                value={newRate.fat}
                onChange={(e) => setNewRate({ ...newRate, fat: e.target.value })}
                className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none"
                placeholder="0.0"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">SNF %</label>
              <input
                type="number"
                step="0.1"
                required
                value={newRate.snf}
                onChange={(e) => setNewRate({ ...newRate, snf: e.target.value })}
                className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none"
                placeholder="0.0"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Rate (₹/kg)</label>
              <input
                type="number"
                step="0.01"
                required
                value={newRate.rate}
                onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none"
                placeholder="0.00"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={18} />
                {loading ? 'Saving...' : 'Save Rate'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-stone-100">
          {(['Cow', 'Buffalo'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-4 text-sm font-medium transition-colors",
                activeTab === tab 
                  ? "text-stone-900 border-b-2 border-stone-900" 
                  : "text-stone-400 hover:text-stone-600"
              )}
            >
              {tab} Rate Chart
            </button>
          ))}
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input
                type="text"
                placeholder="Search rates..."
                className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 uppercase tracking-wider">FAT %</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 uppercase tracking-wider">SNF %</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Rate (₹/kg)</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Effective From</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {rates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="py-4 px-4 text-sm text-stone-600 font-mono">{rate.fat.toFixed(1)}</td>
                    <td className="py-4 px-4 text-sm text-stone-600 font-mono">{rate.snf.toFixed(1)}</td>
                    <td className="py-4 px-4 text-sm font-medium text-stone-900 font-mono">₹{rate.rate.toFixed(2)}</td>
                    <td className="py-4 px-4 text-sm text-stone-500">{rate.effectiveFrom}</td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="p-2 text-stone-400 hover:text-stone-900 transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteRate(rate.id!)}
                          className="p-2 text-stone-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rates.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-stone-400 italic">No rates defined for {activeTab}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
