import type {
  AniSkipResponse,
  AniZipResponse,
  ExtensionRepoItem,
  ExtensionsCatalogResponse,
} from '@/src/types/anime';

const ENABLED_EXTENSIONS_KEY = 'kurostream_enabled_extensions_v1';

const DEFAULT_ENABLED_EXTENSION_IDS = [
  'aniyomi:eu.kanade.tachiyomi.animeextension.en.zoro',
  'aniyomi:eu.kanade.tachiyomi.animeextension.en.aniwatch',
  'aniyomi:eu.kanade.tachiyomi.animeextension.en.kaido',
  'aniyomi:eu.kanade.tachiyomi.animeextension.en.animepahe',
];

export async function fetchExtensionsCatalog(): Promise<ExtensionsCatalogResponse> {
  const res = await fetch('/api/extensions/repos', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Extension repository request failed (HTTP ${res.status}).`);
  }
  return (await res.json()) as ExtensionsCatalogResponse;
}

export function getEnabledExtensionIds(): string[] {
  try {
    const raw = localStorage.getItem(ENABLED_EXTENSIONS_KEY);
    if (!raw) return DEFAULT_ENABLED_EXTENSION_IDS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string');
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_ENABLED_EXTENSION_IDS;
}

export function setEnabledExtensionIds(ids: string[]): void {
  try {
    localStorage.setItem(ENABLED_EXTENSIONS_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent('kurostream:extensions-updated'));
  } catch {
    // ignore storage errors
  }
}

export function toggleCompatibleExtension(
  ext: ExtensionRepoItem,
  currentEnabled: string[]
): { next: string[]; error?: string } {
  if (!ext.compatible) {
    return {
      next: currentEnabled,
      error: ext.limitationReason,
    };
  }
  const exists = currentEnabled.includes(ext.id);
  const next = exists
    ? currentEnabled.filter((id) => id !== ext.id)
    : [...currentEnabled, ext.id];
  setEnabledExtensionIds(next);
  return { next };
}

export async function fetchAniZipMetadata(anilistId: number): Promise<AniZipResponse | null> {
  if (!Number.isFinite(anilistId) || anilistId <= 0) return null;
  try {
    const res = await fetch(`/api/anime/anizip/${anilistId}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as AniZipResponse;
  } catch {
    return null;
  }
}

export async function fetchAniSkipTimestamps(
  malId: number,
  episodeNumber: number,
  episodeLength = 0
): Promise<AniSkipResponse | null> {
  if (!Number.isFinite(malId) || malId <= 0 || !Number.isFinite(episodeNumber) || episodeNumber <= 0) {
    return null;
  }
  try {
    const res = await fetch(
      `/api/anime/skip/${malId}/${episodeNumber}?length=${Math.max(0, Math.floor(episodeLength))}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    return (await res.json()) as AniSkipResponse;
  } catch {
    return null;
  }
}
