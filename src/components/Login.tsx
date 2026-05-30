import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Milk, LogIn, Mail, Lock, AlertCircle, Globe, Clock, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { language, setLanguage, t } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const { signInWithEmail, signInSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [showServerSettings, setShowServerSettings] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState(localStorage.getItem('custom_api_url') || '');

  const defaultApiUrl = import.meta.env.VITE_API_URL || 
    (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') 
      ? `${window.location.origin}/api` 
      : 'https://amcu.onrender.com/api');

  const handleSaveServerUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (customApiUrl.trim()) {
      localStorage.setItem('custom_api_url', customApiUrl.trim());
      toast.success('Custom API URL updated: ' + customApiUrl.trim());
    } else {
      localStorage.removeItem('custom_api_url');
      toast.info('Restored default system API target');
    }
    setShowServerSettings(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('reason');
    if (reason) {
      setError(reason);
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogoClick = () => {
    setClickCount(prev => prev + 1);
    if (clickCount + 1 >= 3) {
      setIsSuperAdminMode(true);
      setClickCount(0);
      toast.info('SuperAdmin Mode Activated');
    }
    // Reset click count after 2 seconds
    setTimeout(() => setClickCount(0), 2000);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let result;
      if (isSuperAdminMode) {
        await signInSuperAdmin(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      
      toast.success('Login successful');
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-stone-900 p-10 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-xl">
        <div className="text-center space-y-4">
          <div 
            onClick={handleLogoClick}
            className="inline-flex items-center justify-center w-16 h-16 bg-stone-900 dark:bg-white rounded-2xl mb-2 cursor-pointer active:scale-95 transition-transform"
          >
            <Milk className="text-white dark:text-stone-900 w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">
            {isSuperAdminMode ? 'DugdhaSetu Admin' : 'DugdhaSetu'}
          </h1>
          <p className="text-stone-500 dark:text-stone-400">
            {isSuperAdminMode ? 'Authorized Personnel Only' : t('welcome')}
          </p>
          
          <div className="flex items-center justify-center gap-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-widest pt-2">
            <div className="flex items-center gap-1">
              <Clock size={14} />
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="w-1 h-1 bg-stone-200 dark:bg-stone-800 rounded-full" />
            <div>{currentTime.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider px-1">{t('username')}</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="text"
                  required
                  placeholder="operator@dairy.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider px-1">{t('password')}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-stone-400 dark:text-stone-500" />
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="text-xs font-medium text-stone-500 dark:text-stone-400 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="en" className="dark:bg-stone-900">English</option>
                <option value="hi" className="dark:bg-stone-900">Hindi (हिन्दी)</option>
                <option value="mr" className="dark:bg-stone-900">Marathi (मराठी)</option>
              </select>
            </div>
            <button type="button" className="text-xs font-medium text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors">
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogIn size={18} />
            {loading ? 'Signing in...' : t('login')}
          </button>
        </form>

        <p className="text-center text-sm text-stone-500 dark:text-stone-400 pt-4">
          Don't have an account?{' '}
          <Link to="/register" className="text-stone-900 dark:text-white font-medium hover:underline">
            Register here
          </Link>
        </p>

        <div className="text-center pt-4 space-y-3">
          {showServerSettings ? (
            <form onSubmit={handleSaveServerUrl} className="bg-stone-50 dark:bg-stone-800/50 border border-stone-200/50 dark:border-stone-700/50 p-4 rounded-2xl text-left space-y-3 transition-all duration-300">
              <h3 className="text-xs font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider">Advanced Server Settings</h3>
              <p className="text-[11px] text-stone-400 leading-normal">
                Override active API backend (Current Default: <code className="font-mono bg-stone-100 dark:bg-stone-900 px-1 py-0.5 rounded break-all">{defaultApiUrl}</code>)
              </p>
              <div className="space-y-1">
                <input
                  type="url"
                  placeholder="https://your-api.com/api"
                  value={customApiUrl}
                  onChange={(e) => setCustomApiUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-500 text-stone-800 dark:text-stone-100 placeholder:font-sans font-medium"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCustomApiUrl('');
                    localStorage.removeItem('custom_api_url');
                    toast.info('Cleared custom server API URL');
                    setShowServerSettings(false);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 bg-stone-100/50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md transition-colors"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 text-[11px] font-medium text-white bg-stone-900 dark:bg-stone-100 dark:text-stone-900 rounded-md transition-colors hover:bg-stone-800 dark:hover:bg-white"
                >
                  Save URL
                </button>
              </div>
            </form>
          ) : null}

          <p className="text-xs text-stone-400 dark:text-stone-500">
            Authorized personnel only. All access is monitored and logged.
          </p>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowServerSettings(!showServerSettings)}
              className="inline-block text-[10px] font-mono font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-2.5 py-0.5 rounded-full border border-orange-200/50 dark:border-orange-900/35 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="Click to configure Advanced Server settings"
            >
              v1.2.5 (Settings)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
