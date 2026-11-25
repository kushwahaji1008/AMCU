import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { isAndroidNative } from './platform';

export interface BackgroundSyncPluginInterface {
  configure(options: {
    serverUrl: string;
    token: string;
    databaseId?: string;
    appVersion?: string;
  }): Promise<{ configured: boolean }>;
  clearCredentials(): Promise<{ cleared: boolean }>;
  scheduleImmediateSync(): Promise<{ scheduled: boolean }>;
  ensurePeriodicSync(): Promise<{ scheduled: boolean }>;
  notifyBridgeActive(options: { active: boolean }): Promise<void>;
  addListener(
    eventName: 'nativeSyncRequested',
    listenerFunc: (data: { source?: string; timestamp?: number }) => void
  ): Promise<PluginListenerHandle>;
}

const NativeBackgroundSync = registerPlugin<BackgroundSyncPluginInterface>('BackgroundSync');

export const backgroundSyncBridge = {
  async configure(options: {
    serverUrl: string;
    token: string;
    databaseId?: string;
    appVersion?: string;
  }): Promise<void> {
    if (!isAndroidNative()) return;
    try {
      await NativeBackgroundSync.configure(options);
      await NativeBackgroundSync.ensurePeriodicSync();
      await NativeBackgroundSync.notifyBridgeActive({ active: true });
    } catch (err) {
      console.warn('[BackgroundSync] Native configure skipped:', err);
    }
  },

  async clearCredentials(): Promise<void> {
    if (!isAndroidNative()) return;
    try {
      await NativeBackgroundSync.clearCredentials();
    } catch (err) {
      console.warn('[BackgroundSync] Native clearCredentials skipped:', err);
    }
  },

  async scheduleImmediateSync(): Promise<void> {
    if (!isAndroidNative()) return;
    try {
      await NativeBackgroundSync.scheduleImmediateSync();
    } catch (err) {
      console.warn('[BackgroundSync] Schedule WorkManager sync skipped:', err);
    }
  },

  async ensurePeriodicSync(): Promise<void> {
    if (!isAndroidNative()) return;
    try {
      await NativeBackgroundSync.ensurePeriodicSync();
    } catch (err) {
      console.warn('[BackgroundSync] Ensure periodic WorkManager skipped:', err);
    }
  },

  async addSyncListener(
    cb: (data: { source?: string; timestamp?: number }) => void
  ): Promise<PluginListenerHandle | null> {
    if (!isAndroidNative()) return null;
    try {
      return await NativeBackgroundSync.addListener('nativeSyncRequested', cb);
    } catch {
      return null;
    }
  },
};
