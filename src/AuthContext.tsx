/**
 * AuthContext
 * 
 * Provides global authentication state and methods to the React application.
 * Manages user profiles, JWT tokens, and multi-tenant database switching.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from './services/api';
import { db } from './firebase';
import { Firestore } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  name?: string;
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
  signInWithEmail: (email: string, pass: string) => Promise<{ requiresOTP: boolean; userId?: string }>;
  signInSuperAdmin: (email: string, pass: string) => Promise<{ requiresOTP: boolean; userId?: string }>;
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

  /**
   * Initialize authentication state from localStorage on app load.
   */
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

  /**
   * Attempts to detect the device name/model.
   */
  const getDeviceName = async (): Promise<string | undefined> => {
    try {
      // 1. Try User-Agent Client Hints (Modern browsers)
      if ((navigator as any).userAgentData?.getHighEntropyValues) {
        const hints = await (navigator as any).userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
        if (hints.model) return hints.model;
      }
      
      // 2. Fallback to parsing User-Agent string for common patterns
      const ua = navigator.userAgent;
      const modelMatch = ua.match(/\(([^;]+);([^;]+);([^;)]+)\)/);
      if (modelMatch && modelMatch[3]) {
        const potentialModel = modelMatch[3].trim();
        if (potentialModel.includes('Build/') || /SM-|Pixel|iPhone|iPad/.test(potentialModel)) {
          return potentialModel.split('Build/')[0].trim();
        }
      }
      
      return undefined;
    } catch (e) {
      return undefined;
    }
  };

  /**
   * Standard Email/Password login.
   */
  const signInWithEmail = async (email: string, pass: string) => {
    const deviceName = await getDeviceName();
    const response = await authApi.login({ username: email, password: pass, deviceName });
    const { token, user: userData, requiresOTP } = response.data;
    
    // Note: OTP is currently disabled in the backend, but kept here for structural compatibility
    if (requiresOTP) {
      return { requiresOTP: true, userId: userData.id };
    }

    const p: UserProfile = {
      uid: userData.id,
      email: userData.email || userData.username,
      displayName: userData.username,
      photoURL: '',
      role: userData.role,
      status: userData.status || 'active',
      dairyId: userData.dairyId,
      databaseId: userData.databaseId,
      createdAt: userData.createdAt,
    };

    // Persist session
    localStorage.setItem('token', token);
    localStorage.setItem('profile', JSON.stringify(p));
    localStorage.setItem('databaseId', p.databaseId);
    
    setUser({ token });
    setProfile(p);

    return { requiresOTP: false };
  };

  /**
   * Super Admin login.
   */
  const signInSuperAdmin = async (email: string, pass: string) => {
    const deviceName = await getDeviceName();
    const response = await authApi.verifyAdmin({ email, password: pass, deviceName });
    const { token, user: userData, requiresOTP } = response.data;
    
    if (requiresOTP) {
      return { requiresOTP: true, userId: userData.id };
    }

    const p: UserProfile = {
      uid: userData.id,
      email: userData.email || userData.username,
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

    return { requiresOTP: false };
  };

  /**
   * Logs out the user and clears all session data.
   */
  const logout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('profile');
    localStorage.removeItem('databaseId');
    setUser(null);
    setProfile(null);
  };

  /**
   * Switches the active database context (Multi-tenancy).
   * Used by Super Admins to view data from different dairies.
   */
  const switchDatabase = (databaseId: string) => {
    if (profile) {
      const newProfile = { ...profile, databaseId };
      setProfile(newProfile);
      localStorage.setItem('profile', JSON.stringify(newProfile));
      localStorage.setItem('databaseId', databaseId);
      // Force reload to ensure all components re-fetch with the new databaseId header
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

/**
 * Hook to access authentication context.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
