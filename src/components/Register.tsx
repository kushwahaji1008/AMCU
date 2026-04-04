import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Milk, UserPlus, Mail, Lock, User, AlertCircle } from 'lucide-react';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      // Create user profile in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: name,
        photoURL: '',
        role: 'operator',
        createdAt: serverTimestamp(),
      });

      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-stone-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-stone-900 rounded-3xl shadow-sm border border-stone-100 dark:border-stone-800 p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-stone-900 dark:bg-white rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Milk className="text-white dark:text-stone-900 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-serif font-medium text-stone-900 dark:text-white">Create Account</h1>
          <p className="text-stone-500 dark:text-stone-400 text-sm">Join the DugdhaSetu network</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                placeholder="operator@dairy.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 dark:focus:ring-white/5 transition-all dark:text-white"
                placeholder="Minimum 6 characters"
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-2xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50 mt-4"
          >
            {loading ? 'Creating Account...' : 'Register Now'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-stone-500 dark:text-stone-400">
          Already have an account?{' '}
          <Link to="/login" className="text-stone-900 dark:text-white font-medium hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
