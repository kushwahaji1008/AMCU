import React from 'react';
import { Smartphone, Download, Shield, Zap, WifiOff, QrCode } from 'lucide-react';

export default function MobileApp() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 py-8">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-stone-900 rounded-3xl flex items-center justify-center mx-auto shadow-xl mb-6">
          <Smartphone className="text-white w-10 h-10" />
        </div>
        <h1 className="text-4xl font-serif font-medium text-stone-900">DugdhaSetu Mobile</h1>
        <p className="text-stone-500 text-lg max-w-2xl mx-auto">
          Take your dairy management on the go. Faster collection, offline support, and seamless hardware integration.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { 
            title: 'Offline Mode', 
            desc: 'Collect milk even without internet. Data syncs automatically when you\'re back online.',
            icon: WifiOff,
            color: 'bg-blue-50 text-blue-600'
          },
          { 
            title: 'Fast Scanning', 
            desc: 'Use your phone\'s camera to scan farmer barcodes for instant identification.',
            icon: QrCode,
            color: 'bg-amber-50 text-amber-600'
          },
          { 
            title: 'Secure Access', 
            desc: 'Biometric login and encrypted local storage keep your data safe.',
            icon: Shield,
            color: 'bg-emerald-50 text-emerald-600'
          }
        ].map((feature) => (
          <div key={feature.title} className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm text-center">
            <div className={`w-12 h-12 ${feature.color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
              <feature.icon size={24} />
            </div>
            <h3 className="text-lg font-serif font-medium text-stone-900 mb-2">{feature.title}</h3>
            <p className="text-sm text-stone-500 leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-stone-900 rounded-[40px] p-8 md:p-12 text-white overflow-hidden relative">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-3xl font-serif font-medium mb-6">How to Install</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center shrink-0 font-bold">1</div>
              <div>
                <p className="font-medium mb-1">Export Project</p>
                <p className="text-stone-400 text-sm">Download the project source code using the "Export to ZIP" option in the settings menu.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center shrink-0 font-bold">2</div>
              <div>
                <p className="font-medium mb-1">Build APK</p>
                <p className="text-stone-400 text-sm">Open the project in Android Studio. The Capacitor configuration is already set up. Run the build command to generate your APK.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center shrink-0 font-bold">3</div>
              <div>
                <p className="font-medium mb-1">Install & Run</p>
                <p className="text-stone-400 text-sm">Transfer the APK to your Android device and install it to start using DugdhaSetu Mobile.</p>
              </div>
            </div>
          </div>
          
          <div className="mt-10 flex flex-wrap gap-4">
            <button className="px-8 py-4 bg-white text-stone-900 rounded-2xl font-bold flex items-center gap-2 hover:bg-stone-100 transition-colors">
              <Download size={20} />
              Download Build Guide
            </button>
            <div className="px-6 py-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">Current Version</p>
              <p className="text-sm font-mono">v1.0.0-beta (Capacitor)</p>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full -mr-48 -mb-48"></div>
      </div>
    </div>
  );
}
