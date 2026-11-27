import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

declare global {
  interface Window {
    KuroAndroidFullscreen?: {
      enterImmersiveFullscreen?: () => void;
      exitImmersiveFullscreen?: () => void;
    };
  }
}

const FULLSCREEN_STATE_EVENT = 'kurostream:app-fullscreen-change';
export const NATIVE_EXIT_FULLSCREEN_EVENT = 'kurostream:exit-fullscreen';

let activeFullscreenCount = 0;

function syncDocumentFullscreenClass(active: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('kuro-immersive-fullscreen', active);
  document.body?.classList.toggle('kuro-immersive-fullscreen', active);
}

export function isAppFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return (
    activeFullscreenCount > 0 ||
    Boolean(document.fullscreenElement || doc.webkitFullscreenElement)
  );
}

export function notifyAppFullscreen(active: boolean): void {
  if (active) {
    activeFullscreenCount += 1;
  } else {
    activeFullscreenCount = Math.max(0, activeFullscreenCount - 1);
  }
  const nowActive = isAppFullscreenActive();
  syncDocumentFullscreenClass(nowActive);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(FULLSCREEN_STATE_EVENT, { detail: { active: nowActive } })
    );
  }
}

export function clearAllAppFullscreenFlags(): void {
  activeFullscreenCount = 0;
  const nowActive = isAppFullscreenActive();
  syncDocumentFullscreenClass(nowActive);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(FULLSCREEN_STATE_EVENT, { detail: { active: nowActive } })
    );
  }
}

export function useAppFullscreen(): boolean {
  const [active, setActive] = useState<boolean>(() => isAppFullscreenActive());

  useEffect(() => {
    const sync = () => {
      setActive(isAppFullscreenActive());
    };
    sync();
    window.addEventListener(FULLSCREEN_STATE_EVENT, sync);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      window.removeEventListener(FULLSCREEN_STATE_EVENT, sync);
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  return active;
}

export async function enterNativeAndroidImmersive(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.KuroAndroidFullscreen?.enterImmersiveFullscreen?.();
    } catch {
      // ignore bridge errors outside Android APK
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.hide();
    } catch {
      // ignore if StatusBar plugin unavailable
    }
  }

  try {
    const orientationApi = screen.orientation as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined;
    await orientationApi?.lock?.('landscape');
  } catch {
    // ignore orientation lock restrictions on desktop/certain WebViews
  }
}

export async function exitNativeAndroidImmersive(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.KuroAndroidFullscreen?.exitImmersiveFullscreen?.();
    } catch {
      // ignore bridge errors outside Android APK
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.show();
    } catch {
      // ignore if StatusBar plugin unavailable
    }
  }

  try {
    const orientationApi = screen.orientation as
      | (ScreenOrientation & { unlock?: () => void })
      | undefined;
    orientationApi?.unlock?.();
  } catch {
    // ignore orientation unlock errors
  }
}

export function subscribeNativeExitFullscreen(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onEvent = () => handler();
  window.addEventListener(NATIVE_EXIT_FULLSCREEN_EVENT, onEvent);
  return () => window.removeEventListener(NATIVE_EXIT_FULLSCREEN_EVENT, onEvent);
}
