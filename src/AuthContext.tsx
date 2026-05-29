import React, { createContext, useContext, useState, useEffect } from 'react';
import { offlineService } from './services/offlineService';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  name?: string;
  photoURL: string;
  role: 'super_admin' | 'admin' | 'operator';
  status: 'active' | 'inactive';
  databaseId?: string;
  dairyId?: string;
  dairyName?: string;
  address?: string;
  phone?: string;
}

interface AuthContextType {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<any>;
  signInSuperAdmin: (email: string, pass: string) => Promise<any>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  switchDatabase: (id: string) => void;
  updateProfile: (data: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedProfile = localStorage.getItem('profile');
    
    if (token && savedProfile) {
      try {
        const p = JSON.parse(savedProfile);
        setUser({ token });
        setProfile(p);
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('profile');
      }
    }
    
    setLoading(false);
    setIsAuthReady(true);
  }, []);

  const signInWithEmail = async (email: string, pass: string) => {
    const p: UserProfile = {
      uid: 'offline-local-user',
      email: email,
      displayName: email.split('@')[0],
      photoURL: '',
      role: 'admin',
      status: 'active',
      databaseId: 'local',
    };

    localStorage.setItem('token', 'local-token');
    localStorage.setItem('profile', JSON.stringify(p));
    
    setUser({ token: 'local-token' });
    setProfile(p);
    return { requiresOTP: false };
  };

  const signInSuperAdmin = async (email: string, pass: string) => {
    return signInWithEmail(email, pass);
  };

  const logout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('profile');
    setUser(null);
    setProfile(null);
  };

  const switchDatabase = (id: string) => {
    if (profile) setProfile({ ...profile, databaseId: id });
  };
  const updateProfile = (data: Partial<UserProfile>) => {
    if (profile) setProfile({ ...profile, ...data });
  };

  const signInWithGoogle = async () => {
    throw new Error("Google Sign-In not supported in fully offline mode.");
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isAuthReady,
      signInWithEmail,
      signInSuperAdmin,
      signInWithGoogle,
      logout,
      switchDatabase,
      updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
