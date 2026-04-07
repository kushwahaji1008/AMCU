import React, { useState, useEffect } from 'react';
import { farmerApi } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Farmer } from '../types';
import { Plus, UserPlus, Search, MoreVertical, Check, X, Eye, QrCode, Download, Edit2, Trash2 } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function FarmerManagement() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { handleError } = useErrorHandler();
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingFarmerId, setEditingFarmerId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const fetchFarmers = async () => {
    try {
      const response = await farmerApi.getAll();
      setFarmers(response.data);
    } catch (err) {
      handleError(err, 'Failed to load farmers');
    }
  };

  useEffect(() => {
    fetchFarmers();
  }, []);

  const downloadBarcode = (farmerId: string, farmerName: string) => {
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, farmerId, {
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
      link.download = `Barcode_${farmerId}_${farmerName.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Barcode for ${farmerName} downloaded`);
    } catch (err) {
      console.error('Barcode generation failed:', err);
      toast.error('Failed to generate barcode');
    }
  };

  const [newFarmer, setNewFarmer] = useState({
    farmerId: '',
    name: '',
    mobile: '',
    village: '',
    cattleType: 'Cow' as 'Cow' | 'Buffalo' | 'Mixed',
    bankAccount: '',
    ifsc: '',
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const trimmedFarmerId = newFarmer.farmerId.trim();
    const trimmedMobile = newFarmer.mobile.trim();

    if (!trimmedFarmerId) newErrors.farmerId = 'Member ID is required';
    
    // Check for unique Farmer ID
    if (farmers.some(f => f.farmerId === trimmedFarmerId && f.id !== editingFarmerId)) {
      newErrors.farmerId = 'Member ID already exists';
    }

    if (!newFarmer.name.trim()) newErrors.name = 'Full Name is required';
    if (!newFarmer.village.trim()) newErrors.village = 'Village is required';
    
    const mobileRegex = /^[0-9]{10}$/;
    if (!trimmedMobile) {
      newErrors.mobile = 'Mobile number is required';
    } else if (!mobileRegex.test(trimmedMobile)) {
      newErrors.mobile = 'Mobile number must be 10 digits';
    } else if (farmers.some(f => f.mobile === trimmedMobile && f.id !== editingFarmerId)) {
      newErrors.mobile = 'Mobile number already registered';
      toast.error(`Mobile number ${trimmedMobile} is already assigned to another farmer`);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddFarmer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setLoading(true);
    try {
      if (isEditing && editingFarmerId) {
        await farmerApi.update(editingFarmerId, newFarmer);
        toast.success('Farmer details updated successfully!');
        setIsEditing(false);
        setEditingFarmerId(null);
      } else {
        const farmerData = {
          ...newFarmer,
          status: 'Active',
          balance: 0,
          dairyId: profile?.dairyId || '',
        };
        await farmerApi.create(farmerData);
        
        toast.success('Farmer registered successfully!', {
          action: {
            label: 'Download Barcode',
            onClick: () => downloadBarcode(newFarmer.farmerId, newFarmer.name)
          }
        });
      }
      setIsAdding(false);
      fetchFarmers();
      
      setNewFarmer({
        farmerId: '',
        name: '',
        mobile: '',
        village: '',
        cattleType: 'Cow',
        bankAccount: '',
        ifsc: '',
      });
    } catch (err: any) {
      handleError(err, 'Failed to save farmer');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (farmer: Farmer) => {
    setNewFarmer({
      farmerId: farmer.farmerId,
      name: farmer.name,
      mobile: farmer.mobile,
      village: farmer.village,
      cattleType: farmer.cattleType,
      bankAccount: farmer.bankAccount || '',
      ifsc: farmer.ifsc || '',
    });
    setEditingFarmerId(farmer.id);
    setIsEditing(true);
    setIsAdding(true);
  };

  const handleDeleteFarmer = async (id: string) => {
    setLoading(true);
    try {
      await farmerApi.delete(id);
      toast.success('Farmer deleted successfully');
      setDeleteConfirmId(null);
      fetchFarmers();
    } catch (err: any) {
      handleError(err, 'Failed to delete farmer');
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
    setIsEditing(false);
    setEditingFarmerId(null);
    setErrors({});
    setNewFarmer({
      farmerId: '',
      name: '',
      mobile: '',
      village: '',
      cattleType: 'Cow',
      bankAccount: '',
      ifsc: '',
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Farmers</h1>
          <p className="text-stone-500 dark:text-stone-400">Manage your member database</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
        >
          <UserPlus size={18} />
          Add Farmer
        </button>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-stone-900/20 dark:bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 w-full max-w-lg rounded-3xl shadow-xl overflow-hidden border border-stone-100 dark:border-stone-800">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800 flex items-center justify-between">
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">
                {isEditing ? 'Edit Farmer Details' : 'Register New Farmer'}
              </h2>
              <button onClick={closeAdding} className="text-stone-400 hover:text-stone-900 dark:hover:text-white">
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
                      "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                      errors.farmerId ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
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
                  value={newFarmer.name}
                  onChange={e => {
                    setNewFarmer({...newFarmer, name: e.target.value});
                    if (errors.name) setErrors({...errors, name: ''});
                  }}
                  className={cn(
                    "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                    errors.name ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
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
                      "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                      errors.mobile ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
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
                      "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                      errors.village ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
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
                  className="w-full py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
                >
                  {loading ? (isEditing ? 'Updating...' : 'Registering...') : (isEditing ? 'Update Farmer' : 'Register Farmer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-50 dark:border-stone-800">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 dark:bg-stone-800/50">
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">ID</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Farmer Name</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Village</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Cattle</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
              {filteredFarmers.map((f) => (
                <tr key={f.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-stone-500 dark:text-stone-400">{f.farmerId}</span>
                      <button 
                        onClick={() => downloadBarcode(f.farmerId, f.name)}
                        className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded transition-colors"
                      >
                        Download Barcode
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/farmers/${f.id}`} className="hover:underline group">
                      <p className="text-sm font-medium text-stone-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{f.name}</p>
                      <p className="text-xs text-stone-400 dark:text-stone-500">{f.mobile}</p>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">{f.village}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-lg">
                      {f.cattleType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check size={14} />
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => downloadBarcode(f.farmerId, f.name)}
                        className="p-2 text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors"
                        title="Download Barcode"
                      >
                        <QrCode size={18} />
                      </button>
                      <Link 
                        to={`/farmers/${f.id}`}
                        className="p-2 text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors"
                        title="View Profile"
                      >
                        <Eye size={18} />
                      </Link>
                      <button 
                        onClick={() => handleEditClick(f)}
                        className="p-2 text-stone-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors"
                        title="Edit Farmer"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmId(f.id)}
                        className="p-2 text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors"
                        title="Delete Farmer"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button className="p-2 text-stone-400 hover:text-stone-900 dark:hover:text-white rounded-lg">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFarmers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-400 dark:text-stone-500 italic">No farmers found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirmId && (
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
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConfirmId && handleDeleteFarmer(deleteConfirmId)}
                disabled={loading}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
