/**
 * AuthContext
 *
 * Provides global authentication state and methods to the React application.
 * Manages user profiles, JWT tokens, and multi-tenant database switching.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, clearApiCache } from './services/api';
import { offlineService } from './services/offlineService';
import { backgroundSyncBridge } from './services/backgroundSyncPlugin';
import { isNativeApp } from './services/platform';

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
  address?: string;
  phone?: string;
}

interface AuthContextType {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<{ requiresOTP: boolean; userId?: string }>;
  signInSuperAdmin: (email: string, pass: string) => Promise<{ requiresOTP: boolean; userId?: string }>;
  logout: () => Promise<void>;
  switchDatabase: (databaseId: string) => void;
  updateProfile: (data: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function clearTenantCaches() {
  clearApiCache();
  localStorage.removeItem('dashboard_stats');
  localStorage.removeItem('dashboard_recent_txns');
  localStorage.removeItem('dashboard_trend_data');
  localStorage.removeItem('dashboard_last_sync');
}

function mapUserToProfile(userData: any): UserProfile {
  return {
    uid: userData.id,
    email: userData.email || userData.username,
    displayName: userData.username,
    name: userData.name || userData.username,
    photoURL: '',
    role: userData.role,
    status: userData.status || 'active',
    dairyId: userData.dairyId,
    dairyName: userData.dairyName,
    address: userData.address,
    phone: userData.phone,
    databaseId: userData.databaseId,
    createdAt: userData.createdAt,
  };
}

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
        console.error('Failed to parse saved profile', e);
        localStorage.removeItem('token');
        localStorage.removeItem('profile');
        localStorage.removeItem('databaseId');
      }
    }

    setLoading(false);
    setIsAuthReady(true);
  }, []);

  const getDeviceName = async (): Promise<string | undefined> => {
    try {
      if ((navigator as any).userAgentData?.getHighEntropyValues) {
        const hints = await (navigator as any).userAgentData.getHighEntropyValues([
          'model',
          'platform',
          'platformVersion',
        ]);
        if (hints.model) return hints.model;
      }

      const ua = navigator.userAgent;
      const modelMatch = ua.match(/\(([^;]+);([^;]+);([^;)]+)\)/);
      if (modelMatch && modelMatch[3]) {
        const potentialModel = modelMatch[3].trim();
        if (potentialModel.includes('Build/') || /SM-|Pixel|iPhone|iPad/.test(potentialModel)) {
          return potentialModel.split('Build/')[0].trim();
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    const deviceName = await getDeviceName();
    const response = await authApi.login({ username: email, password: pass, deviceName });

    if (!response || !response.data) {
      throw new Error('No response from authentication server');
    }

    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
      throw new Error('Authentication server returned an invalid format (HTML). Please check your API URL configuration.');
    }

    const { token, user: userData, requiresOTP } = response.data;

    if (!token && !requiresOTP) {
      throw new Error('Invalid response from authentication server: Missing token/OTP session');
    }

    if (requiresOTP) {
      if (!userData?.id) {
        throw new Error('OTP identification failed: User data missing');
      }
      return { requiresOTP: true, userId: userData.id };
    }

    if (!userData || !userData.id) {
      throw new Error('Authenticated successfully but user profile is missing');
    }

    const p = mapUserToProfile(userData);
    clearTenantCaches();

    localStorage.setItem('token', token);
    localStorage.setItem('profile', JSON.stringify(p));
    localStorage.setItem('databaseId', p.databaseId);

    setUser({ token });
    setProfile(p);

    if (isNativeApp()) {
      offlineService.initialize().catch(console.error);
      offlineService.configureWorkManagerAuth().catch(console.error);
    }

    return { requiresOTP: false };
  };

  const signInSuperAdmin = async (email: string, pass: string) => {
    const deviceName = await getDeviceName();
    const response = await authApi.verifyAdmin({ email, password: pass, deviceName });

    if (!response || !response.data) {
      throw new Error('No response from administrative server');
    }

    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
      throw new Error('Administrative server returned an invalid format (HTML). Please check your configuration.');
    }

    const { token, user: userData, requiresOTP } = response.data;

    if (!token && !requiresOTP) {
      throw new Error('Invalid response from administrative server: Missing token/OTP session');
    }

    if (requiresOTP) {
      if (!userData?.id) {
        throw new Error('OTP identification failed: Administrator data missing');
      }
      return { requiresOTP: true, userId: userData.id };
    }

    if (!userData || !userData.id) {
      throw new Error('Authenticated as Admin but profile is incomplete');
    }

    const p = mapUserToProfile(userData);
    clearTenantCaches();

    localStorage.setItem('token', token);
    localStorage.setItem('profile', JSON.stringify(p));
    localStorage.setItem('databaseId', p.databaseId);

    setUser({ token });
    setProfile(p);

    if (isNativeApp()) {
      offlineService.initialize().catch(console.error);
      offlineService.configureWorkManagerAuth().catch(console.error);
    }

    return { requiresOTP: false };
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token && !token.startsWith('offline_token_') && navigator.onLine) {
        await authApi.logout();
      } else if (isNativeApp()) {
        await offlineService.recordAuditEvent({
          action: 'USER_LOGOUT',
          targetId: profile?.uid,
          targetType: 'AUTH',
          details: { username: profile?.displayName, mode: 'offline' },
          operationStatus: 'success',
          syncStatus: 'queued_offline',
        });
      }
    } catch {
      // Best-effort server session revocation
    } finally {
      if (isNativeApp()) {
        await backgroundSyncBridge.clearCredentials().catch(() => {});
      }
      clearTenantCaches();
      localStorage.removeItem('token');
      localStorage.removeItem('profile');
      localStorage.removeItem('databaseId');
      setUser(null);
      setProfile(null);
    }
  };

  const switchDatabase = (databaseId: string) => {
    if (profile) {
      clearTenantCaches();
      const newProfile = { ...profile, databaseId };
      setProfile(newProfile);
      localStorage.setItem('profile', JSON.stringify(newProfile));
      localStorage.setItem('databaseId', databaseId);
      window.location.reload();
    }
  };

  const updateProfile = (data: Partial<UserProfile>) => {
    if (profile) {
      const newProfile = { ...profile, ...data };
      setProfile(newProfile);
      localStorage.setItem('profile', JSON.stringify(newProfile));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAuthReady,
        signInWithEmail,
        signInSuperAdmin,
        logout,
        switchDatabase,
        updateProfile,
      }}
    >
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
