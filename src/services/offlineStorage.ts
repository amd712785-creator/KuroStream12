import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

const DB_NAME = 'kurostream_offline_v2';
const DB_VERSION = 1;
const STORE_CHUNKS = 'chunks';
const STORE_MANIFESTS = 'manifests';
const NATIVE_ROOT_DIR = 'kurostream_downloads';
const PLAYBACK_POSITIONS_KEY = 'kurostream_offline_positions_v1';

export interface OfflineManifestRecord {
  downloadId: string;
  format: 'mp4' | 'hls';
  mimeType: string;
  playlistText?: string;
  nativeMp4Path?: string;
  nativeMp4Uri?: string;
  chunkCount?: number;
  segmentKeys?: string[];
  totalBytes: number;
  updatedAt: number;
}

interface StoredChunkRecord {
  key: string;
  downloadId: string;
  data: ArrayBuffer;
  mimeType?: string;
}

function sanitizeSegment(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'item';
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const sliceSize = 0x8000;
  for (let i = 0; i < bytes.length; i += sliceSize) {
    const slice = bytes.subarray(i, Math.min(i + sliceSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name || '';
  const msg = ((err as { message?: string }).message || '').toLowerCase();
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    msg.includes('quota') ||
    msg.includes('enospc') ||
    msg.includes('no space left')
  );
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this runtime.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: 'key' });
        chunkStore.createIndex('by_downloadId', 'downloadId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_MANIFESTS)) {
        db.createObjectStore(STORE_MANIFESTS, { keyPath: 'downloadId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('Failed to open offline database.'));
    };
  });
  return dbPromise;
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openOfflineDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onerror = () => {
      if (isQuotaError(req.error)) {
        reject(new Error('Browser storage quota exceeded. Delete older downloads to free space.'));
      } else {
        reject(req.error || new Error('Failed to write offline storage.'));
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => {
      if (isQuotaError(tx.error)) {
        reject(new Error('Browser storage quota exceeded. Delete older downloads to free space.'));
      } else {
        reject(tx.error || new Error('Offline storage write aborted.'));
      }
    };
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openOfflineDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) || null);
    req.onerror = () => reject(req.error || new Error('Failed to read offline storage.'));
  });
}

async function idbDeleteChunksForDownload(downloadId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_CHUNKS, STORE_MANIFESTS], 'readwrite');
      const chunkStore = tx.objectStore(STORE_CHUNKS);
      const manifestStore = tx.objectStore(STORE_MANIFESTS);
      manifestStore.delete(downloadId);
      const index = chunkStore.index('by_downloadId');
      const cursorReq = index.openKeyCursor(IDBKeyRange.only(downloadId));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          chunkStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore IndexedDB cleanup failures
  }
}

async function ensureNativeDir(subDir: string): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: `${NATIVE_ROOT_DIR}/${subDir}`,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // directory may already exist
  }
}

export async function saveBinaryChunk(
  downloadId: string,
  chunkKey: string,
  bytes: Uint8Array,
  mimeType = 'application/octet-stream'
): Promise<void> {
  const safeId = sanitizeSegment(downloadId);
  const safeKey = sanitizeSegment(chunkKey);

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNativeDir(safeId);
      await Filesystem.writeFile({
        path: `${NATIVE_ROOT_DIR}/${safeId}/${safeKey}.bin`,
        data: uint8ToBase64(bytes),
        directory: Directory.Data,
        recursive: true,
      });
      return;
    } catch (err) {
      if (isQuotaError(err)) {
        throw new Error('Device storage full. Delete some downloaded episodes and retry.');
      }
      throw err instanceof Error ? err : new Error('Failed to write segment to device storage.');
    }
  }

  const copyBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copyBuffer).set(bytes);
  await idbPut<StoredChunkRecord>(STORE_CHUNKS, {
    key: `${downloadId}::${chunkKey}`,
    downloadId,
    data: copyBuffer,
    mimeType,
  });
}

export async function hasBinaryChunk(downloadId: string, chunkKey: string): Promise<boolean> {
  const safeId = sanitizeSegment(downloadId);
  const safeKey = sanitizeSegment(chunkKey);

  if (Capacitor.isNativePlatform()) {
    try {
      const st = await Filesystem.stat({
        path: `${NATIVE_ROOT_DIR}/${safeId}/${safeKey}.bin`,
        directory: Directory.Data,
      });
      return st.size > 0;
    } catch {
      return false;
    }
  }

  try {
    const rec = await idbGet<StoredChunkRecord>(STORE_CHUNKS, `${downloadId}::${chunkKey}`);
    return Boolean(rec && rec.data && rec.data.byteLength > 0);
  } catch {
    return false;
  }
}

export async function readBinaryChunk(
  downloadId: string,
  chunkKey: string
): Promise<{ bytes: Uint8Array; mimeType?: string } | null> {
  const safeId = sanitizeSegment(downloadId);
  const safeKey = sanitizeSegment(chunkKey);

  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Filesystem.readFile({
        path: `${NATIVE_ROOT_DIR}/${safeId}/${safeKey}.bin`,
        directory: Directory.Data,
      });
      if (typeof res.data === 'string') {
        return { bytes: base64ToUint8(res.data) };
      }
      if (res.data instanceof Blob) {
        return { bytes: new Uint8Array(await res.data.arrayBuffer()) };
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    const rec = await idbGet<StoredChunkRecord>(STORE_CHUNKS, `${downloadId}::${chunkKey}`);
    if (!rec?.data) return null;
    return { bytes: new Uint8Array(rec.data), mimeType: rec.mimeType };
  } catch {
    return null;
  }
}

