import React from 'react';
import { HelpCircle, Info, BookOpen, MessageCircle, Mail, Globe, Milk } from 'lucide-react';
import { cn } from '../lib/utils';

export default function HelpAbout() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-stone-900">Help & About</h1>
        <p className="text-stone-500">Learn more about the system and get support</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-stone-900 rounded-2xl flex items-center justify-center">
                <Milk className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-serif font-medium text-stone-900">DugdhaSetu v1.2.0</h2>
                <p className="text-sm text-stone-500">Comprehensive Milk Collection Unit Management System</p>
              </div>
            </div>
            <p className="text-sm text-stone-600 leading-relaxed">
              DugdhaSetu is a modern, robust, and user-friendly software solution designed for dairy collection centers. It automates the entire milk collection process, from farmer identification and quality testing to rate calculation and payment processing.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">License</p>
                <p className="text-sm font-medium text-stone-900 mt-1">Enterprise Edition</p>
              </div>
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Support Status</p>
                <p className="text-sm font-medium text-emerald-600 mt-1">Active Support</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-sm space-y-6">
            <h2 className="text-xl font-serif font-medium text-stone-900">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {[
                { q: 'How do I record a manual entry?', a: 'Go to Collection Entry, toggle "Manual Entry", select a reason, and fill in the details. It will require supervisor approval.' },
                { q: 'How are rates calculated?', a: 'Rates are calculated based on the FAT and SNF values entered, using the active Rate Chart for the selected milk type (Cow/Buffalo).' },
                { q: 'What if the weighing scale is offline?', a: 'You can use the Manual Entry mode to record weights from a physical scale until the device is back online.' },
              ].map((faq, i) => (
                <div key={i} className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                  <p className="text-sm font-medium text-stone-900">{faq.q}</p>
                  <p className="text-xs text-stone-500 mt-2 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 mb-4">Support Contact</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                <Mail className="text-stone-400" size={18} />
                <span className="text-sm text-stone-600">support@dugdhasetu.com</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                <MessageCircle className="text-stone-400" size={18} />
                <span className="text-sm text-stone-600">+91 12345 67890</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                <Globe className="text-stone-400" size={18} />
                <span className="text-sm text-stone-600">www.dugdhasetu.com</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
            <h2 className="text-lg font-serif font-medium text-stone-900 mb-4">Documentation</h2>
            <div className="space-y-2">
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors">
                <BookOpen size={18} />
                User Manual
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors">
                <Info size={18} />
                Release Notes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
