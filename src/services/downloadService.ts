import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { resolveApiUrl } from '@/src/config/env';
import { authorizedApiFetch } from '@/src/services/authorizedFetch';

export interface DownloadItem {
  id: string; // unique download task id (animeId-episodeId)
  animeId: number;
  animeTitle: string;
  coverImage: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  audioMode: 'sub' | 'dub' | 'hindi';
  streamUrl: string;
  fileUri?: string;
  blobData?: string; // fallback base64/blob URL for web
  fileSize: number; // in bytes
  downloadedBytes: number;
  progress: number; // 0 to 100
  speedBytesPerSec: number;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
}

const DOWNLOADS_STORAGE_KEY = 'kurostream_offline_downloads_v1';
const BLOB_STORAGE_PREFIX = 'kurostream_blob_';

export function getStoredDownloads(): DownloadItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DOWNLOADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as DownloadItem[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveStoredDownloads(items: DownloadItem[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // strip bulky blobData when persisting to localStorage to avoid QuotaExceededError;
    // blobData for web is kept in IndexedDB or sessionStorage if needed, or lightweight storage
    const slim = items.map((i) => ({ ...i, blobData: undefined }));
    localStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(slim));
    window.dispatchEvent(new CustomEvent('kurostream:downloads-updated'));
  } catch {
    // ignore
  }
}

// Active download controllers map for pause/cancel
const activeAbortControllers = new Map<string, AbortController>();

export async function startDownloadEpisode(
  item: Omit<DownloadItem, 'downloadedBytes' | 'progress' | 'speedBytesPerSec' | 'status' | 'createdAt'>,
  onUpdate: (updated: DownloadItem) => void
): Promise<void> {
  const downloadId = item.id;
  const all = getStoredDownloads();
  const existingIndex = all.findIndex((d) => d.id === downloadId);

  const newItem: DownloadItem = {
    ...item,
    downloadedBytes: 0,
    progress: 0,
    speedBytesPerSec: 0,
    status: 'downloading',
    createdAt: Date.now(),
  };

  if (existingIndex >= 0) {
    all[existingIndex] = newItem;
  } else {
    all.unshift(newItem);
  }
  saveStoredDownloads(all);
  onUpdate(newItem);

  const controller = new AbortController();
  activeAbortControllers.set(downloadId, controller);

  try {
    const resolvedStreamUrl = item.streamUrl.startsWith('/')
      ? resolveApiUrl(item.streamUrl)
      : item.streamUrl;

    const res = await authorizedApiFetch(resolvedStreamUrl, {
      signal: controller.signal,
      timeoutMs: 60000,
    });

    if (!res.ok) {
      throw new Error(`Download request failed with HTTP ${res.status}`);
    }

    const contentLengthHeader = res.headers.get('content-length');
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Response body stream is unreadable.');
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    const startTime = Date.now();
    let lastTime = startTime;
    let lastBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;

        const now = Date.now();
        const elapsedSec = (now - lastTime) / 1000;
        if (elapsedSec >= 0.4) {
          const diffBytes = receivedBytes - lastBytes;
          const speed = Math.round(diffBytes / elapsedSec);
          lastTime = now;
          lastBytes = receivedBytes;

          const progress = totalBytes > 0 ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : Math.min(95, Math.round(receivedBytes / 50000));

          const currentList = getStoredDownloads();
          const idx = currentList.findIndex((d) => d.id === downloadId);
          if (idx >= 0) {
            currentList[idx] = {
              ...currentList[idx],
              downloadedBytes: receivedBytes,
              fileSize: totalBytes || receivedBytes,
              progress,
              speedBytesPerSec: speed,
              status: 'downloading',
            };
            saveStoredDownloads(currentList);
            onUpdate(currentList[idx]);
          }
        }
      }
    }

    // Combine chunks into single Blob / Buffer
    const blob = new Blob(chunks as unknown as BlobPart[], { type: 'video/mp4' });
    const finalSize = blob.size;

    let savedFileUri = '';
    if (Capacitor.isNativePlatform()) {
      // Save to native filesystem (Directory.Data)
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
        reader.readAsDataURL(blob);
      });

      const fileName = `kurostream_${item.animeId}_ep_${item.episodeNumber}_${Date.now()}.mp4`;
      const writeFileResult = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Data,
      });
      savedFileUri = writeFileResult.uri;
    } else {
      // Web browser fallback: store blob URL or cache
      const blobUrl = URL.createObjectURL(blob);
      try {
        localStorage.setItem(`${BLOB_STORAGE_PREFIX}${downloadId}`, blobUrl);
      } catch {
        // storage quota exceeded fallback
      }
      savedFileUri = blobUrl;
    }

    const finalizedList = getStoredDownloads();
    const finalIdx = finalizedList.findIndex((d) => d.id === downloadId);
    if (finalIdx >= 0) {
      finalizedList[finalIdx] = {
        ...finalizedList[finalIdx],
        downloadedBytes: finalSize,
        fileSize: finalSize,
        progress: 100,
        speedBytesPerSec: 0,
        status: 'completed',
        fileUri: savedFileUri,
        completedAt: Date.now(),
      };
      saveStoredDownloads(finalizedList);
      onUpdate(finalizedList[finalIdx]);
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return;
    }
    const msg = err instanceof Error ? err.message : 'Download failed.';
    const currentList = getStoredDownloads();
    const idx = currentList.findIndex((d) => d.id === downloadId);
    if (idx >= 0) {
      currentList[idx] = {
        ...currentList[idx],
        status: 'error',
        errorMessage: msg,
        speedBytesPerSec: 0,
      };
      saveStoredDownloads(currentList);
      onUpdate(currentList[idx]);
    }
  } finally {
    activeAbortControllers.delete(downloadId);
  }
}

export function pauseDownload(downloadId: string): void {
  const controller = activeAbortControllers.get(downloadId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(downloadId);
  }
  const all = getStoredDownloads();
  const idx = all.findIndex((d) => d.id === downloadId);
  if (idx >= 0 && all[idx].status === 'downloading') {
    all[idx].status = 'paused';
    all[idx].speedBytesPerSec = 0;
    saveStoredDownloads(all);
  }
}

export function cancelOrDeleteDownload(downloadId: string): void {
  const controller = activeAbortControllers.get(downloadId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(downloadId);
  }
  const all = getStoredDownloads();
  const target = all.find((d) => d.id === downloadId);
  if (target?.fileUri && !Capacitor.isNativePlatform() && target.fileUri.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(target.fileUri);
      localStorage.removeItem(`${BLOB_STORAGE_PREFIX}${downloadId}`);
    } catch {
      // ignore
    }
  }
  const next = all.filter((d) => d.id !== downloadId);
  saveStoredDownloads(next);
}

export async function getPlayableDownloadUrl(item: DownloadItem): Promise<string> {
  if (item.fileUri) {
    if (Capacitor.isNativePlatform() && item.fileUri.startsWith('file://')) {
      const converted = Capacitor.convertFileSrc(item.fileUri);
      return converted;
    }
    return item.fileUri;
  }
  if (typeof localStorage !== 'undefined') {
    const cachedBlob = localStorage.getItem(`${BLOB_STORAGE_PREFIX}${item.id}`);
    if (cachedBlob) return cachedBlob;
  }
  return item.streamUrl;
}
