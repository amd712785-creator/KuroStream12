import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import type {
  AdminServerStats,
  BannerFrequency,
  PopupBanner,
  PopupBannerInput,
  RegisteredUsersStats,
} from '@/src/types/anime';

const CLIENT_ID_KEY = 'kurostream_client_id_v1';
const SESSION_ID_KEY = 'kurostream_session_id_v1';

function generateSafeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getAnalyticsClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing && /^[a-zA-Z0-9_.-]+$/.test(existing)) return existing;
    const next = generateSafeId('c');
    localStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return generateSafeId('c');
  }
}

export function getAnalyticsSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing && /^[a-zA-Z0-9_.-]+$/.test(existing)) return existing;
    const next = generateSafeId('s');
    sessionStorage.setItem(SESSION_ID_KEY, next);
    return next;
  } catch {
    return generateSafeId('s');
  }
}

export async function recordSiteVisit(uid?: string | null): Promise<void> {
  try {
    await fetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: getAnalyticsSessionId(),
        clientId: getAnalyticsClientId(),
        uid: uid || undefined,
      }),
    });
  } catch {
    // non-fatal background telemetry
  }
}

export async function sendPresenceHeartbeat(uid?: string | null): Promise<void> {
  try {
    await fetch('/api/analytics/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: getAnalyticsSessionId(),
        clientId: getAnalyticsClientId(),
        uid: uid || undefined,
      }),
    });
  } catch {
    // non-fatal background telemetry
  }
}

