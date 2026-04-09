import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from './services/api';
import { db } from './firebase';
import { Firestore } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  name?: string; // Alias for displayName
  photoURL: string;
  role: 'super_admin' | 'admin' | 'operator';
  status: 'active' | 'inactive';
  dairyId?: string;
  dairyName?: string;
  adminId?: string;
  databaseId: string;
  createdAt: any;
}

interface AuthContextType {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  db: Firestore;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signInSuperAdmin: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  switchDatabase: (databaseId: string) => void;
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
        console.error("Failed to parse saved profile", e);
        localStorage.removeItem('token');
        localStorage.removeItem('profile');
      }
    }
    
    setLoading(false);
    setIsAuthReady(true);
  }, []);

  const signInWithEmail = async (email: string, pass: string) => {
    const response = await authApi.login({ username: email, password: pass });
    const { token, user: userData } = response.data;
    
    const p: UserProfile = {
      uid: userData.id,
      email: userData.username,
      displayName: userData.username,
      photoURL: '',
      role: userData.role,
      status: userData.status || 'active',
      dairyId: userData.dairyId,
      databaseId: userData.databaseId,
      createdAt: userData.createdAt,
    };

    localStorage.setItem('token', token);
    localStorage.setItem('profile', JSON.stringify(p));
    localStorage.setItem('databaseId', p.databaseId);
    
    setUser({ token });
    setProfile(p);
  };

  const signInSuperAdmin = async (email: string, pass: string) => {
    const response = await authApi.verifyAdmin({ email, password: pass });
    const { token, role, databaseId } = response.data;
    
    const p: UserProfile = {
      uid: 'super-admin-id',
      email: email,
      displayName: 'Super Admin',
      photoURL: '',
      role: role,
      status: 'active',
      dairyId: 'global',
      databaseId: databaseId,
      createdAt: new Date(),
    };

    localStorage.setItem('token', token);
    localStorage.setItem('profile', JSON.stringify(p));
    localStorage.setItem('databaseId', p.databaseId);
    
    setUser({ token });
    setProfile(p);
  };

  const logout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('profile');
    localStorage.removeItem('databaseId');
    setUser(null);
    setProfile(null);
  };

  const switchDatabase = (databaseId: string) => {
    if (profile) {
      const newProfile = { ...profile, databaseId };
      setProfile(newProfile);
      localStorage.setItem('profile', JSON.stringify(newProfile));
      localStorage.setItem('databaseId', databaseId);
      // Force reload to ensure all components re-fetch with new databaseId header
      window.location.reload();
    }
  };

  const signInWithGoogle = async () => {
    throw new Error("Google Sign-In is not supported in this version. Please use Email/Password.");
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isAuthReady,
      db,
      signInWithEmail,
      signInSuperAdmin,
      signInWithGoogle,
      logout,
      switchDatabase
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
