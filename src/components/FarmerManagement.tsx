import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { Farmer } from '../types';
import { Plus, UserPlus, Search, MoreVertical, Check, X, Eye } from 'lucide-react';
import { cn } from '../lib/utils';

export default function FarmerManagement() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const [newFarmer, setNewFarmer] = useState({
    farmerId: '',
    name: '',
    mobile: '',
    village: '',
    cattleType: 'Cow' as 'Cow' | 'Buffalo' | 'Mixed',
    bankAccount: '',
    ifsc: '',
  });

  useEffect(() => {
    const q = query(collection(db, 'farmers'), orderBy('farmerId', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFarmers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Farmer)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'farmers'));

    return () => unsubscribe();
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!newFarmer.farmerId.trim()) newErrors.farmerId = 'Member ID is required';
    if (!newFarmer.name.trim()) newErrors.name = 'Full Name is required';
    if (!newFarmer.village.trim()) newErrors.village = 'Village is required';
    
    const mobileRegex = /^[0-9]{10}$/;
    if (!newFarmer.mobile.trim()) {
      newErrors.mobile = 'Mobile number is required';
    } else if (!mobileRegex.test(newFarmer.mobile.trim())) {
      newErrors.mobile = 'Mobile number must be 10 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddFarmer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setLoading(true);
    try {
      const farmerData: Omit<Farmer, 'id'> = {
        ...newFarmer,
        status: 'Active',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'farmers'), farmerData);
      setIsAdding(false);
      setNewFarmer({
        farmerId: '',
        name: '',
        mobile: '',
        village: '',
        cattleType: 'Cow',
        bankAccount: '',
        ifsc: '',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'farmers');
    } finally {
      setLoading(false);
    }
  };

  const filteredFarmers = farmers.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.farmerId.includes(searchTerm)
  );

  const closeAdding = () => {
    setIsAdding(false);
    setErrors({});
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900">Farmers</h1>
          <p className="text-stone-500">Manage your member database</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
        >
          <UserPlus size={18} />
          Add Farmer
        </button>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-stone-50 flex items-center justify-between">
              <h2 className="text-xl font-serif font-medium text-stone-900">Register New Farmer</h2>
              <button onClick={closeAdding} className="text-stone-400 hover:text-stone-900">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddFarmer} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Member ID</label>
                  <input
                    required
                    value={newFarmer.farmerId}
                    onChange={e => {
                      setNewFarmer({...newFarmer, farmerId: e.target.value});
                      if (errors.farmerId) setErrors({...errors, farmerId: ''});
                    }}
                    className={cn(
                      "w-full p-3 bg-stone-50 border rounded-xl focus:outline-none",
                      errors.farmerId ? "border-red-300 bg-red-50" : "border-stone-100"
                    )}
                    placeholder="e.g. 101"
                  />
                  {errors.farmerId && <p className="text-[10px] text-red-500 font-medium">{errors.farmerId}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Cattle Type</label>
                  <select
                    value={newFarmer.cattleType}
                    onChange={e => setNewFarmer({...newFarmer, cattleType: e.target.value as any})}
                    className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none"
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
                  value={newFarmer.name}
                  onChange={e => {
                    setNewFarmer({...newFarmer, name: e.target.value});
                    if (errors.name) setErrors({...errors, name: ''});
                  }}
                  className={cn(
                    "w-full p-3 bg-stone-50 border rounded-xl focus:outline-none",
                    errors.name ? "border-red-300 bg-red-50" : "border-stone-100"
                  )}
                  placeholder="Enter farmer name"
                />
                {errors.name && <p className="text-[10px] text-red-500 font-medium">{errors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Mobile</label>
                  <input
                    value={newFarmer.mobile}
                    onChange={e => {
                      setNewFarmer({...newFarmer, mobile: e.target.value});
                      if (errors.mobile) setErrors({...errors, mobile: ''});
                    }}
                    className={cn(
                      "w-full p-3 bg-stone-50 border rounded-xl focus:outline-none",
                      errors.mobile ? "border-red-300 bg-red-50" : "border-stone-100"
                    )}
                    placeholder="10-digit number"
                  />
                  {errors.mobile && <p className="text-[10px] text-red-500 font-medium">{errors.mobile}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Village</label>
                  <input
                    required
                    value={newFarmer.village}
                    onChange={e => {
                      setNewFarmer({...newFarmer, village: e.target.value});
                      if (errors.village) setErrors({...errors, village: ''});
                    }}
                    className={cn(
                      "w-full p-3 bg-stone-50 border rounded-xl focus:outline-none",
                      errors.village ? "border-red-300 bg-red-50" : "border-stone-100"
                    )}
                    placeholder="Village name"
                  />
                  {errors.village && <p className="text-[10px] text-red-500 font-medium">{errors.village}</p>}
                </div>
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Registering...' : 'Register Farmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50">
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">ID</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Farmer Name</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Village</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Cattle</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {filteredFarmers.map((f) => (
                <tr key={f.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-stone-500">{f.farmerId}</td>
                  <td className="px-6 py-4">
                    <Link to={`/farmers/${f.id}`} className="hover:underline group">
                      <p className="text-sm font-medium text-stone-900 group-hover:text-blue-600 transition-colors">{f.name}</p>
                      <p className="text-xs text-stone-400">{f.mobile}</p>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">{f.village}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-1 rounded-lg">
                      {f.cattleType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <Check size={14} />
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link 
                        to={`/farmers/${f.id}`}
                        className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors"
                        title="View Profile"
                      >
                        <Eye size={18} />
                      </Link>
                      <button className="p-2 text-stone-400 hover:text-stone-900 rounded-lg">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFarmers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-400 italic">No farmers found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
