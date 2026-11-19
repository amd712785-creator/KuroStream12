import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kurostream.app',
  appName: 'KuroStream',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.vercel.app',
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.googleusercontent.com',
      'accounts.google.com',
      'graphql.anilist.co',
      'api.ani.zip',
      'api.aniskip.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#08090d',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#08090d',
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#08090d',
  },
};

export default config;