export function sendPresenceOfflineBeacon(): void {
  const payload = JSON.stringify({ sessionId: getAnalyticsSessionId() });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/offline', blob);
      return;
    }
  } catch {
    // fallback below
  }
  fetch('/api/analytics/offline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export async function fetchAdminServerStats(idToken: string): Promise<AdminServerStats> {
  const res = await fetch('/api/admin/stats', {
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });
  const data = (await res.json()) as AdminServerStats & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Failed to load admin statistics (HTTP ${res.status})`);
  }
  return data;
}

function toMillis(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val === 'object' && 'seconds' in val) {
    return Number((val as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export async function fetchAdminRegisteredUsersStats(): Promise<RegisteredUsersStats> {
  if (!db) {
    return {
      totalRegisteredUsers: 0,
      totalActiveRegisteredUsers: 0,
      registeredActiveToday: 0,
      registeredLast7Days: 0,
    };
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  try {
    const snap = await getDocs(collection(db, 'users'));
    let totalActiveRegisteredUsers = 0;
    let registeredActiveToday = 0;
    let registeredLast7Days = 0;

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const lastActiveMs = toMillis(d.lastActiveAt || d.updatedAt || d.createdAt);
      if (lastActiveMs > 0) {
        totalActiveRegisteredUsers += 1;
      }
      if (d.lastActiveDay === todayKey) {
        registeredActiveToday += 1;
      }
      if (lastActiveMs >= sevenDaysAgoMs) {
        registeredLast7Days += 1;
      }
    });

    return {
      totalRegisteredUsers: snap.size,
      totalActiveRegisteredUsers,
      registeredActiveToday,
      registeredLast7Days,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function uploadBannerImage(
  idToken: string,
  file: File
): Promise<{ imageUrl: string; mimeType: string; size: number }> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Only JPG, PNG, WebP, or GIF images are allowed.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image size must not exceed 5 MB.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });

  const res = await fetch('/api/admin/banners/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      dataBase64: dataUrl,
    }),
  });

  const data = (await res.json()) as {
    imageUrl?: string;
    mimeType?: string;
    size?: number;
    error?: string;
  };
  if (!res.ok || !data.imageUrl) {
    throw new Error(data.error || `Failed to upload image (HTTP ${res.status})`);
  }
  return {
    imageUrl: data.imageUrl,
    mimeType: data.mimeType || file.type,
    size: data.size || file.size,
  };
}

function mapBannerDoc(id: string, data: Record<string, unknown>): PopupBanner {
  const validFrequencies: BannerFrequency[] = [
    'once_per_session',
    'once_per_day',
    'once_per_user',
    'always_on_launch',
  ];
  const rawFreq = String(data.frequency || 'once_per_session') as BannerFrequency;
  return {
    id,
    title: String(data.title || '').slice(0, 160),
    description: String(data.description || '').slice(0, 1000),
    imageUrl: String(data.imageUrl || '').slice(0, 500),
    buttonText: typeof data.buttonText === 'string' && data.buttonText.trim() ? data.buttonText.trim() : undefined,
    destinationUrl:
      typeof data.destinationUrl === 'string' && data.destinationUrl.trim()
        ? data.destinationUrl.trim()
        : undefined,
    openInNewTab: Boolean(data.openInNewTab),
    enabled: Boolean(data.enabled),
    startAt: typeof data.startAt === 'string' && data.startAt.trim() ? data.startAt.trim() : undefined,
    expiresAt: typeof data.expiresAt === 'string' && data.expiresAt.trim() ? data.expiresAt.trim() : undefined,
    frequency: validFrequencies.includes(rawFreq) ? rawFreq : 'once_per_session',
    createdBy: String(data.createdBy || ''),
    createdAt: toMillis(data.createdAt) || Date.now(),
    updatedAt: toMillis(data.updatedAt) || Date.now(),
  };
}

export function isValidDestinationUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function subscribeActiveBanners(onUpdate: (banners: PopupBanner[]) => void): () => void {
  if (!db) {
    onUpdate([]);
    return () => {};
  }
  const q = query(collection(db, 'banners'), where('enabled', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapBannerDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      onUpdate(items);
    },
    (error) => {
      // Surface via standard error handler for diagnostics
      handleFirestoreError(error, OperationType.LIST, 'banners');
    }
  );
}

export function subscribeAllBannersForAdmin(
  onUpdate: (banners: PopupBanner[]) => void,
  onError?: (message: string) => void
): () => void {
  if (!db) {
    onUpdate([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'banners'),
    (snap) => {
      const items = snap.docs
        .map((d) => mapBannerDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      onUpdate(items);
    },
    (error) => {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Unable to load banners.');
      }
      handleFirestoreError(error, OperationType.LIST, 'banners');
    }
  );
}

export async function createPopupBanner(
  adminUid: string,
  input: PopupBannerInput
): Promise<string> {
  if (!db) throw new Error('Firestore is not configured.');
  const title = input.title.trim().slice(0, 160);
  const description = input.description.trim().slice(0, 1000);
  const imageUrl = input.imageUrl.trim().slice(0, 500);
  if (!title) throw new Error('Banner title is required.');
  if (!imageUrl) throw new Error('Banner image is required.');
  if (input.destinationUrl && !isValidDestinationUrl(input.destinationUrl)) {
    throw new Error('Destination URL must start with /, https://, or http://');
  }

  const bannerId = generateSafeId('banner');
  const path = `banners/${bannerId}`;
  const payload: Record<string, unknown> = {
    id: bannerId,
    title,
    description,
    imageUrl,
    buttonText: (input.buttonText || '').trim().slice(0, 60),
    destinationUrl: (input.destinationUrl || '').trim().slice(0, 500),
    openInNewTab: Boolean(input.openInNewTab),
    enabled: Boolean(input.enabled),
    startAt: (input.startAt || '').trim().slice(0, 40),
    expiresAt: (input.expiresAt || '').trim().slice(0, 40),
    frequency: input.frequency,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'banners', bannerId), payload);
    return bannerId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updatePopupBanner(
  bannerId: string,
  input: Partial<PopupBannerInput>
): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  if (input.destinationUrl !== undefined && !isValidDestinationUrl(input.destinationUrl)) {
    throw new Error('Destination URL must start with /, https://, or http://');
  }
  const path = `banners/${bannerId}`;
  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 160);
  if (input.description !== undefined) patch.description = input.description.trim().slice(0, 1000);
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl.trim().slice(0, 500);
  if (input.buttonText !== undefined) patch.buttonText = input.buttonText.trim().slice(0, 60);
  if (input.destinationUrl !== undefined) patch.destinationUrl = input.destinationUrl.trim().slice(0, 500);
  if (input.openInNewTab !== undefined) patch.openInNewTab = Boolean(input.openInNewTab);
  if (input.enabled !== undefined) patch.enabled = Boolean(input.enabled);
  if (input.startAt !== undefined) patch.startAt = input.startAt.trim().slice(0, 40);
  if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt.trim().slice(0, 40);
  if (input.frequency !== undefined) patch.frequency = input.frequency;

  try {
    await updateDoc(doc(db, 'banners', bannerId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deletePopupBanner(
  banner: Pick<PopupBanner, 'id' | 'imageUrl'>,
  idToken?: string | null
): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  const path = `banners/${banner.id}`;
  try {
    await deleteDoc(doc(db, 'banners', banner.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }

  // Clean up local uploaded file if hosted by this server
  const prefix = '/api/banners/image/';
  if (banner.imageUrl.startsWith(prefix) && idToken) {
    const filename = banner.imageUrl.slice(prefix.length);
    fetch(`/api/admin/banners/image/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    }).catch(() => {});
  }
}

export function isBannerCurrentlyScheduled(banner: PopupBanner, nowMs = Date.now()): boolean {
  if (!banner.enabled) return false;
  if (banner.startAt) {
    const startMs = Date.parse(banner.startAt);
    if (!Number.isNaN(startMs) && nowMs < startMs) return false;
  }
  if (banner.expiresAt) {
    const endMs = Date.parse(banner.expiresAt);
    if (!Number.isNaN(endMs) && nowMs > endMs) return false;
  }
  return true;
}

export function getBannerStatus(
  banner: PopupBanner,
  nowMs = Date.now()
): 'Active' | 'Scheduled' | 'Expired' | 'Disabled' {
  if (!banner.enabled) return 'Disabled';
  if (banner.startAt) {
    const startMs = Date.parse(banner.startAt);
    if (!Number.isNaN(startMs) && nowMs < startMs) return 'Scheduled';
  }
  if (banner.expiresAt) {
    const endMs = Date.parse(banner.expiresAt);
    if (!Number.isNaN(endMs) && nowMs > endMs) return 'Expired';
  }
  return 'Active';
}
