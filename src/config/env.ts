const DEFAULT_STREAMING_API = 'https://ashanime-api.vercel.app';
const DEFAULT_ANILIST_API = 'https://graphql.anilist.co';
const OVERRIDE_STORAGE_KEY = 'kurostream_api_override_v1';

export const ASSETS = {
  heroFallback: '/src/assets/images/hero_fallback_backdrop_1794848732685.jpg',
  posterFallback: '/src/assets/images/poster_fallback_art_1794848734095.jpg',
  defaultAvatar: '/src/assets/images/default_avatar_art_1794848733721.jpg',
};

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
