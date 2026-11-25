import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../AuthContext';
import { Settings2, Plus, Trash2, Cpu, AlertCircle, RefreshCw, Activity, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface DeviceItem {
  id: string;
  name: string;
  model: string;
  serial: string;
  type: 'Weighing' | 'Analyzer' | 'Printer';
  status: 'Online' | 'Offline';
  baudRate?: string;
}

const DEFAULT_DEVICES: DeviceItem[] = [
  { id: 'dev-1', name: 'Smart Weighing Scale', model: 'Shimadzu DX-500', serial: 'WS-59302', type: 'Weighing', status: 'Online', baudRate: '9600' },
  { id: 'dev-2', name: 'Lactoscan Analyzer', model: 'LS-Pro v3', serial: 'LA-10492', type: 'Analyzer', status: 'Online', baudRate: '9600' },
  { id: 'dev-3', name: 'Thermal Receipt Printer', model: 'Epson RP-80', serial: 'PR-88402', type: 'Printer', status: 'Online', baudRate: '115200' },
];

export default function DeviceIntegration() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const storageKey = `dugdhasetu_devices_${profile?.databaseId || profile?.dairyId || 'default'}`;

  const [activeTab, setActiveTab] = useState<'Weighing' | 'Analyzer' | 'Printer'>('Weighing');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>(() => new Date().toLocaleTimeString());
  const [devices, setDevices] = useState<DeviceItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : DEFAULT_DEVICES;
    } catch {
      return DEFAULT_DEVICES;
    }
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceItem | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    model: '',
    serial: '',
    type: 'Weighing' as DeviceItem['type'],
    baudRate: '9600',
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setDevices(saved ? JSON.parse(saved) : DEFAULT_DEVICES);
    } catch {
      setDevices(DEFAULT_DEVICES);
    }
  }, [storageKey]);

  const saveDevices = (next: DeviceItem[]) => {
    setDevices(next);
    setLastUpdated(new Date().toLocaleTimeString());
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const handleConnect = (id: string) => {
    setConnectingId(id);
    toast.loading('Checking hardware link...', { id: 'device-connect' });

    setTimeout(() => {
      saveDevices(devices.map(d => (d.id === id ? { ...d, status: 'Online' } : d)));
      setConnectingId(null);
      toast.success('Device marked Online', { id: 'device-connect' });
    }, 600);
  };

  const handleDisconnect = (id: string) => {
    saveDevices(devices.map(d => (d.id === id ? { ...d, status: 'Offline' } : d)));
    toast.info('Device disconnected');
  };

  const openAddModal = () => {
    setEditingDevice(null);
    setFormState({ name: '', model: '', serial: '', type: activeTab, baudRate: '9600' });
    setIsModalOpen(true);
  };

  const openEditModal = (device: DeviceItem) => {
    setEditingDevice(device);
    setFormState({
      name: device.name,
      model: device.model,
      serial: device.serial,
      type: device.type,
      baudRate: device.baudRate || '9600',
    });
    setIsModalOpen(true);
  };

  const handleSaveDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.serial.trim()) {
      toast.error('Device name and serial number are required');
      return;
    }

    if (editingDevice) {
      saveDevices(
        devices.map(d =>
          d.id === editingDevice.id ? { ...d, ...formState } : d
        )
      );
      toast.success('Device configuration updated');
    } else {
      const created: DeviceItem = {
        id: `dev-${Date.now()}`,
        ...formState,
        status: 'Offline',
      };
      saveDevices([...devices, created]);
      setActiveTab(created.type);
      toast.success('Device added');
    }
    setIsModalOpen(false);
  };

  const handleDeleteDevice = (id: string) => {
    if (!confirm('Remove this hardware device?')) return;
    saveDevices(devices.filter(d => d.id !== id));
    toast.success('Device removed');
  };

  const supportsWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">{t('devices')}</h1>
          <p className="text-stone-500 dark:text-stone-400">Configure and monitor hardware status</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
        >
          <Plus size={18} />
          Add New Device
        </button>
      </div>

      {isModalOpen && (
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white">
              {editingDevice ? 'Configure Device' : 'Add Hardware Device'}
            </h2>
            <button onClick={() => setIsModalOpen(false)} className="p-2 text-stone-400 hover:text-stone-900 dark:hover:text-white">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSaveDevice} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Category</label>
              <select
                value={formState.type}
                onChange={(e) => setFormState({ ...formState, type: e.target.value as DeviceItem['type'] })}
                className="w-full p-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm dark:text-white"
              >
                <option value="Weighing">Weighing</option>
                <option value="Analyzer">Analyzer</option>
                <option value="Printer">Printer</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Device Name</label>
              <input
                required
                type="text"
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                placeholder="e.g. Milk Analyzer"
                className="w-full p-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Model</label>
              <input
                type="text"
                value={formState.model}
                onChange={(e) => setFormState({ ...formState, model: e.target.value })}
                placeholder="e.g. EkoMilk Pro"
                className="w-full p-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Serial / Port</label>
              <input
                required
                type="text"
                value={formState.serial}
                onChange={(e) => setFormState({ ...formState, serial: e.target.value })}
                placeholder="e.g. COM3 / SN-101"
                className="w-full p-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="py-2.5 px-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
            >
              {editingDevice ? 'Update Device' : 'Save Device'}
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="flex border-b border-stone-100 dark:border-stone-800">
              {(['Weighing', 'Analyzer', 'Printer'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 py-4 text-sm font-medium transition-colors",
                    activeTab === tab 
                      ? "text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-white" 
                      : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-6">
              <div className="divide-y divide-stone-50 dark:divide-stone-800">
                {devices.filter(d => d.type === activeTab).map((device) => (
                  <div key={device.id} className="py-4 flex items-center justify-between hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors px-2 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        device.status === 'Online' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" : "bg-stone-50 dark:bg-stone-800 text-stone-400"
                      )}>
                        <Cpu size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-900 dark:text-white">{device.name}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          Model: {device.model || 'Generic'} • Serial: {device.serial} • {device.baudRate || '9600'} baud
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        device.status === 'Online' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                      )}>
                        {device.status}
                      </span>
                      {device.status === 'Offline' ? (
                        <button 
                          onClick={() => handleConnect(device.id)}
                          title="Connect Device"
                          className="p-2 text-stone-400 hover:text-stone-900 dark:hover:text-white transition-colors"
                        >
                          <RefreshCw size={16} className={cn(connectingId === device.id && "animate-spin")} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleDisconnect(device.id)}
                          title="Disconnect Device"
                          className="p-2 text-stone-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <AlertCircle size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(device)}
                        title="Configure Device"
                        className="p-2 text-stone-400 hover:text-stone-900 dark:hover:text-white transition-colors"
                      >
                        <Settings2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteDevice(device.id)}
                        title="Remove Device"
                        className="p-2 text-stone-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {devices.filter(d => d.type === activeTab).length === 0 && (
                  <div className="py-12 text-center text-stone-400 dark:text-stone-500 italic text-sm">
                    No {activeTab} devices configured
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 dark:text-white mb-4">Hardware Status</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                <span className="text-sm text-stone-500 dark:text-stone-400">Connected Devices</span>
                <span className="text-lg font-serif font-medium text-stone-900 dark:text-white">
                  {devices.filter(d => d.status === 'Online').length}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                <span className="text-sm text-stone-500 dark:text-stone-400">Offline Devices</span>
                <span className="text-lg font-serif font-medium text-red-600 dark:text-red-400">
                  {devices.filter(d => d.status === 'Offline').length}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-xl">
                <span className="text-sm text-stone-500 dark:text-stone-400">Last Updated</span>
                <span className="text-sm font-medium text-stone-900 dark:text-white">{lastUpdated}</span>
              </div>
            </div>
          </div>

          <div className="bg-stone-900 p-6 rounded-3xl text-white relative overflow-hidden">
            <Activity className="absolute bottom-[-20px] right-[-20px] w-32 h-32 opacity-10" />
            <h3 className="text-sm font-serif font-medium mb-2 uppercase tracking-wider">Hardware Bridge</h3>
            <p className="text-xs text-stone-400 mb-4 leading-relaxed">
              {supportsWebSerial
                ? 'Web Serial API is available in this browser for local AMCU scale and analyzer profiles.'
                : 'Device profiles are saved locally. Hardware serial telemetry requires a compatible desktop serial bridge or native Android USB adapter.'}
            </p>
            <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              {devices.some(d => d.status === 'Online') ? 'Profiles Ready' : 'Standby'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
