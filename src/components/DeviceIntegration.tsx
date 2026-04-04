import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';
import { Settings2, Plus, Search, FileText, Trash2, Edit2, Cpu, CheckCircle2, AlertCircle, RefreshCw, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function DeviceIntegration() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'Weighing' | 'Analyzer' | 'Printer'>('Weighing');
  const [isConnecting, setIsConnecting] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);

  const handleConnect = (id: number) => {
    setIsConnecting(true);
    toast.loading('Connecting to device...', { id: 'device-connect' });
    
    setTimeout(() => {
      setDevices(prev => prev.map(d => d.id === id ? { ...d, status: 'Online' } : d));
      setIsConnecting(false);
      toast.success('Device connected successfully!', { id: 'device-connect' });
    }, 2000);
  };

  const handleDisconnect = (id: number) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, status: 'Offline' } : d));
    toast.error('Device disconnected');
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900">{t('devices')}</h1>
          <p className="text-stone-500">Configure and monitor hardware status</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors">
          <Plus size={18} />
          Add New Device
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="flex border-b border-stone-100">
              {(['Weighing', 'Analyzer', 'Printer'] as const).map((tab) => (
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
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-6">
              <div className="divide-y divide-stone-50">
                {devices.filter(d => d.type === activeTab).map((device) => (
                  <div key={device.id} className="py-4 flex items-center justify-between hover:bg-stone-50/50 transition-colors px-2 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        device.status === 'Online' ? "bg-emerald-50 text-emerald-600" : "bg-stone-50 text-stone-400"
                      )}>
                        <Cpu size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-900">{device.name}</p>
                        <p className="text-xs text-stone-500">Model: {device.model} • Serial: {device.serial}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        device.status === 'Online' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                      )}>
                        {device.status}
                      </span>
                      {device.status === 'Offline' ? (
                        <button 
                          onClick={() => handleConnect(device.id)}
                          className="p-2 text-stone-400 hover:text-stone-900 transition-colors"
                        >
                          <RefreshCw size={16} className={cn(isConnecting && "animate-spin")} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleDisconnect(device.id)}
                          className="p-2 text-stone-400 hover:text-red-600 transition-colors"
                        >
                          <AlertCircle size={16} />
                        </button>
                      )}
                      <button className="p-2 text-stone-400 hover:text-stone-900 transition-colors">
                        <Settings2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {devices.filter(d => d.type === activeTab).length === 0 && (
                  <div className="py-12 text-center text-stone-400 italic text-sm">
                    No {activeTab} devices configured
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 mb-4">Hardware Status</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                <span className="text-sm text-stone-500">Connected Devices</span>
                <span className="text-lg font-serif font-medium text-stone-900">
                  {devices.filter(d => d.status === 'Online').length}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                <span className="text-sm text-stone-500">Offline Devices</span>
                <span className="text-lg font-serif font-medium text-red-600">
                  {devices.filter(d => d.status === 'Offline').length}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                <span className="text-sm text-stone-500">Last Sync</span>
                <span className="text-sm font-medium text-stone-900">Just now</span>
              </div>
            </div>
          </div>

          <div className="bg-stone-900 p-6 rounded-3xl text-white relative overflow-hidden">
            <Activity className="absolute bottom-[-20px] right-[-20px] w-32 h-32 opacity-10" />
            <h3 className="text-sm font-serif font-medium mb-2 uppercase tracking-wider">Real-time Data</h3>
            <p className="text-xs text-stone-400 mb-4 leading-relaxed">
              Connected devices are streaming data to the collection entry form automatically.
            </p>
            <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Streaming Active
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
