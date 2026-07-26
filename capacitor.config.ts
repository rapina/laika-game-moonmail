import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sputnikworkshop.moonmail',
  appName: 'Moonmail: Last Shift',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
