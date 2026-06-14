import React, { useState, useEffect } from 'react';
import { saleApi } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Customer } from '../types';
import { Plus, UserPlus, Search, MoreVertical, Check, X, Eye, Trash2, Edit2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function CustomerManagement() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { handleError } = useErrorHandler();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const fetchCustomers = async () => {
    try {
      const response = await saleApi.getCustomers();
      setCustomers(response.data);
    } catch (err) {
      handleError(err, 'Failed to load customers');
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    mobile: '',
    village: '',
    address: '',
    type: 'Individual' as 'Individual' | 'Commercial',
    defaultSaleRate: '' as number | string,
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const trimmedMobile = newCustomer.mobile.trim();

    if (!newCustomer.name.trim()) newErrors.name = 'Full Name is required';
    if (!newCustomer.village.trim()) newErrors.village = 'Village is required';
    
    const mobileRegex = /^[0-9]{10}$/;
    if (!trimmedMobile) {
      newErrors.mobile = 'Mobile number is required';
    } else if (!mobileRegex.test(trimmedMobile)) {
      newErrors.mobile = 'Mobile number must be 10 digits';
    } 

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setLoading(true);
    try {
      if (isEditing && editingCustomerId) {
        await saleApi.updateCustomer(editingCustomerId, newCustomer);
        toast.success('Customer details updated successfully!');
        setIsEditing(false);
        setEditingCustomerId(null);
      } else {
        const customerData = {
          ...newCustomer,
          status: 'Active',
          balance: 0,
          dairyId: profile?.dairyId || '',
        };
        await saleApi.createCustomer(customerData);
        toast.success('Customer registered successfully!');
      }
      setIsAdding(false);
      fetchCustomers();
      
      setNewCustomer({
        name: '',
        mobile: '',
        village: '',
        address: '',
        type: 'Individual',
        defaultSaleRate: '',
      });
    } catch (err: any) {
      handleError(err, 'Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (customer: Customer) => {
    setNewCustomer({
      name: customer.name || '',
      mobile: customer.mobile || '',
      village: customer.village || '',
      address: customer.address || '',
      type: customer.type || 'Individual',
      defaultSaleRate: customer.defaultSaleRate || '',
    });
    setEditingCustomerId(customer.id);
    setIsEditing(true);
    setIsAdding(true);
  };

  const handleDeleteCustomer = async (id: string) => {
    setLoading(true);
    try {
      await saleApi.deleteCustomer(id);
      toast.success('Customer deleted successfully');
      setDeleteConfirmId(null);
      fetchCustomers();
    } catch (err: any) {
      handleError(err, 'Failed to delete customer');
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(f => 
    (f.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (f.mobile || '').includes(searchTerm)
  );

  const closeAdding = () => {
    setIsAdding(false);
    setIsEditing(false);
    setEditingCustomerId(null);
    setErrors({});
    setNewCustomer({
      name: '',
      mobile: '',
      village: '',
      address: '',
      type: 'Individual',
      defaultSaleRate: '',
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Customers</h1>
          <p className="text-stone-500 dark:text-stone-400">Manage your customer database</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
        >
          <UserPlus size={18} />
          Add Customer
        </button>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-stone-900/20 dark:bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 w-full max-w-lg rounded-3xl shadow-xl overflow-hidden border border-stone-100 dark:border-stone-800">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800 flex items-center justify-between">
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">
                {isEditing ? 'Edit Customer' : 'Register Customer'}
              </h2>
              <button onClick={closeAdding} className="text-stone-400 hover:text-stone-900 dark:hover:text-white">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-400 uppercase">Customer Type</label>
                <select
                  value={newCustomer.type}
                  onChange={e => setNewCustomer({...newCustomer, type: e.target.value as 'Individual' | 'Commercial'})}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                >
                  <option value="Individual">Individual</option>
                  <option value="Commercial">Commercial</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-400 uppercase">Full Name</label>
                <input
                  required
                  value={newCustomer.name}
                  onChange={e => {
                    setNewCustomer({...newCustomer, name: e.target.value});
                    if (errors.name) setErrors({...errors, name: ''});
                  }}
                  className={cn(
                    "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                    errors.name ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
                  )}
                  placeholder="Enter name"
                />
                {errors.name && <p className="text-[10px] text-red-500 font-medium">{errors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Mobile</label>
                  <input
                    value={newCustomer.mobile}
                    onChange={e => {
                      setNewCustomer({...newCustomer, mobile: e.target.value});
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
                  <label className="text-xs font-medium text-stone-400 uppercase">Village / City</label>
                  <input
                    required
                    value={newCustomer.village}
                    onChange={e => {
                      setNewCustomer({...newCustomer, village: e.target.value});
                      if (errors.village) setErrors({...errors, village: ''});
                    }}
                    className={cn(
                      "w-full p-3 bg-stone-50 dark:bg-stone-800 border rounded-xl focus:outline-none dark:text-white",
                      errors.village ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-stone-100 dark:border-stone-700"
                    )}
                    placeholder="Location"
                  />
                  {errors.village && <p className="text-[10px] text-red-500 font-medium">{errors.village}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Address</label>
                  <input
                    value={newCustomer.address}
                    onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                    className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    placeholder="Optional detailed address"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Default Sale Rate (₹/L)</label>
                  <input
                    type="number"
                    value={newCustomer.defaultSaleRate}
                    onChange={e => setNewCustomer({...newCustomer, defaultSaleRate: e.target.value ? Number(e.target.value) : ''})}
                    className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    placeholder="e.g. 50"
                  />
                </div>
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
                >
                  {loading ? (isEditing ? 'Updating...' : 'Registering...') : (isEditing ? 'Update Customer' : 'Register Customer')}
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
              placeholder="Search by name or mobile..."
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
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Location</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-4 text-xs font-medium text-stone-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
              {filteredCustomers.map((f) => (
                <tr key={f.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-stone-900 dark:text-white transition-colors">{f.name}</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500">{f.mobile}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">
                    {f.village}
                    {f.address && <div className="text-[10px] max-w-[150px] truncate">{f.address}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-lg">
                      {f.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check size={14} />
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-sm font-medium",
                      (f.balance || 0) > 0 ? "text-red-500" : "text-stone-600 dark:text-stone-400"
                    )}>
                      ₹{(f.balance || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button 
                        onClick={() => handleEditClick(f)}
                        className="p-2 text-stone-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors"
                        title="Edit Customer"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmId(f.id)}
                        className="p-2 text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors"
                        title="Delete Customer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-400 dark:text-stone-500 italic">No customers found</td>
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
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Delete Customer?</h2>
              <p className="text-stone-500 dark:text-stone-400">
                Are you sure you want to delete this customer? This action cannot be undone.
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
                onClick={() => deleteConfirmId && handleDeleteCustomer(deleteConfirmId)}
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
