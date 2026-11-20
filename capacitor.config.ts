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
      launchShowDuration: 300,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#08090d',
    },
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#08090d',
  },
};

export default config;
