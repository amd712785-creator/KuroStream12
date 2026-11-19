import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function initCapacitorNativeUI(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;

    await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: '#08090d' }).catch(() => {});
    await SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
  } catch {
    // No-op in web browsers / SSR
  }
}
