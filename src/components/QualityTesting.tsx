import React, { useState, useEffect } from 'react';
import { Beaker, Search, AlertCircle, CheckCircle2, Trash2, Calculator } from 'lucide-react';
import { cn } from '../lib/utils';
import { farmerApi } from '../services/api';
import { useAuth } from '../AuthContext';
import { Farmer } from '../types';
import { toast } from 'sonner';

interface QualityTestRecord {
  id: string;
  sampleId: string;
  farmerId?: string;
  farmerName?: string;
  milkType: 'Cow' | 'Buffalo' | 'Mixed';
  fat: number;
  snf: number;
  clr: number;
  water: number;
  status: 'Passed' | 'Low Quality' | 'Adulterated';
  testedAt: string;
}

export default function QualityTesting() {
  const { profile } = useAuth();
  const storageKey = `dugdhasetu_quality_tests_${profile?.databaseId || profile?.dairyId || 'default'}`;

  const [searchId, setSearchId] = useState('');
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [loading, setLoading] = useState(false);

  const [milkType, setMilkType] = useState<'Cow' | 'Buffalo' | 'Mixed'>('Cow');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [clr, setClr] = useState('');
  const [water, setWater] = useState('0');
  const [testLog, setTestLog] = useState<QualityTestRecord[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setTestLog(saved ? JSON.parse(saved) : []);
    } catch {
      setTestLog([]);
    }
  }, [storageKey]);

  const persistTests = (records: QualityTestRecord[]) => {
    setTestLog(records);
    localStorage.setItem(storageKey, JSON.stringify(records));
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchId.trim();
    if (!query) {
      toast.error('Please enter a Farmer ID or Sample ID');
      return;
    }

    setLoading(true);
    setSelectedFarmer(null);
    try {
      const res = await farmerApi.search(query);
      if (res.data) {
        setSelectedFarmer(res.data);
        setMilkType(res.data.cattleType || 'Cow');
        toast.success(`Loaded farmer: ${res.data.name}`);
      } else {
        toast.info(`Farmer ID "${query}" not found; recording as custom Sample ID`);
      }
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.status === 404) {
        toast.info(`Farmer "${query}" not found; you can save this test under Sample ID "${query}"`);
      } else {
        toast.error(err?.message || 'Failed to look up farmer');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAutoComputeSnf = () => {
    const fatVal = parseFloat(fat);
    const clrVal = parseFloat(clr);
    if (!Number.isFinite(fatVal) || !Number.isFinite(clrVal)) {
      toast.error('Enter valid FAT % and CLR values to calculate SNF %');
      return;
    }
    const computedSnf = (clrVal / 4) + (0.21 * fatVal) + 0.36;
    setSnf(computedSnf.toFixed(1));
  };

  const handleSaveTest = (e: React.FormEvent) => {
    e.preventDefault();
    const fatVal = parseFloat(fat);
    const snfVal = parseFloat(snf);
    const clrVal = clr ? parseFloat(clr) : 28;
    const waterVal = water ? parseFloat(water) : 0;

    if (!Number.isFinite(fatVal) || fatVal <= 0 || fatVal > 15) {
      toast.error('FAT % must be between 0.1 and 15.0');
      return;
    }
    if (!Number.isFinite(snfVal) || snfVal <= 0 || snfVal > 15) {
      toast.error('SNF % must be between 0.1 and 15.0');
      return;
    }
    if (!Number.isFinite(clrVal) || clrVal < 0 || clrVal > 45) {
      toast.error('CLR must be between 0 and 45');
      return;
    }
    if (!Number.isFinite(waterVal) || waterVal < 0 || waterVal > 100) {
      toast.error('Water % must be between 0 and 100');
      return;
    }

    let status: QualityTestRecord['status'] = 'Passed';
    if (waterVal > 0 || clrVal < 22) {
      status = 'Adulterated';
    } else if (fatVal < 3.0 || snfVal < 8.0) {
      status = 'Low Quality';
    }

    const record: QualityTestRecord = {
      id: `qt-${Date.now()}`,
      sampleId: searchId.trim() || `SMP-${Date.now().toString().slice(-4)}`,
      farmerId: selectedFarmer?.farmerId,
      farmerName: selectedFarmer?.name,
      milkType,
      fat: fatVal,
      snf: snfVal,
      clr: clrVal,
      water: waterVal,
      status,
      testedAt: new Date().toISOString(),
    };

    const next = [record, ...testLog].slice(0, 50);
    persistTests(next);
    toast.success(`Test saved (${status})`);

    setFat('');
    setSnf('');
    setClr('');
    setWater('0');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Quality Testing</h1>
        <p className="text-stone-500 dark:text-stone-400">Perform and record milk quality tests</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">Sample Identification</h2>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="text"
                  placeholder="Enter Sample ID or Farmer ID"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </form>

            {selectedFarmer && (
              <div className="mt-4 p-4 bg-emerald-50/70 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-900 dark:text-white">{selectedFarmer.name}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    ID: {selectedFarmer.farmerId} • {selectedFarmer.village} • {selectedFarmer.cattleType}
                  </p>
                </div>
                <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white flex items-center gap-2">
                <Beaker size={18} className="text-stone-400" />
                Recent Sample Log
              </h2>
              <span className="text-xs text-stone-400">{testLog.length} recorded</span>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {testLog.map(item => (
                <div key={item.id} className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-2xl flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-stone-900 dark:text-white">
                        {item.farmerName ? `${item.farmerName} (#${item.farmerId})` : item.sampleId}
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        item.status === 'Passed'
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                          : item.status === 'Adulterated'
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                      )}>
                        {item.status}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 font-mono">
                      {item.milkType} • FAT {item.fat.toFixed(1)}% • SNF {item.snf.toFixed(1)}% • CLR {item.clr} • Water {item.water}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => persistTests(testLog.filter(t => t.id !== item.id))}
                    className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"
                    title="Delete record"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {testLog.length === 0 && (
                <div className="py-8 text-center text-stone-400 dark:text-stone-500 text-sm italic">
                  No lab quality tests recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm h-fit">
          <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">Test Parameters</h2>
          <form onSubmit={handleSaveTest} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Milk Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Cow', 'Buffalo', 'Mixed'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setMilkType(type)}
                    className={cn(
                      "py-2.5 rounded-xl text-xs font-bold border transition-all",
                      milkType === type
                        ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 border-stone-900 dark:border-white"
                        : "bg-stone-50 dark:bg-stone-800 text-stone-500 border-stone-100 dark:border-stone-700"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">FAT %</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">SNF %</label>
                  <button
                    type="button"
                    onClick={handleAutoComputeSnf}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Calculator size={11} />
                    From CLR
                  </button>
                </div>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={snf}
                  onChange={(e) => setSnf(e.target.value)}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                  placeholder="0.0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">CLR</label>
                <input
                  type="number"
                  step="0.5"
                  value={clr}
                  onChange={(e) => setClr(e.target.value)}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                  placeholder="28"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Water %</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={water}
                  onChange={(e) => setWater(e.target.value)}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                  placeholder="0"
                />
              </div>
            </div>

            {parseFloat(water || '0') > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle size={16} />
                Added water detected ({water}%). Sample will be flagged as Adulterated.
              </div>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-all"
            >
              Save Test Results
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
