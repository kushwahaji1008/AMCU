import React, { useState } from 'react';
import { Users, Plus, Search, FileText, Trash2, Edit2, Shield, UserCheck, UserX } from 'lucide-react';
import { cn } from '../lib/utils';

export default function UserManagement() {
  const [activeTab, setActiveTab] = useState<'Operators' | 'Admins'>('Operators');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">User Management</h1>
          <p className="text-stone-500 dark:text-stone-400">Manage system users and access roles</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors">
          <Plus size={18} />
          Add New User
        </button>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
        <div className="flex border-b border-stone-100 dark:border-stone-800">
          {(['Operators', 'Admins'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-4 text-sm font-medium transition-colors",
                activeTab === tab 
                  ? "text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-white" 
                  : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
              <input
                type="text"
                placeholder="Search users..."
                className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              <button className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors">
                <Shield size={20} />
              </button>
              <button className="p-2 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors">
                <Users size={20} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-100 dark:border-stone-800">
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">User</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Role</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Last Login</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                {/* Real users should be fetched and mapped here */}
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-400 dark:text-stone-500 italic text-sm">
                    No users found
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
