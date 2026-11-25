import { CapacitorHttp } from '@capacitor/core';
import {
  getBackendApiOrigins,
  isNativeCapacitorRuntime,
  resolveApiUrl,
} from '@/src/config/env';
import { getFreshFirebaseIdToken } from '@/src/services/authorizedFetch';

export type UserMediaKind = 'avatar' | 'banner';

export interface UploadedUserMediaResult {
  imageUrl: string;
  mimeType: string;
  size: number;
}

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function validateUserImageFile(file: File, maxRawBytes = 10 * 1024 * 1024): void {
  const mime = (file.type || '').trim().toLowerCase();
  const hasSupportedExt = /\.(jpe?g|png|webp|gif)$/i.test(file.name || '');

  if (mime && mime !== 'application/octet-stream' && !ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new Error('Only JPG, PNG, WebP, or GIF images are supported.');
  }
  if ((!mime || mime === 'application/octet-stream') && !hasSupportedExt) {
    throw new Error('Unsupported file format. Please choose a JPG, PNG, WebP, or GIF image.');
  }
  if (file.size <= 0) {
    throw new Error('Selected image file is empty.');
  }
  if (file.size > maxRawBytes) {
    const maxMb = Math.round(maxRawBytes / (1024 * 1024));
    throw new Error(`Image size must not exceed ${maxMb} MB.`);
  }
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image data.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resizes and compresses large phone gallery photos client-side into WebP/JPEG
 * before upload while leaving small files and animated GIFs untouched.
 */
export async function optimizeImageFileForUpload(
  file: File,
  kind: UserMediaKind
): Promise<File> {
  validateUserImageFile(file);

  const mime = (file.type || '').trim().toLowerCase();
  const isGif = mime === 'image/gif' || /\.gif$/i.test(file.name || '');
  if (isGif) {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('GIF image size must not exceed 5 MB.');
    }
    return file;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  const maxWidth = kind === 'avatar' ? 512 : 1600;
  const maxHeight = kind === 'avatar' ? 512 : 900;

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width || maxWidth;
        let height = img.naturalHeight || img.height || maxHeight;

        const needsResize = width > maxWidth || height > maxHeight || file.size > 900 * 1024;
        if (!needsResize && file.size <= 4 * 1024 * 1024) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }

        if (width > maxWidth) {
          height = Math.max(1, Math.round((height * maxWidth) / width));
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.max(1, Math.round((width * maxHeight) / height));
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const tryEncode = (targetMime: string, quality: number) =>
          new Promise<Blob | null>((resBlob) => canvas.toBlob(resBlob, targetMime, quality));

        void (async () => {
          let blob = await tryEncode('image/webp', 0.84);
          let outMime = 'image/webp';
          let ext = 'webp';

          if (!blob || blob.size === 0 || blob.type !== 'image/webp') {
            blob = await tryEncode('image/jpeg', 0.85);
            outMime = 'image/jpeg';
            ext = 'jpg';
          }

          URL.revokeObjectURL(objectUrl);
          if (!blob || blob.size === 0) {
            resolve(file);
            return;
          }

          const baseName = (file.name || kind).replace(/\.[^/.]+$/, '') || kind;
          resolve(new File([blob], `${baseName}.${ext}`, { type: outMime }));
        })();
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

function extractUploadErrorMessage(raw: unknown, fallback: string): string {
  if (raw && typeof raw === 'object' && 'error' in raw) {
    const errVal = (raw as { error?: unknown }).error;
    if (typeof errVal === 'string' && errVal.trim()) return errVal.trim();
  }
  if (typeof raw === 'string' && raw.trim() && !raw.trim().startsWith('<')) {
    return raw.trim();
  }
  return fallback;
}

function uploadViaXhr(
  uploadUrl: string,
  token: string,
  file: File,
  kind: UserMediaKind,
  onProgress?: (percent: number) => void
): Promise<{ status: number; result?: UploadedUserMediaResult; errorMessage?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = 60000;

    const formData = new FormData();
    formData.append('kind', kind);
    formData.append('image', file, file.name || `${kind}.webp`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.max(10, Math.min(95, Math.round((event.loaded / event.total) * 100)));
        onProgress?.(pct);
      }
    };

    xhr.onload = () => {
      let parsed: Record<string, unknown> | null = null;
      const rawText = xhr.responseText || '';
      try {
        parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && typeof parsed?.imageUrl === 'string') {
        onProgress?.(100);
        resolve({
          status: xhr.status,
          result: {
            imageUrl: parsed.imageUrl,
            mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : file.type || 'image/webp',
            size: typeof parsed.size === 'number' ? parsed.size : file.size,
          },
        });
        return;
      }

      resolve({
        status: xhr.status || 500,
        errorMessage: extractUploadErrorMessage(
          parsed || rawText,
          `Upload failed (HTTP ${xhr.status || 500})`
        ),
      });
    };

    xhr.onerror = () => {
      reject(new Error('NETWORK_ERROR'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Image upload timed out. Please check your connection and try again.'));
    };

    xhr.send(formData);
  });
}

async function uploadViaNativeCapacitorHttp(
  token: string,
  file: File,
  kind: UserMediaKind,
  onProgress?: (percent: number) => void
): Promise<UploadedUserMediaResult> {
  const dataUrl = await readBlobAsDataUrl(file);
  const commaIdx = dataUrl.indexOf(',');
  const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const payload = JSON.stringify({
    kind,
    mimeType: file.type || 'image/webp',
    dataBase64: base64Data,
  });

  onProgress?.(55);

  const origins = getBackendApiOrigins();
  let lastErr: Error | null = null;

  for (const origin of origins) {
    try {
      const targetUrl = `${origin}/api/user/media/upload?kind=${encodeURIComponent(kind)}`;
      const res = await CapacitorHttp.post({
        url: targetUrl,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        data: payload,
        connectTimeout: 45000,
        readTimeout: 60000,
      });

      const parsed =
        typeof res.data === 'string'
          ? (JSON.parse(res.data) as Record<string, unknown>)
          : (res.data as Record<string, unknown>);

      if (res.status >= 200 && res.status < 300 && typeof parsed?.imageUrl === 'string') {
        onProgress?.(100);
        return {
          imageUrl: parsed.imageUrl,
          mimeType:
            typeof parsed.mimeType === 'string' ? parsed.mimeType : file.type || 'image/webp',
          size: typeof parsed.size === 'number' ? parsed.size : file.size,
        };
      }

      lastErr = new Error(
        extractUploadErrorMessage(parsed, `Upload failed (HTTP ${res.status || 500})`)
      );
      if (res.status >= 400 && res.status < 500) {
        throw lastErr;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error('Failed to upload image.');
    }
  }

  throw lastErr || new Error('Network error while uploading image.');
}

/**
 * Validates, optimizes, and uploads a user avatar or profile banner image to the KuroStream server.
 */
export async function uploadUserProfileMedia(
  file: File,
  kind: UserMediaKind,
  onProgress?: (percent: number) => void
): Promise<UploadedUserMediaResult> {
  onProgress?.(5);
  const optimizedFile = await optimizeImageFileForUpload(file, kind);
  if (optimizedFile.size > 5 * 1024 * 1024) {
    throw new Error('Processed image is larger than 5 MB. Please select a smaller picture.');
  }

  let token = await getFreshFirebaseIdToken(false);
  if (!token) {
    throw new Error('Please sign in again before uploading a picture.');
  }

  const uploadUrl = resolveApiUrl(`/api/user/media/upload?kind=${encodeURIComponent(kind)}`);

  try {
    let response = await uploadViaXhr(uploadUrl, token, optimizedFile, kind, onProgress);
    if (response.status === 401) {
      const refreshed = await getFreshFirebaseIdToken(true);
      if (refreshed) {
        token = refreshed;
        response = await uploadViaXhr(uploadUrl, refreshed, optimizedFile, kind, onProgress);
      }
    }

    if (response.result) {
      return response.result;
    }

    throw new Error(response.errorMessage || 'Failed to upload profile image.');
  } catch (err) {
    const isNetworkErr = err instanceof Error && err.message === 'NETWORK_ERROR';
    if (isNetworkErr && isNativeCapacitorRuntime()) {
      return uploadViaNativeCapacitorHttp(token, optimizedFile, kind, onProgress);
    }
    if (isNetworkErr) {
      throw new Error('Network error while uploading image. Please check your connection and try again.');
    }
    throw err instanceof Error ? err : new Error('Failed to upload profile image.');
  }
}
