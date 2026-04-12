import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dugdhasetu.app',
  appName: 'DugdhaSetu',
  webDir: 'dist',
  server: {
    allowNavigation: ['amcu.onrender.com'],
    androidScheme: 'https'
  }
};

export default config;
