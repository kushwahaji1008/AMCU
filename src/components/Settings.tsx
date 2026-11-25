import React, { useState, useEffect } from 'react';
import { Globe, Bell, Shield, Database, Smartphone, Moon, Sun, Building2, MapPin, Phone, Save, LogOut, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../AuthContext';
import { dairyApi, clearApiCache } from '../services/api';
import { realmInstance } from '../services/realm';
import { toast } from 'sonner';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'General' | 'Dairy Profile' | 'Security' | 'Notifications' | 'System'>('General');
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { profile, updateProfile, logout } = useAuth();
  const { handleError } = useErrorHandler();
  const [loading, setLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => localStorage.getItem('dugdhasetu_last_backup'));

  const [dairyInfo, setDairyInfo] = useState({
    name: profile?.dairyName || '',
    address: profile?.address || '',
    phone: profile?.phone || '',
    email: profile?.email || '',
  });

  useEffect(() => {
    if (profile) {
      setDairyInfo({
        name: profile.dairyName || '',
        address: profile.address || '',
        phone: profile.phone || '',
        email: profile.email || '',
      });
    }
  }, [profile]);

  const handleSaveGeneral = () => {
    localStorage.setItem('dugdhasetu_lang', language);
    toast.success('General preferences saved');
  };

  const handleSaveDairyInfo = async () => {
    const targetDairyId = profile?.dairyId || profile?.databaseId;
    if (!targetDairyId) {
      toast.error('No active dairy profile found');
      return;
    }
    setLoading(true);
    try {
      await dairyApi.update(targetDairyId, dairyInfo);
      updateProfile({
        dairyName: dairyInfo.name,
        address: dairyInfo.address,
        phone: dairyInfo.phone,
      });
      toast.success('Dairy information updated successfully');
    } catch (err) {
      handleError(err, 'Failed to update dairy info');
    } finally {
      setLoading(false);
    }
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      await realmInstance.saveBackupToFilesystem();
      const now = new Date().toISOString();
      localStorage.setItem('dugdhasetu_last_backup', now);
      setLastBackupAt(now);
      toast.success('Database backup completed');
    } catch (err) {
      handleError(err, 'Failed to export database backup');
    } finally {
      setBackingUp(false);
    }
  };

  const handleClearCache = () => {
    clearApiCache();
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('dashboard_')) {
        localStorage.removeItem(key);
      }
    });
    toast.success('Local API and dashboard caches cleared');
  };

  const showSaveButton = activeTab === 'General' || activeTab === 'Dairy Profile';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">Settings & Configuration</h1>
        <p className="text-stone-500 dark:text-stone-400">Configure system preferences and global settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-2">
          {[
            { id: 'General', icon: Globe },
            { id: 'Dairy Profile', icon: Building2 },
            { id: 'Security', icon: Shield },
            { id: 'Notifications', icon: Bell },
            { id: 'System', icon: Database },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab.id 
                  ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm" 
                  : "text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white"
              )}
            >
              <tab.icon size={18} />
              {tab.id}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">{activeTab} Settings</h2>
              {showSaveButton && (
                <button 
                  onClick={activeTab === 'Dairy Profile' ? handleSaveDairyInfo : handleSaveGeneral}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
                >
                  <Save size={18} />
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>

            <div className="space-y-6">
              {activeTab === 'General' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
                      className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white"
                    >
                      <option value="en">English</option>
                      <option value="hi">Hindi (हिन्दी)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Appearance</label>
                    <button 
                      type="button"
                      onClick={toggleTheme}
                      className="w-full flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                    >
                      <span className="text-sm text-stone-600 dark:text-stone-300 flex items-center gap-2">
                        {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                        {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
                      </span>
                      <div className={cn(
                        "w-10 h-5 rounded-full relative transition-colors",
                        theme === 'dark' ? "bg-stone-700" : "bg-stone-300"
                      )}>
                        <div className={cn(
                          "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                          theme === 'dark' ? "left-6" : "left-1"
                        )} />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'Dairy Profile' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Dairy Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                      <input 
                        type="text" 
                        value={dairyInfo.name}
                        onChange={e => setDairyInfo({...dairyInfo, name: e.target.value})}
                        className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white" 
                        placeholder="Dairy Name" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Contact Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                      <input 
                        type="text" 
                        value={dairyInfo.phone}
                        onChange={e => setDairyInfo({...dairyInfo, phone: e.target.value})}
                        className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white" 
                        placeholder="Phone Number" 
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 text-stone-400" size={18} />
                      <textarea 
                        value={dairyInfo.address}
                        onChange={e => setDairyInfo({...dairyInfo, address: e.target.value})}
                        className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white min-h-[100px]" 
                        placeholder="Full Address" 
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Security' && (
                <div className="space-y-4">
                  <div className="p-6 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-500 dark:text-stone-400">Signed-in Account</span>
                      <span className="font-medium text-stone-900 dark:text-white">{profile?.displayName || profile?.email}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-500 dark:text-stone-400">Assigned Role</span>
                      <span className="font-mono uppercase text-xs font-bold px-2.5 py-0.5 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200">
                        {profile?.role || 'unknown'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-500 dark:text-stone-400">Active Tenant Database</span>
                      <span className="font-mono text-xs text-stone-700 dark:text-stone-300">{profile?.databaseId || '(default)'}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-stone-900 dark:text-white">Active Session</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">Invalidate your current JWT session token and sign out immediately.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 rounded-xl text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <LogOut size={14} />
                      Sign Out Session
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'Notifications' && (
                <div className="space-y-6">
                  <div className="p-6 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 space-y-4">
                    <div className="flex items-center gap-3 text-stone-900 dark:text-white font-serif font-medium">
                      <Smartphone className="text-stone-400" size={20} />
                      SMS & WhatsApp Notifications
                    </div>
                    <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
                      On web browsers, SMS notifications run in <strong>Simulation Mode</strong>. Native Android builds dispatch SMS via the device SIM when granted SMS permission.
                    </p>
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-xl text-amber-700 dark:text-amber-400 text-xs">
                      <p className="font-medium mb-1">Notice:</p>
                      <p>Web browser sessions log outgoing SMS previews to the browser console instead of transmitting over a carrier network.</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'System' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700">
                    <div>
                      <p className="text-sm font-medium text-stone-900 dark:text-white">Database Backup</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {lastBackupAt ? `Last backup: ${new Date(lastBackupAt).toLocaleString()}` : 'No manual backup exported in this browser yet'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleBackupNow}
                      disabled={backingUp}
                      className="px-4 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-medium text-stone-900 dark:text-white hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors disabled:opacity-50"
                    >
                      {backingUp ? 'Exporting...' : 'Backup Now'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700">
                    <div>
                      <p className="text-sm font-medium text-stone-900 dark:text-white">Clear Client Cache</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">Clears in-memory API response cache and cached dashboard metrics.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearCache}
                      className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-medium text-stone-900 dark:text-white hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                    >
                      <RefreshCw size={13} />
                      Clear Cache
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
