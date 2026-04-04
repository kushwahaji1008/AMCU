import React, { useState } from 'react';
import { Settings2, Save, Globe, Bell, Shield, Database, Smartphone } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'General' | 'Security' | 'Notifications' | 'System'>('General');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-stone-900">Settings & Configuration</h1>
        <p className="text-stone-500">Configure system preferences and global settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-2">
          {[
            { id: 'General', icon: Globe },
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
                  ? "bg-stone-900 text-white shadow-sm" 
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-900"
              )}
            >
              <tab.icon size={18} />
              {tab.id}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-serif font-medium text-stone-900">{activeTab} Settings</h2>
              <button className="flex items-center gap-2 px-6 py-2 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors">
                <Save size={18} />
                Save Changes
              </button>
            </div>

            <div className="space-y-6">
              {activeTab === 'General' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Society Name</label>
                    <input type="text" className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none" placeholder="DugdhaSetu Society" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Contact Email</label>
                    <input type="email" className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none" placeholder="contact@dugdhasetu.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Currency Symbol</label>
                    <input type="text" className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none" placeholder="₹" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Language</label>
                    <select className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none">
                      <option>English</option>
                      <option>Hindi</option>
                      <option>Marathi</option>
                    </select>
                  </div>
                </div>
              )}
              {activeTab === 'Notifications' && (
                <div className="space-y-6">
                  <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
                    <div className="flex items-center gap-3 text-stone-900 font-serif font-medium">
                      <Smartphone className="text-stone-400" size={20} />
                      SMS & WhatsApp Notifications
                    </div>
                    <p className="text-sm text-stone-500 leading-relaxed">
                      To enable real-time SMS and WhatsApp alerts for farmers, you must configure your Twilio credentials. 
                      Since these are sensitive keys, they should be added as **Secrets** in the AI Studio Settings panel.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="p-3 bg-white border border-stone-100 rounded-xl">
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Required Secret</p>
                        <p className="text-xs font-mono text-stone-600">TWILIO_ACCOUNT_SID</p>
                      </div>
                      <div className="p-3 bg-white border border-stone-100 rounded-xl">
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Required Secret</p>
                        <p className="text-xs font-mono text-stone-600">TWILIO_AUTH_TOKEN</p>
                      </div>
                      <div className="p-3 bg-white border border-stone-100 rounded-xl">
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Required Secret</p>
                        <p className="text-xs font-mono text-stone-600">TWILIO_PHONE_NUMBER</p>
                      </div>
                      <div className="p-3 bg-white border border-stone-100 rounded-xl">
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Optional Secret</p>
                        <p className="text-xs font-mono text-stone-600">TWILIO_WHATSAPP_NUMBER</p>
                      </div>
                    </div>
                    <div className="pt-2">
                      <a 
                        href="https://www.twilio.com/console" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-stone-900 font-medium underline underline-offset-4 hover:text-stone-600"
                      >
                        Get your credentials from Twilio Console →
                      </a>
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
