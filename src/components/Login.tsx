import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Milk, LogIn, Mail, Lock, AlertCircle, Globe, Clock, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { language, setLanguage, t } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-3xl border border-stone-100 shadow-xl">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-stone-900 rounded-2xl mb-2">
            <Milk className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif font-medium text-stone-900">DugdhaSetu</h1>
          <p className="text-stone-500">{t('welcome')}</p>
          
          <div className="flex items-center justify-center gap-4 text-xs font-medium text-stone-400 uppercase tracking-widest pt-2">
            <div className="flex items-center gap-1">
              <Clock size={14} />
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="w-1 h-1 bg-stone-200 rounded-full" />
            <div>{currentTime.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider px-1">{t('username')}</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="email"
                  required
                  placeholder="operator@dairy.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/5 transition-all"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-400 uppercase tracking-wider px-1">{t('password')}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/5 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-stone-400" />
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="text-xs font-medium text-stone-500 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="en">English</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option>Marathi (મરાठी)</option>
                
              </select>
            </div>
            <button type="button" className="text-xs font-medium text-stone-400 hover:text-stone-900 transition-colors">
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogIn size={18} />
            {loading ? 'Signing in...' : t('login')}
          </button>
        </form>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-100"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-stone-400 font-medium tracking-wider">Or continue with</span>
          </div>
        </div>

        <button
          onClick={signInWithGoogle}
          className="w-full py-4 border border-stone-100 text-stone-600 rounded-xl font-medium hover:bg-stone-50 transition-all flex items-center justify-center gap-3"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
          Google Workspace Account
        </button>

        <p className="text-center text-sm text-stone-500 pt-4">
          Don't have an account?{' '}
          <Link to="/register" className="text-stone-900 font-medium hover:underline">
            Register here
          </Link>
        </p>

        <p className="text-center text-xs text-stone-400 pt-4">
          Authorized personnel only. All access is monitored and logged.
        </p>
      </div>
    </div>
  );
}
