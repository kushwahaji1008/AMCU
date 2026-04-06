import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Milk, FileText, LogOut, LogIn, Menu, X, Clock, 
  Beaker, Settings2, Printer, DollarSign, Cpu, Shield, Database, HelpCircle, RefreshCw, Smartphone, BookOpen
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, logout, switchDatabase, isAuthReady } = useAuth();
  const { t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dbIdInput, setDbIdInput] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  if (!isAuthReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 transition-colors">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 bg-stone-200 dark:bg-stone-800 rounded-full mb-4"></div>
          <div className="h-4 w-32 bg-stone-200 dark:bg-stone-800 rounded"></div>
        </div>
      </div>
    );
  }

  // If not logged in and not on login/register pages, the Router will handle it via App.tsx
  // But we need to ensure Layout doesn't render the sidebar if not logged in
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  
  if (!user || isAuthPage) {
    return <>{children}</>;
  }

  const navItems = [
    { name: t('dashboard'), path: '/', icon: LayoutDashboard },
    { name: t('collection'), path: '/collection', icon: Milk },
    { name: t('qualityTesting'), path: '/quality', icon: Beaker },
    { name: t('shifts'), path: '/shifts', icon: Clock },
    { name: t('farmers'), path: '/farmers', icon: Users },
    { name: t('rateCharts'), path: '/rates', icon: Settings2, adminOnly: true },
    { name: t('receipts'), path: '/receipts', icon: Printer },
    { name: t('payments'), path: '/payments', icon: DollarSign, adminOnly: true },
    { name: t('ledger'), path: '/ledger', icon: BookOpen },
    { name: t('reports'), path: '/reports', icon: FileText },
    { name: t('devices'), path: '/devices', icon: Cpu, adminOnly: true },
    { name: t('sync'), path: '/sync', icon: RefreshCw, adminOnly: true },
    { name: 'Mobile App', path: '/mobile', icon: Smartphone },
    { name: t('users'), path: '/users', icon: Shield, adminOnly: true },
    { name: t('settings'), path: '/settings', icon: Settings2, adminOnly: true },
    { name: t('auditLog'), path: '/audit', icon: Shield, adminOnly: true },
    { name: t('backup'), path: '/backup', icon: Database, adminOnly: true },
    { name: t('help'), path: '/help', icon: HelpCircle },
  ];

  const filteredNavItems = navItems.filter(item => !item.adminOnly || profile?.role === 'admin' || profile?.role === 'super_admin');

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col md:flex-row transition-colors">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-stone-900 border-r border-stone-100 dark:border-stone-800 transform transition-transform duration-300 md:relative md:translate-x-0",
        isMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-stone-900 dark:bg-white rounded-xl flex items-center justify-center">
              <Milk className="text-white dark:text-stone-900 w-6 h-6" />
            </div>
            <span className="text-xl font-serif font-medium text-stone-900 dark:text-white">DugdhaSetu</span>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto pr-2 custom-scrollbar">
            {profile?.role === 'super_admin' && (
              <div className="px-4 py-3 mb-4 bg-stone-50 dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Database size={10} /> Database Switcher
                </p>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={dbIdInput}
                    onChange={(e) => setDbIdInput(e.target.value)}
                    placeholder="DB ID"
                    className="w-full px-2 py-1 text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-600 rounded focus:outline-none dark:text-white"
                  />
                  <button
                    onClick={() => {
                      if (dbIdInput) switchDatabase(dbIdInput);
                    }}
                    className="p-1 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded hover:opacity-80 transition-opacity"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <p className="text-[9px] text-stone-400 mt-1 truncate">
                  Active: <span className="text-stone-600 dark:text-stone-300 font-mono">{profile.databaseId || '(default)'}</span>
                </p>
              </div>
            )}
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  location.pathname === item.path
                    ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm"
                    : "text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white"
                )}
              >
                <item.icon size={18} />
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="pt-6 border-t border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-3 px-4 py-3 mb-4">
              <img
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`}
                alt={user.displayName || ''}
                className="w-8 h-8 rounded-full"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 dark:text-white truncate">{user.displayName || 'User'}</p>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate capitalize">{profile?.role || 'Operator'}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut size={18} />
              {t('signOut')}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden bg-white dark:bg-stone-900 border-b border-stone-100 dark:border-stone-800 p-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-stone-900 dark:bg-white rounded-lg flex items-center justify-center">
            <Milk className="text-white dark:text-stone-900 w-5 h-5" />
          </div>
          <span className="font-serif font-medium text-stone-900 dark:text-white">DugdhaSetu</span>
        </div>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>

      {/* Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </div>
  );
}
