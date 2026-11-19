import { Capacitor } from '@capacitor/core';

const DEFAULT_STREAMING_API = 'https://ashanime-api.vercel.app';
const DEFAULT_ANILIST_API = 'https://graphql.anilist.co';
const DEFAULT_BACKEND_ORIGIN = 'https://animeworldbd.vercel.app';
const OVERRIDE_STORAGE_KEY = 'kurostream_api_override_v1';

export const ASSETS = {
  heroFallback: '/src/assets/images/hero_fallback_backdrop_1794848732685.jpg',
  posterFallback: '/src/assets/images/poster_fallback_art_1794848734095.jpg',
  defaultAvatar: '/src/assets/images/default_avatar_art_1794848733721.jpg',
};

export function getBackendApiOrigin(): string {
  const configured = (import.meta.env.VITE_BACKEND_API_URL || DEFAULT_BACKEND_ORIGIN).trim();
  return configured.replace(/\/+$/, '');
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  try {
    if (Capacitor.isNativePlatform()) {
      return `${getBackendApiOrigin()}${normalizedPath}`;
    }
  } catch {
    // ignore in non-Capacitor environments
  }
  return normalizedPath;
}

export function getAnilistApiUrl(): string {
  return import.meta.env.VITE_ANILIST_API_URL || DEFAULT_ANILIST_API;
}

export function getStreamingApiBase(): string {
  try {
    const override = localStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (override && override.trim().startsWith('http')) {
      return override.trim().replace(/\/+$/, '');
    }
  } catch {
    // ignore storage errors
  }
  const envUrl = import.meta.env.VITE_STREAMING_API_BASE || DEFAULT_STREAMING_API;
  return envUrl.replace(/\/+$/, '');
}

export function setStreamingApiOverride(url: string | null): void {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem(OVERRIDE_STORAGE_KEY);
    } else {
      localStorage.setItem(OVERRIDE_STORAGE_KEY, url.trim().replace(/\/+$/, ''));
    }
  } catch {
    // ignore storage errors
  }
}

export function getDefaultStreamingApiBase(): string {
  return (import.meta.env.VITE_STREAMING_API_BASE || DEFAULT_STREAMING_API).replace(/\/+$/, '');
}
