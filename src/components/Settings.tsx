import React, { useState, useEffect } from 'react';
import { Settings2, Save, Globe, Bell, Shield, Database, Smartphone, Moon, Sun, Building2, MapPin, Phone } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { dairyApi } from '../services/api';
import { toast } from 'sonner';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'General' | 'Dairy Profile' | 'Security' | 'Notifications' | 'System'>('General');
  const { theme, toggleTheme } = useTheme();
  const { profile, updateProfile } = useAuth();
  const { handleError } = useErrorHandler();
  const [loading, setLoading] = useState(false);

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

  const handleSaveDairyInfo = async () => {
    if (!profile?.dairyId) return;
    setLoading(true);
    try {
      await dairyApi.update(profile.dairyId, dairyInfo);
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
              <button 
                onClick={activeTab === 'Dairy Profile' ? handleSaveDairyInfo : undefined}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div className="space-y-6">
              {activeTab === 'General' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Language</label>
                    <select className="w-full p-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none dark:text-white">
                      <option>English</option>
                      <option>Hindi</option>
                      <option>Marathi</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Appearance</label>
                    <button 
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
              {activeTab === 'Notifications' && (
                <div className="space-y-6">
                  <div className="p-6 bg-stone-50 dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 space-y-4">
                    <div className="flex items-center gap-3 text-stone-900 dark:text-white font-serif font-medium">
                      <Smartphone className="text-stone-400" size={20} />
                      SMS & WhatsApp Notifications
                    </div>
                    <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
                      Notifications are currently running in <strong>Simulation Mode</strong>. 
                      Real-time SMS and WhatsApp delivery is disabled for this version.
                    </p>
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-xl text-amber-700 dark:text-amber-400 text-xs">
                      <p className="font-medium mb-1">Notice:</p>
                      <p>All notification requests will be logged to the server console instead of being sent to actual mobile numbers.</p>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'System' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                    <div>
                      <p className="text-sm font-medium text-stone-900">Database Backup</p>
                      <p className="text-xs text-stone-500">Last backup: 2 hours ago</p>
                    </div>
                    <button className="px-4 py-2 bg-white border border-stone-100 rounded-xl text-xs font-medium hover:bg-stone-50 transition-colors">
                      Backup Now
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
