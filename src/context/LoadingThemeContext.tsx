import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import {
  DEFAULT_DYNAMIC_LOADING_CONFIG,
  subscribeDynamicLoadingConfig,
  type DynamicLoadingConfig,
  type DynamicLoadingStyleId,
} from '@/src/services/dynamicLoadingService';

interface LoadingThemeContextValue {
  config: DynamicLoadingConfig;
  effectiveStyle: DynamicLoadingStyleId;
  isDynamicEnabled: boolean;
  animationsEnabled: boolean;
  lightweightMode: boolean;
  durationMs: number;
}

const LoadingThemeContext = createContext<LoadingThemeContextValue | null>(null);

export const LoadingThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { preferences } = useAuth();
  const [config, setConfig] = useState<DynamicLoadingConfig>(DEFAULT_DYNAMIC_LOADING_CONFIG);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const unsub = subscribeDynamicLoadingConfig((cfg) => {
      setConfig(cfg);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveStyle: DynamicLoadingStyleId = useMemo(() => {
    if (preferences.loadingTheme && preferences.loadingTheme !== 'default') {
      if (config.enabledStyles.includes(preferences.loadingTheme as DynamicLoadingStyleId)) {
        return preferences.loadingTheme as DynamicLoadingStyleId;
      }
    }
    return config.defaultStyle || 'purple-galaxy';
  }, [preferences.loadingTheme, config]);

  const isDynamicEnabled = config.globalEnabled;
  const animationsEnabled =
    !prefersReducedMotion &&
    (preferences.loadingAnimationsEnabled ?? true) &&
    !(preferences.loadingLightweightMode ?? false);
  const lightweightMode = preferences.loadingLightweightMode ?? false;
  const durationMs = config.durationMs || 1100;

  const value = useMemo<LoadingThemeContextValue>(
    () => ({
      config,
      effectiveStyle,
      isDynamicEnabled,
      animationsEnabled,
      lightweightMode,
      durationMs,
    }),
    [config, effectiveStyle, isDynamicEnabled, animationsEnabled, lightweightMode, durationMs]
  );

  return (
    <LoadingThemeContext.Provider value={value}>
      {children}
    </LoadingThemeContext.Provider>
  );
};

export function useLoadingTheme(): LoadingThemeContextValue {
  const ctx = useContext(LoadingThemeContext);
  if (!ctx) {
    throw new Error('useLoadingTheme must be used within LoadingThemeProvider');
  }
  return ctx;
}
