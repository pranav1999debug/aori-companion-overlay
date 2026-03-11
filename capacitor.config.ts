import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.c2e5234ea16948a6aa637880a9c3a2f9',
  appName: 'Aori',
  webDir: 'dist',
  server: {
    url: 'https://aori-companion-overlay.lovable.app?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
