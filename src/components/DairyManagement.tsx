import React, { useState, useEffect } from 'react';
import { dairyApi, authApi, adminApi } from '../services/api';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Building2, Plus, Search, MapPin, Phone, Database, ExternalLink, Shield, X, FileText, Settings as SettingsIcon, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function DairyManagement() {
  const { profile, switchDatabase } = useAuth();
  const { handleError } = useErrorHandler();
  const [dairies, setDairies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [swaggerEnabled, setSwaggerEnabled] = useState(false);
  const [swaggerLoading, setSwaggerLoading] = useState(false);
  const [newDairy, setNewDairy] = useState({
    name: '',
    address: '',
    contact: '',
    username: '',
    password: '',
    databaseId: ''
  });

  const fetchDairies = async () => {
    if (profile?.role !== 'super_admin') return;
    setLoading(true);
    try {
      const [dairiesRes, swaggerRes] = await Promise.all([
        dairyApi.getAll(),
        adminApi.getSwaggerStatus()
      ]);
      setDairies(dairiesRes.data);
      setSwaggerEnabled(swaggerRes.data.enabled);
    } catch (err) {
      handleError(err, 'Failed to load system data');
    } finally {
      setLoading(false);
    }
  };

  const handleSwaggerToggle = async () => {
    setSwaggerLoading(true);
    try {
      const newStatus = !swaggerEnabled;
      await adminApi.toggleSwagger(newStatus);
      setSwaggerEnabled(newStatus);
      toast.success(`Swagger documentation ${newStatus ? 'enabled' : 'disabled'}`);
    } catch (err) {
      handleError(err, 'Failed to update Swagger status');
    } finally {
      setSwaggerLoading(false);
    }
  };

  useEffect(() => {
    fetchDairies();
  }, [profile]);

  if (profile?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield className="w-16 h-16 text-red-500 mb-4 opacity-20" />
        <h2 className="text-2xl font-serif font-medium text-stone-900 dark:text-white">Access Restricted</h2>
        <p className="text-stone-500 dark:text-stone-400 max-w-md mt-2">
          This section is only accessible to Super Administrators. Your current role is: <span className="font-bold uppercase">{profile?.role || 'unknown'}</span>
        </p>
      </div>
    );
  }

  const handleCreateDairy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authApi.register({
        username: newDairy.username,
        password: newDairy.password,
        role: 'admin',
        dairyData: {
          name: newDairy.name,
          address: newDairy.address,
          contact: newDairy.contact,
          databaseId: newDairy.databaseId
        }
      });
      toast.success('Dairy and Admin created successfully!');
      setIsAdding(false);
      fetchDairies();
      setNewDairy({ name: '', address: '', contact: '', username: '', password: '', databaseId: '' });
    } catch (err) {
      handleError(err, 'Failed to create dairy');
    }
  };

  const filteredDairies = dairies.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.databaseId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Dairy Management</h1>
          <p className="text-stone-500 dark:text-stone-400">Global overview of all registered dairies</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
        >
          <Plus size={18} />
          Register New Dairy
        </button>
      </div>

      {/* System Configuration Section */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 rounded-xl flex items-center justify-center">
            <SettingsIcon className="text-stone-400 dark:text-stone-500 w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">System Configuration</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">Global application settings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white dark:bg-stone-900 rounded-xl flex items-center justify-center shadow-sm">
                <FileText className="text-blue-500 w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-white">Swagger Documentation</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">Enable/Disable interactive API docs at /api-docs</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {swaggerEnabled && (
                <a 
                  href="/api-docs" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 text-stone-400 hover:text-stone-900 dark:hover:text-white transition-colors"
                  title="Open Documentation"
                >
                  <ExternalLink size={18} />
                </a>
              )}
              <button
                onClick={handleSwaggerToggle}
                disabled={swaggerLoading}
                className={cn(
                  "p-1 rounded-full transition-all duration-300",
                  swaggerEnabled ? "text-green-500" : "text-stone-300 dark:text-stone-600"
                )}
              >
                {swaggerEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-50 dark:border-stone-800">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
            <input
              type="text"
              placeholder="Search dairies..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-48 bg-stone-50 dark:bg-stone-800 rounded-2xl animate-pulse" />
            ))
          ) : filteredDairies.map((dairy) => (
            <div 
              key={dairy.id} 
              className={cn(
                "p-6 rounded-2xl border transition-all group",
                profile?.databaseId === dairy.databaseId 
                  ? "bg-stone-900 dark:bg-white border-stone-900 dark:border-white shadow-lg" 
                  : "bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-600"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  profile?.databaseId === dairy.databaseId 
                    ? "bg-white/10 dark:bg-stone-900/10" 
                    : "bg-stone-50 dark:bg-stone-800"
                )}>
                  <Building2 className={cn(
                    "w-6 h-6",
                    profile?.databaseId === dairy.databaseId 
                      ? "text-white dark:text-stone-900" 
                      : "text-stone-400 dark:text-stone-500"
                  )} />
                </div>
                <button
                  onClick={() => switchDatabase(dairy.databaseId)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                    profile?.databaseId === dairy.databaseId 
                      ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-white" 
                      : "bg-stone-900 dark:bg-white text-white dark:text-stone-900"
                  )}
                >
                  {profile?.databaseId === dairy.databaseId ? <Shield size={14} /> : <ExternalLink size={14} />}
                  {profile?.databaseId === dairy.databaseId ? 'Active' : 'Switch To'}
                </button>
              </div>

              <h3 className={cn(
                "text-lg font-serif font-medium mb-1",
                profile?.databaseId === dairy.databaseId ? "text-white dark:text-stone-900" : "text-stone-900 dark:text-white"
              )}>
                {dairy.name}
              </h3>
              
              <div className="space-y-2 mt-4">
                <div className="flex items-center gap-2 text-xs">
                  <MapPin size={14} className="text-stone-400" />
                  <span className={profile?.databaseId === dairy.databaseId ? "text-stone-300 dark:text-stone-600" : "text-stone-500 dark:text-stone-400"}>
                    {dairy.address}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Phone size={14} className="text-stone-400" />
                  <span className={profile?.databaseId === dairy.databaseId ? "text-stone-300 dark:text-stone-600" : "text-stone-500 dark:text-stone-400"}>
                    {dairy.contact}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Database size={14} className="text-stone-400" />
                  <span className={cn(
                    "font-mono",
                    profile?.databaseId === dairy.databaseId ? "text-stone-300 dark:text-stone-600" : "text-stone-500 dark:text-stone-400"
                  )}>
                    {dairy.databaseId}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-stone-900/20 dark:bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 w-full max-w-lg rounded-3xl shadow-xl overflow-hidden border border-stone-100 dark:border-stone-800">
            <div className="p-6 border-b border-stone-50 dark:border-stone-800 flex items-center justify-between">
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Register New Dairy</h2>
              <button onClick={() => setIsAdding(false)} className="text-stone-400 hover:text-stone-900 dark:hover:text-white">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateDairy} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-400 uppercase">Dairy Name</label>
                <input
                  required
                  value={newDairy.name}
                  onChange={e => setNewDairy({...newDairy, name: e.target.value})}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                  placeholder="e.g. Krishna Dairy"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Contact</label>
                  <input
                    required
                    value={newDairy.contact}
                    onChange={e => setNewDairy({...newDairy, contact: e.target.value})}
                    className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    placeholder="Phone number"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-stone-400 uppercase">Database ID</label>
                  <input
                    required
                    value={newDairy.databaseId}
                    onChange={e => setNewDairy({...newDairy, databaseId: e.target.value})}
                    className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    placeholder="e.g. krishna-dairy"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-400 uppercase">Address</label>
                <textarea
                  required
                  value={newDairy.address}
                  onChange={e => setNewDairy({...newDairy, address: e.target.value})}
                  className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white min-h-[80px]"
                  placeholder="Full address"
                />
              </div>
              
              <div className="pt-4 border-t border-stone-50 dark:border-stone-800">
                <p className="text-sm font-medium text-stone-900 dark:text-white mb-4">Admin Account Credentials</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-stone-400 uppercase">Username</label>
                    <input
                      required
                      value={newDairy.username}
                      onChange={e => setNewDairy({...newDairy, username: e.target.value})}
                      className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                      placeholder="Admin username"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-stone-400 uppercase">Password</label>
                    <input
                      required
                      type="password"
                      value={newDairy.password}
                      onChange={e => setNewDairy({...newDairy, password: e.target.value})}
                      className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                      placeholder="Admin password"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
                >
                  Register Dairy & Create Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
