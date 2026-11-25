import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, logFirestoreError, OperationType } from '@/src/lib/firebase';
import type { DynamicLoadingConfig, DynamicLoadingStyleId, DynamicLoadingStyleMeta } from '@/src/types/anime';
export type { DynamicLoadingConfig, DynamicLoadingStyleId, DynamicLoadingStyleMeta };

export const LOADING_STYLE_DEFINITIONS: DynamicLoadingStyleMeta[] = [
  {
    id: 'purple-galaxy',
    name: 'Purple Galaxy',
    tagline: 'Deep cosmic nebula with violet and fuchsia starlight',
    description: 'Immersive purple galaxy backdrop with glowing stardust particles.',
    accentColor: '#8b5cf6',
  },
  {
    id: 'anime-aura',
    name: 'Anime Aura',
    tagline: 'Vibrant character aura and pulsing energy rings',
    description: 'Radiant anime energy glow with soft atmospheric pulses.',
    accentColor: '#a855f7',
  },
  {
    id: 'neon-particles',
    name: 'Neon Particles',
    tagline: 'Cyberpunk neon sparks drifting across the screen',
    description: 'Dynamic floating neon particles with cyberpunk cyber-glow.',
    accentColor: '#38bdf8',
  },
  {
    id: 'sakura-petals',
    name: 'Sakura Petals',
    tagline: 'Gentle cherry blossom petals floating on spring breeze',
    description: 'Serene falling sakura flower petals with warm pink gradients.',
    accentColor: '#f472b6',
  },
  {
    id: 'cinematic-glow',
    name: 'Cinematic Glow',
    tagline: 'High-contrast studio lighting with glass reflections',
    description: 'Sophisticated iOS 26 dark glass lighting with golden & violet lens flare.',
    accentColor: '#fbbf24',
  },
  {
    id: 'minimal-dark',
    name: 'Minimal Dark',
    tagline: 'Ultra-fast clean dark aesthetic for maximum efficiency',
    description: 'Lightning-fast minimalist dark loading screen without heavy particle effects.',
    accentColor: '#94a3b8',
  },
];

export const DEFAULT_DYNAMIC_LOADING_CONFIG: DynamicLoadingConfig = {
  globalEnabled: true,
  defaultStyle: 'purple-galaxy',
  durationMs: 1100,
  enabledStyles: [
    'purple-galaxy',
    'anime-aura',
    'neon-particles',
    'sakura-petals',
    'cinematic-glow',
    'minimal-dark',
  ],
  updatedAt: Date.now(),
};

const LOADING_CONFIG_DOC_PATH = 'app_settings/dynamic_loading';
const LOADING_CFG_STORAGE_KEY = 'kurostream_dynamic_loading_cfg_v1';

export function getCachedDynamicLoadingConfig(): DynamicLoadingConfig {
  try {
    const raw = localStorage.getItem(LOADING_CFG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DynamicLoadingConfig>;
      return {
        ...DEFAULT_DYNAMIC_LOADING_CONFIG,
        ...parsed,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_DYNAMIC_LOADING_CONFIG;
}

export function saveCachedDynamicLoadingConfig(cfg: DynamicLoadingConfig): void {
  try {
    localStorage.setItem(LOADING_CFG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function subscribeDynamicLoadingConfig(
  onUpdate: (cfg: DynamicLoadingConfig) => void
): () => void {
  if (!db) {
    onUpdate(getCachedDynamicLoadingConfig());
    return () => {};
  }

  const docRef = doc(db, LOADING_CONFIG_DOC_PATH);
  const unsub = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const cfg: DynamicLoadingConfig = {
          globalEnabled: typeof d.globalEnabled === 'boolean' ? d.globalEnabled : true,
          defaultStyle: LOADING_STYLE_DEFINITIONS.some((s) => s.id === d.defaultStyle)
            ? (d.defaultStyle as DynamicLoadingStyleId)
            : 'purple-galaxy',
          durationMs: typeof d.durationMs === 'number' && d.durationMs >= 200 && d.durationMs <= 5000 ? d.durationMs : 1100,
          enabledStyles: Array.isArray(d.enabledStyles) && d.enabledStyles.length > 0
            ? d.enabledStyles.filter((id): id is DynamicLoadingStyleId => LOADING_STYLE_DEFINITIONS.some((s) => s.id === id))
            : DEFAULT_DYNAMIC_LOADING_CONFIG.enabledStyles,
          updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : undefined,
          updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
        };
        saveCachedDynamicLoadingConfig(cfg);
        onUpdate(cfg);
      } else {
        onUpdate(getCachedDynamicLoadingConfig());
      }
    },
    (err) => {
      logFirestoreError(err, OperationType.GET, LOADING_CONFIG_DOC_PATH);
      onUpdate(getCachedDynamicLoadingConfig());
    }
  );

  return unsub;
}

export async function saveDynamicLoadingConfigInFirestore(
  patch: Partial<DynamicLoadingConfig>,
  uid: string
): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  const docRef = doc(db, LOADING_CONFIG_DOC_PATH);
  const current = getCachedDynamicLoadingConfig();
  const next: DynamicLoadingConfig = {
    ...current,
    ...patch,
    updatedBy: uid,
    updatedAt: Date.now(),
  };
  await setDoc(docRef, {
    ...next,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  saveCachedDynamicLoadingConfig(next);
}

// In-memory artwork registry for instant route/detail transition background theming
const loadingArtworkRegistry = new Map<string, { imageUrl: string; title?: string }>();

export function registerLoadingArtwork(key: string, imageUrl?: string | null, title?: string): void {
  if (!key || !imageUrl) return;
  const trimmed = imageUrl.trim();
  if (!trimmed.startsWith('http') && !trimmed.startsWith('/api/')) return;
  loadingArtworkRegistry.set(key, { imageUrl: trimmed, title });
}

export function resolveLoadingArtworkForPath(pathname: string): string | null {
  const cleanPath = pathname.trim();
  if (loadingArtworkRegistry.has(cleanPath)) {
    return loadingArtworkRegistry.get(cleanPath)?.imageUrl || null;
  }
  // Try matching prefix keys (e.g. /anime/123 -> matches /anime/123 or related)
  for (const [key, data] of loadingArtworkRegistry.entries()) {
    if (cleanPath.startsWith(key) || key.startsWith(cleanPath)) {
      return data.imageUrl;
    }
  }
  return null;
}
