import { Capacitor } from '@capacitor/core';

export type AppPlatform = 'android' | 'ios' | 'web';

declare const APP_VERSION: string | undefined;

export const CLIENT_APP_VERSION: string =
  typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.4.3';

/**
 * Strictly true ONLY inside the installed Capacitor native runtime (Android/iOS APK).
 * Always false in standard web browsers (desktop/mobile browser, PWA tabs, localhost Vite).
 */
export const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const getPlatform = (): AppPlatform => {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'android') return 'android';
    if (p === 'ios') return 'ios';
    return 'web';
  } catch {
    return 'web';
  }
};

export const isAndroidNative = (): boolean => isNativeApp() && getPlatform() === 'android';

export const isWebPlatform = (): boolean => !isNativeApp();

/**
 * Checks if the current platform is capable of offline operation.
 * Offline-first persistence, sync queues, and local audit outbox MUST run ONLY on Capacitor native APK.
 */
export const isOfflineCapablePlatform = (): boolean => {
  return isNativeApp();
};

export const getAppMetadata = () => ({
  platform: getPlatform(),
  isNative: isNativeApp(),
  appVersion: CLIENT_APP_VERSION,
});

export const PLATFORM_ERRORS = {
  OFFLINE_WEB: 'Internet connection is required to use this application on a web browser.',
  OFFLINE_AUTH_WEB: 'You must be online to log in from a web browser.',
  OFFLINE_AUTH_MISSING_CACHE: 'No cached session found. Please log in while online once to enable offline access.',
};
