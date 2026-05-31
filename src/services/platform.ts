import { Capacitor } from '@capacitor/core';

export const isNativeApp = () => Capacitor.isNativePlatform();

/**
 * Checks if the current platform is capable of offline operation.
 * We only allow offline-first behavior on Android/Native platforms as per requirements.
 */
export const isOfflineCapablePlatform = () => {
  return isNativeApp();
};

export const PLATFORM_ERRORS = {
  OFFLINE_WEB: 'Internet connection is required to use this application on a web browser.',
  OFFLINE_AUTH_WEB: 'You must be online to log in from a web browser.',
  OFFLINE_AUTH_MISSING_CACHE: 'No cached session found. Please log in while online once to enable offline access.',
};