export async function writeNativeMp4Chunk(
  downloadId: string,
  fileName: string,
  bytes: Uint8Array,
  append: boolean
): Promise<{ path: string; uri: string }> {
  const safeId = sanitizeSegment(downloadId);
  const safeFile = sanitizeSegment(fileName);
  const relPath = `${NATIVE_ROOT_DIR}/${safeId}/${safeFile}`;
  await ensureNativeDir(safeId);
  const b64 = uint8ToBase64(bytes);

  try {
    if (!append) {
      const res = await Filesystem.writeFile({
        path: relPath,
        data: b64,
        directory: Directory.Data,
        recursive: true,
      });
      return { path: relPath, uri: res.uri };
    }

    await Filesystem.appendFile({
      path: relPath,
      data: b64,
      directory: Directory.Data,
    });
    const uriRes = await Filesystem.getUri({
      path: relPath,
      directory: Directory.Data,
    });
    return { path: relPath, uri: uriRes.uri };
  } catch (err) {
    if (isQuotaError(err)) {
      throw new Error('Device storage full. Free up storage space and try again.');
    }
    throw err instanceof Error ? err : new Error('Failed writing video file to Android storage.');
  }
}

export async function getNativeMp4FileSize(downloadId: string, fileName: string): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;
  const safeId = sanitizeSegment(downloadId);
  const safeFile = sanitizeSegment(fileName);
  const relPath = `${NATIVE_ROOT_DIR}/${safeId}/${safeFile}`;
  try {
    const st = await Filesystem.stat({ path: relPath, directory: Directory.Data });
    return Number(st.size || 0);
  } catch {
    return 0;
  }
}

export async function saveOfflineManifest(manifest: OfflineManifestRecord): Promise<void> {
  const safeId = sanitizeSegment(manifest.downloadId);

  if (Capacitor.isNativePlatform()) {
    await ensureNativeDir(safeId);
    await Filesystem.writeFile({
      path: `${NATIVE_ROOT_DIR}/${safeId}/manifest.json`,
      data: JSON.stringify(manifest),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return;
  }

  await idbPut<OfflineManifestRecord>(STORE_MANIFESTS, manifest);
}

export async function getOfflineManifest(
  downloadId: string
): Promise<OfflineManifestRecord | null> {
  const safeId = sanitizeSegment(downloadId);

  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Filesystem.readFile({
        path: `${NATIVE_ROOT_DIR}/${safeId}/manifest.json`,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      if (typeof res.data === 'string' && res.data.trim()) {
        return JSON.parse(res.data) as OfflineManifestRecord;
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    return await idbGet<OfflineManifestRecord>(STORE_MANIFESTS, downloadId);
  } catch {
    return null;
  }
}

export async function assembleWebMp4BlobUrl(
  downloadId: string,
  chunkCount: number,
  mimeType = 'video/mp4'
): Promise<string | null> {
  const parts: BlobPart[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = await readBinaryChunk(downloadId, `mp4_part_${i}`);
    if (!chunk) return null;
    const copy = new Uint8Array(chunk.bytes.byteLength);
    copy.set(chunk.bytes);
    parts.push(copy.buffer);
  }
  if (parts.length === 0) return null;
  const blob = new Blob(parts, { type: mimeType || 'video/mp4' });
  return URL.createObjectURL(blob);
}

export async function deleteDownloadStorage(downloadId: string, fileUri?: string): Promise<void> {
  const safeId = sanitizeSegment(downloadId);

  if (fileUri && fileUri.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(fileUri);
    } catch {
      // ignore
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.rmdir({
        path: `${NATIVE_ROOT_DIR}/${safeId}`,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {
      // ignore missing directory
    }
    if (fileUri && fileUri.startsWith('file://')) {
      try {
        await Filesystem.deleteFile({ path: fileUri });
      } catch {
        // ignore if already removed with directory
      }
    }
  }

  await idbDeleteChunksForDownload(downloadId);
  clearOfflinePlaybackPosition(downloadId);
}

export function getOfflinePlaybackPosition(downloadId: string): {
  currentTime: number;
  duration: number;
  updatedAt: number;
} | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PLAYBACK_POSITIONS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<
      string,
      { currentTime: number; duration: number; updatedAt: number }
    >;
    return map[downloadId] || null;
  } catch {
    return null;
  }
}

export function saveOfflinePlaybackPosition(
  downloadId: string,
  currentTime: number,
  duration: number
): void {
  if (typeof localStorage === 'undefined' || !Number.isFinite(currentTime)) return;
  try {
    const raw = localStorage.getItem(PLAYBACK_POSITIONS_KEY);
    const map = raw
      ? (JSON.parse(raw) as Record<
          string,
          { currentTime: number; duration: number; updatedAt: number }
        >)
      : {};
    map[downloadId] = {
      currentTime: Math.max(0, currentTime),
      duration: Math.max(0, Number.isFinite(duration) ? duration : 0),
      updatedAt: Date.now(),
    };
    localStorage.setItem(PLAYBACK_POSITIONS_KEY, JSON.stringify(map));
  } catch {
    // ignore localStorage quota errors
  }
}

export function clearOfflinePlaybackPosition(downloadId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(PLAYBACK_POSITIONS_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, unknown>;
    if (downloadId in map) {
      delete map[downloadId];
      localStorage.setItem(PLAYBACK_POSITIONS_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore
  }
}
