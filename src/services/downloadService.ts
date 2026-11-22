import { Capacitor } from '@capacitor/core';
import { resolveApiUrl } from '@/src/config/env';
import { isGenuineMediaDownloadUrl, resolveAnimeWorldStreamForAnime } from '@/src/services/animeWorldApi';
import { authorizedApiFetch } from '@/src/services/authorizedFetch';
import {
  assembleWebMp4BlobUrl,
  deleteDownloadStorage,
  getNativeMp4FileSize,
  getOfflineManifest,
  hasBinaryChunk,
  saveBinaryChunk,
  saveOfflineManifest,
  writeNativeMp4Chunk,
  type OfflineManifestRecord,
} from '@/src/services/offlineStorage';
import { fetchEpisodeStream } from '@/src/services/streamingApi';
import type { MediaFormat, ParsedStreamResult, StreamSource } from '@/src/types/anime';

export interface DownloadRefreshContext {
  kind: 'standard' | 'animeworld';
  episodeId: string;
  movieId?: string;
  anilistId?: number;
  malId?: number | null;
  episodeNumber?: number;
  server?: string;
  audioMode: 'sub' | 'dub' | 'hindi';
  title?: string;
  romajiTitle?: string;
  format?: MediaFormat | null;
  seasonYear?: number | null;
}

export interface DownloadItem {
  id: string;
  animeId: number;
  animeTitle: string;
  coverImage: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  audioMode: 'sub' | 'dub' | 'hindi';
  streamUrl: string;
  referer?: string;
  serverName?: string;
  quality?: string;
  format: 'mp4' | 'hls';
  mimeType?: string;
  fileUri?: string;
  blobData?: string;
  fileSize: number;
  downloadedBytes: number;
  progress: number;
  speedBytesPerSec: number;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
  completedSegments?: number;
  totalSegments?: number;
  mp4ChunkCount?: number;
  supportsRange?: boolean;
  refreshContext?: DownloadRefreshContext;
  createdAt: number;
  completedAt?: number;
}

export type NewDownloadInput = Omit<
  DownloadItem,
  | 'downloadedBytes'
  | 'progress'
  | 'speedBytesPerSec'
  | 'status'
  | 'createdAt'
  | 'completedSegments'
  | 'totalSegments'
  | 'mp4ChunkCount'
  | 'format'
> & {
  format?: 'mp4' | 'hls';
  fileSize?: number;
};

export interface DownloadCandidate {
  url: string;
  format: 'mp4' | 'hls';
  quality: string;
  referer?: string;
}

export type DownloadSelectionResult =
  | { ok: true; candidate: DownloadCandidate }
  | { ok: false; reason: 'no-sources' | 'embed-only'; message: string };

export type OfflinePlaybackHandle =
  | {
      mode: 'mp4';
      url: string;
      mimeType: string;
      revoke?: () => void;
    }
  | {
      mode: 'hls';
      manifest: OfflineManifestRecord;
    };

const DOWNLOADS_STORAGE_KEY = 'kurostream_offline_downloads_v1';
const MAX_CONCURRENT_DOWNLOADS = 2;
const MP4_CHUNK_BYTES = 1536 * 1024; // 1.5 MB per HTTP range slice (fits Vercel payload & Capacitor RAM)
const HLS_SEGMENT_CONCURRENCY = 3;

const activeAbortControllers = new Map<string, AbortController>();
const activeRunningIds = new Set<string>();
const pendingQueueIds: string[] = [];
const downloadUpdateListeners = new Map<string, (updated: DownloadItem) => void>();

class ExpiredStreamUrlError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ExpiredStreamUrlError';
    this.statusCode = statusCode;
  }
}

function dispatchDownloadsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kurostream:downloads-updated'));
  }
}

function inferFormatFromUrl(rawUrl: string): 'mp4' | 'hls' {
  const unwrapped = unwrapProxyUrl(rawUrl).targetUrl.toLowerCase();
  if (unwrapped.includes('.m3u8') || unwrapped.includes('/master.txt')) return 'hls';
  return 'mp4';
}

export function isEmbedLikeUrl(rawUrl?: string | null): boolean {
  if (!rawUrl) return true;
  const unwrapped = unwrapProxyUrl(rawUrl).targetUrl.toLowerCase();
  try {
    const parsed = new URL(unwrapped, 'https://kurostream.local');
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (
      host.includes('ravok.buzz') ||
      host.includes('abyssplayer.com') ||
      host.includes('megaplay.buzz') ||
      host.includes('short.icu') ||
      unwrapped.includes('multi-lang-plyr')
    ) {
      return true;
    }
    if (
      (path.includes('/embed') || path.includes('/e/') || path.includes('/video/')) &&
      !/\.(mp4|webm|mkv|m3u8)(\?|$)/i.test(unwrapped)
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function unwrapProxyUrl(
  rawUrl: string,
  fallbackReferer = ''
): { targetUrl: string; referer: string } {
  let current = (rawUrl || '').trim();
  let referer = fallbackReferer || '';

  for (let depth = 0; depth < 3; depth++) {
    if (!current) break;
    if (!current.includes('/api/anime/proxy')) break;
    try {
      const parsed = new URL(current, 'https://kurostream.local');
      const inner = parsed.searchParams.get('url');
      const refParam = parsed.searchParams.get('referer');
      if (refParam && !referer) referer = refParam;
      if (inner && /^https?:\/\//i.test(inner)) {
        current = inner;
        continue;
      }
      break;
    } catch {
      break;
    }
  }

  return { targetUrl: current, referer };
}

function buildProxyMediaUrl(targetUrl: string, referer?: string, expectMedia = true): string {
  const { targetUrl: cleanTarget, referer: cleanRef } = unwrapProxyUrl(targetUrl, referer || '');
  const params = new URLSearchParams();
  params.set('url', cleanTarget);
  if (cleanRef) params.set('referer', cleanRef);
  if (expectMedia) params.set('expectMedia', '1');
  return resolveApiUrl(`/api/anime/proxy?${params.toString()}`);
}

function scoreQualityLabel(label?: string): number {
  const text = (label || '').toLowerCase();
  if (text.includes('2160') || text.includes('4k')) return 2160;
  if (text.includes('1080')) return 1080;
  if (text.includes('720')) return 720;
  if (text.includes('480')) return 480;
  if (text.includes('360')) return 360;
  if (text.includes('auto') || text.includes('default')) return 500;
  const numMatch = text.match(/(\d{3,4})p?/);
  return numMatch ? Number(numMatch[1]) : 100;
}

export function selectDownloadableSource(
  streamData?: ParsedStreamResult | null,
  preferredUrl?: string | null
): DownloadSelectionResult {
  if (!streamData && !preferredUrl) {
    return {
      ok: false,
      reason: 'no-sources',
      message: 'Stream data is not loaded yet. Wait for the stream to resolve and try again.',
    };
  }

  const referer =
    streamData?.headers?.Referer || streamData?.headers?.referer || undefined;

  if (preferredUrl && !isEmbedLikeUrl(preferredUrl)) {
    const format = inferFormatFromUrl(preferredUrl);
    return {
      ok: true,
      candidate: {
        url: preferredUrl,
        format,
        quality: format === 'mp4' ? 'MP4' : 'HLS',
        referer,
      },
    };
  }

  if (streamData?.downloadUrl && isGenuineMediaDownloadUrl(streamData.downloadUrl)) {
    const fmt = inferFormatFromUrl(streamData.downloadUrl);
    return {
      ok: true,
      candidate: {
        url: streamData.downloadUrl,
        format: fmt,
        quality: fmt === 'mp4' ? 'Direct MP4' : 'HLS',
        referer,
      },
    };
  }

  const sources = streamData?.sources || [];
  if (sources.length === 0) {
    return {
      ok: false,
      reason: 'no-sources',
      message: 'No playable stream sources were returned for this episode.',
    };
  }

  const mp4Sources = sources
    .filter((s) => s.type === 'mp4' && !isEmbedLikeUrl(s.url))
    .sort((a, b) => scoreQualityLabel(b.quality) - scoreQualityLabel(a.quality));

  if (mp4Sources.length > 0) {
    return {
      ok: true,
      candidate: {
        url: mp4Sources[0].url,
        format: 'mp4',
        quality: mp4Sources[0].quality || 'MP4',
        referer,
      },
    };
  }

  const hlsSources = sources
    .filter((s) => (s.type === 'hls' || s.isM3U8) && !isEmbedLikeUrl(s.url))
    .sort((a, b) => scoreQualityLabel(b.quality) - scoreQualityLabel(a.quality));

  if (hlsSources.length > 0) {
    return {
      ok: true,
      candidate: {
        url: hlsSources[0].url,
        format: 'hls',
        quality: hlsSources[0].quality || 'Auto HLS',
        referer,
      },
    };
  }

  return {
    ok: false,
    reason: 'embed-only',
    message:
      'This mirror only supplies an embedded iframe player and does not expose a downloadable MP4 or HLS stream. Switch to Vidstreaming, Megacloud, or another downloadable server.',
  };
}

export async function resolveBestDownloadableStreamForEpisode(options: {
  episodeId: string;
  dubId?: string;
  episodeNumber: number;
  anilistId?: number;
  malId?: number | null;
  audioMode: 'sub' | 'dub' | 'hindi';
  preferredServer?: string;
  animeTitle?: string;
  romajiTitle?: string;
  format?: MediaFormat | null;
  seasonYear?: number | null;
}): Promise<
  | {
      ok: true;
      candidate: DownloadCandidate;
      serverName: string;
      refreshContext: DownloadRefreshContext;
    }
  | { ok: false; message: string }
> {
  if (options.audioMode === 'hindi') {
    const awRes = await resolveAnimeWorldStreamForAnime({
      title: options.animeTitle,
      romajiTitle: options.romajiTitle,
      format: options.format,
      seasonYear: options.seasonYear,
      episodeNumber: options.episodeNumber,
      preferHindi: true,
      preferLang: 'hindi',
    });
    if (awRes.data) {
      const sel = selectDownloadableSource(awRes.data);
      if (sel.ok) {
        return {
          ok: true,
          candidate: sel.candidate,
          serverName: 'animeworld-india',
          refreshContext: {
            kind: 'animeworld',
            episodeId: options.episodeId,
            episodeNumber: options.episodeNumber,
            audioMode: 'hindi',
            title: options.animeTitle,
            romajiTitle: options.romajiTitle,
            format: options.format,
            seasonYear: options.seasonYear,
          },
        };
      }
      return {
        ok: false,
        message:
          'Hindi (AnimeWorld India) mirror is currently embed-only for this episode. Switch Watch Audio to SUB/DUB to download from Vidstreaming or Megacloud.',
      };
    }
    return {
      ok: false,
      message:
        awRes.error?.message || 'Hindi stream could not be resolved for offline download.',
    };
  }

  const epIdToUse =
    options.audioMode === 'dub' && options.dubId ? options.dubId : options.episodeId;

  const baseServers = [
    'vidstreaming',
    'megacloud',
    'streamsb',
    'hianime',
    'kaido',
    'aniwatchtv',
    'animepahe',
    'munchyroll',
  ];
  const orderedServers = options.preferredServer
    ? [
        options.preferredServer.toLowerCase(),
        ...baseServers.filter((s) => s !== options.preferredServer?.toLowerCase()),
      ]
    : baseServers;

  let lastReason = 'No downloadable video source found across streaming servers.';

  for (const srv of orderedServers) {
    const res = await fetchEpisodeStream(epIdToUse, {
      server: srv,
      category: options.audioMode,
      anilistId: options.anilistId,
      malId: options.malId,
      episodeNumber: options.episodeNumber,
    });
    if (!res.data) {
      if (res.error?.message) lastReason = res.error.message;
      continue;
    }
    const sel = selectDownloadableSource(res.data);
    if (sel.ok) {
      return {
        ok: true,
        candidate: sel.candidate,
        serverName: srv,
        refreshContext: {
          kind: 'standard',
          episodeId: epIdToUse,
          anilistId: options.anilistId,
          malId: options.malId,
          episodeNumber: options.episodeNumber,
          server: srv,
          audioMode: options.audioMode,
        },
      };
    }
    lastReason = sel.message;
  }

  return { ok: false, message: lastReason };
}

export function getStoredDownloads(): DownloadItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DOWNLOADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((rawItem: Record<string, unknown>) => {
      const item = rawItem as unknown as DownloadItem;
      const format = item.format || inferFormatFromUrl(item.streamUrl || '');
      const isLiveInMemory =
        activeRunningIds.has(item.id) || pendingQueueIds.includes(item.id);
      const normalizedStatus: DownloadItem['status'] =
        (item.status === 'downloading' || item.status === 'queued') && !isLiveInMemory
          ? 'paused'
          : item.status;

      return {
        ...item,
        format,
        status: normalizedStatus,
        speedBytesPerSec: normalizedStatus === 'downloading' ? item.speedBytesPerSec || 0 : 0,
      };
    });
  } catch {
    return [];
  }
}

export function getDownloadById(downloadId: string): DownloadItem | undefined {
  return getStoredDownloads().find((d) => d.id === downloadId);
}

export function saveStoredDownloads(items: DownloadItem[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const slim = items.map((i) => ({ ...i, blobData: undefined }));
    localStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(slim));
    dispatchDownloadsUpdated();
  } catch {
    // ignore storage quota errors on metadata list
  }
}

function updateStoredItem(
  downloadId: string,
  patch: Partial<DownloadItem> | ((prev: DownloadItem) => Partial<DownloadItem>)
): DownloadItem | null {
  const all = getStoredDownloads();
  const idx = all.findIndex((d) => d.id === downloadId);
  if (idx < 0) return null;
  const resolvedPatch = typeof patch === 'function' ? patch(all[idx]) : patch;
  const updated: DownloadItem = {
    ...all[idx],
    ...resolvedPatch,
  };
  all[idx] = updated;
  saveStoredDownloads(all);
  downloadUpdateListeners.get(downloadId)?.(updated);
  return updated;
}

function parseAttributesLine(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|([^,\s]*))/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrStr)) !== null) {
    const key = match[1].toUpperCase();
    const val = match[3] !== undefined ? match[3] : match[4] || '';
    out[key] = val;
  }
  return out;
}

function resolvePlaylistLineUrl(rawLineUrl: string, baseTargetUrl: string, defaultReferer: string): {
  targetUrl: string;
  referer: string;
} {
  const trimmed = rawLineUrl.trim();
  if (trimmed.includes('/api/anime/proxy')) {
    return unwrapProxyUrl(trimmed, defaultReferer);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { targetUrl: trimmed, referer: defaultReferer };
  }
  try {
    const resolved = new URL(trimmed, baseTargetUrl).toString();
    return { targetUrl: resolved, referer: defaultReferer };
  } catch {
    return { targetUrl: trimmed, referer: defaultReferer };
  }
}

function rewriteTagUri(
  line: string,
  replacementUri: string
): string {
  if (/URI="[^"]*"/i.test(line)) {
    return line.replace(/URI="[^"]*"/i, `URI="${replacementUri}"`);
  }
  return line;
}

async function fetchTextViaProxy(
  targetUrl: string,
  referer: string,
  signal: AbortSignal
): Promise<string> {
  const proxied = buildProxyMediaUrl(targetUrl, referer, true);
  const res = await authorizedApiFetch(proxied, { signal, timeoutMs: 30000 });
  if (res.status === 401 || res.status === 403 || res.status === 410) {
    throw new ExpiredStreamUrlError(res.status, `Stream link expired or denied (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    let errText = '';
    try {
      errText = await res.text();
    } catch {
      errText = '';
    }
    throw new Error(
      errText && errText.length < 220
        ? errText
        : `Playlist request failed with HTTP ${res.status}.`
    );
  }
  const text = await res.text();
  if (!text.trim().startsWith('#EXTM3U')) {
    throw new Error('Upstream URL did not return a valid HLS (.m3u8) playlist.');
  }
  return text;
}

async function fetchBytesViaProxy(
  targetUrl: string,
  referer: string,
  signal: AbortSignal,
  extraHeaders?: Record<string, string>
): Promise<{
  status: number;
  bytes: Uint8Array;
  mimeType: string;
  contentRange: string | null;
  contentLength: number;
}> {
  const proxied = buildProxyMediaUrl(targetUrl, referer, true);
  const res = await authorizedApiFetch(proxied, {
    signal,
    timeoutMs: 45000,
    headers: extraHeaders,
  });

  if (res.status === 401 || res.status === 403 || res.status === 410) {
    throw new ExpiredStreamUrlError(res.status, `Media URL expired or denied (HTTP ${res.status}).`);
  }
  if (res.status === 415) {
    throw new Error('Provider returned an HTML webpage instead of a downloadable video file.');
  }
  if (!res.ok) {
    throw new Error(`Media fetch failed with HTTP ${res.status}.`);
  }

  const mimeType = (res.headers.get('content-type') || 'application/octet-stream').toLowerCase();
  if (mimeType.includes('text/html') || mimeType.includes('application/xhtml+xml')) {
    throw new Error('Upstream server returned HTML instead of video data.');
  }

  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.byteLength === 0) {
    throw new Error('Received empty media segment from provider.');
  }

  // Verify response isn't an HTML error page disguised with wrong MIME
  if (bytes.byteLength >= 15) {
    const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart().toLowerCase();
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
      throw new Error('Provider returned an HTML error page instead of media binary.');
    }
  }

  const contentRange = res.headers.get('content-range');
  const contentLengthHeader = res.headers.get('content-length');
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : bytes.byteLength;

  return {
    status: res.status,
    bytes,
    mimeType,
    contentRange,
    contentLength: Number.isFinite(contentLength) ? contentLength : bytes.byteLength,
  };
}

function parseMasterPlaylist(masterText: string, masterTargetUrl: string, referer: string): {
  videoUrl: string;
  videoReferer: string;
  audioUrl?: string;
  audioReferer?: string;
} {
  const lines = masterText.split(/\r?\n/);
  const variants: Array<{
    url: string;
    referer: string;
    bandwidth: number;
    height: number;
    audioGroup?: string;
  }> = [];
  const audioTracks: Array<{
    groupId: string;
    url: string;
    referer: string;
    isDefault: boolean;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const attrs = parseAttributesLine(line.slice('#EXT-X-MEDIA:'.length));
      if (attrs.TYPE === 'AUDIO' && attrs.URI && attrs['GROUP-ID']) {
        const resolved = resolvePlaylistLineUrl(attrs.URI, masterTargetUrl, referer);
        audioTracks.push({
          groupId: attrs['GROUP-ID'],
          url: resolved.targetUrl,
          referer: resolved.referer,
          isDefault: attrs.DEFAULT === 'YES' || attrs.AUTOSELECT === 'YES',
        });
      }
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = parseAttributesLine(line.slice('#EXT-X-STREAM-INF:'.length));
      const bandwidth = Number(attrs.BANDWIDTH || attrs['AVERAGE-BANDWIDTH'] || 0) || 0;
      let height = 0;
      if (attrs.RESOLUTION) {
        const parts = attrs.RESOLUTION.toLowerCase().split('x');
        height = Number(parts[1] || parts[0]) || 0;
      }
      // Next non-empty non-comment line is URI
      let nextUriLine = '';
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j].trim();
        if (!candidate) continue;
        if (candidate.startsWith('#')) continue;
        nextUriLine = candidate;
        break;
      }
      if (nextUriLine) {
        const resolved = resolvePlaylistLineUrl(nextUriLine, masterTargetUrl, referer);
        variants.push({
          url: resolved.targetUrl,
          referer: resolved.referer,
          bandwidth,
          height,
          audioGroup: attrs.AUDIO,
        });
      }
    }
  }

  if (variants.length === 0) {
    return { videoUrl: masterTargetUrl, videoReferer: referer };
  }

  // Prefer <= 1080p highest quality, else highest overall
  variants.sort((a, b) => {
    const aScore = a.height > 0 && a.height <= 1080 ? a.height * 100000 + a.bandwidth : a.bandwidth;
    const bScore = b.height > 0 && b.height <= 1080 ? b.height * 100000 + b.bandwidth : b.bandwidth;
    return bScore - aScore;
  });

  const chosen = variants[0];
  let matchedAudio: { url: string; referer: string } | undefined;
  if (chosen.audioGroup && audioTracks.length > 0) {
    const groupTracks = audioTracks.filter((a) => a.groupId === chosen.audioGroup);
    const preferredAudio = groupTracks.find((a) => a.isDefault) || groupTracks[0];
    if (preferredAudio) {
      matchedAudio = { url: preferredAudio.url, referer: preferredAudio.referer };
    }
  }

  return {
    videoUrl: chosen.url,
    videoReferer: chosen.referer,
    audioUrl: matchedAudio?.url,
    audioReferer: matchedAudio?.referer,
  };
}

interface ParsedMediaPlaylist {
  rewrittenPlaylist: string;
  keys: Array<{ chunkKey: string; targetUrl: string; referer: string }>;
  maps: Array<{ chunkKey: string; targetUrl: string; referer: string }>;
  segments: Array<{ chunkKey: string; targetUrl: string; referer: string }>;
}

function parseAndRewriteMediaPlaylist(
  playlistText: string,
  playlistTargetUrl: string,
  referer: string,
  prefix: 'v' | 'a'
): ParsedMediaPlaylist {
  const lines = playlistText.split(/\r?\n/);
  const keys: Array<{ chunkKey: string; targetUrl: string; referer: string }> = [];
  const maps: Array<{ chunkKey: string; targetUrl: string; referer: string }> = [];
  const segments: Array<{ chunkKey: string; targetUrl: string; referer: string }> = [];
  const outLines: string[] = [];

  const seenKeyUrls = new Map<string, string>();
  const seenMapUrls = new Map<string, string>();
  let hasEndList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === '#EXT-X-ENDLIST') {
      hasEndList = true;
      outLines.push(line);
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributesLine(line.slice('#EXT-X-KEY:'.length));
      const method = (attrs.METHOD || '').toUpperCase();
      const keyFormat = (attrs.KEYFORMAT || '').toLowerCase();
      if (
        method.includes('SAMPLE-AES') ||
        keyFormat.includes('widevine') ||
        keyFormat.includes('fairplay') ||
        keyFormat.includes('playready') ||
        keyFormat.includes('com.apple.fps') ||
        keyFormat.includes('urn:uuid:')
      ) {
        throw new Error(
          `This stream uses DRM encryption (${method || 'DRM'}) and cannot be saved offline.`
        );
      }

      if (method === 'NONE' || !attrs.URI) {
        outLines.push(line);
        continue;
      }

      const resolved = resolvePlaylistLineUrl(attrs.URI, playlistTargetUrl, referer);
      let chunkKey = seenKeyUrls.get(resolved.targetUrl);
      if (!chunkKey) {
        const idx = keys.length;
        chunkKey = `${prefix}_key_${idx}`;
        seenKeyUrls.set(resolved.targetUrl, chunkKey);
        keys.push({ chunkKey, targetUrl: resolved.targetUrl, referer: resolved.referer });
      }
      outLines.push(rewriteTagUri(line, `kuro-offline://chunk/${chunkKey}`));
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = parseAttributesLine(line.slice('#EXT-X-MAP:'.length));
      if (!attrs.URI) {
        outLines.push(line);
        continue;
      }
      const resolved = resolvePlaylistLineUrl(attrs.URI, playlistTargetUrl, referer);
      let chunkKey = seenMapUrls.get(resolved.targetUrl);
      if (!chunkKey) {
        const idx = maps.length;
        chunkKey = `${prefix}_map_${idx}`;
        seenMapUrls.set(resolved.targetUrl, chunkKey);
        maps.push({ chunkKey, targetUrl: resolved.targetUrl, referer: resolved.referer });
      }
      outLines.push(rewriteTagUri(line, `kuro-offline://chunk/${chunkKey}`));
      continue;
    }

    if (line.startsWith('#')) {
      outLines.push(line);
      continue;
    }

    // Media segment URI line
    const segIdx = segments.length;
    const chunkKey = `${prefix}_seg_${segIdx}`;
    const resolved = resolvePlaylistLineUrl(line, playlistTargetUrl, referer);
    segments.push({ chunkKey, targetUrl: resolved.targetUrl, referer: resolved.referer });
    outLines.push(`kuro-offline://chunk/${chunkKey}`);
  }

  if (!hasEndList) {
    outLines.push('#EXT-X-ENDLIST');
  }

  return {
    rewrittenPlaylist: outLines.join('\n'),
    keys,
    maps,
    segments,
  };
}

async function runHlsDownload(
  item: DownloadItem,
  signal: AbortSignal
): Promise<OfflineManifestRecord> {
  const initial = unwrapProxyUrl(item.streamUrl, item.referer || '');
  let mediaTargetUrl = initial.targetUrl;
  let mediaReferer = initial.referer;
  let audioTargetUrl: string | undefined;
  let audioReferer: string | undefined;

  let rootPlaylistText = await fetchTextViaProxy(mediaTargetUrl, mediaReferer, signal);

  if (rootPlaylistText.includes('#EXT-X-STREAM-INF')) {
    const selected = parseMasterPlaylist(rootPlaylistText, mediaTargetUrl, mediaReferer);
    mediaTargetUrl = selected.videoUrl;
    mediaReferer = selected.videoReferer;
    audioTargetUrl = selected.audioUrl;
    audioReferer = selected.audioReferer;
    rootPlaylistText = await fetchTextViaProxy(mediaTargetUrl, mediaReferer, signal);
  }

  const parsedVideo = parseAndRewriteMediaPlaylist(
    rootPlaylistText,
    mediaTargetUrl,
    mediaReferer,
    'v'
  );

  let parsedAudio: ParsedMediaPlaylist | null = null;
  if (audioTargetUrl) {
    const audioPlaylistText = await fetchTextViaProxy(
      audioTargetUrl,
      audioReferer || mediaReferer,
      signal
    );
    parsedAudio = parseAndRewriteMediaPlaylist(
      audioPlaylistText,
      audioTargetUrl,
      audioReferer || mediaReferer,
      'a'
    );
  }

  const allMetaTasks = [
    ...parsedVideo.keys.map((k) => ({ ...k, kind: 'key' as const })),
    ...parsedVideo.maps.map((m) => ({ ...m, kind: 'map' as const })),
    ...(parsedAudio ? parsedAudio.keys.map((k) => ({ ...k, kind: 'key' as const })) : []),
    ...(parsedAudio ? parsedAudio.maps.map((m) => ({ ...m, kind: 'map' as const })) : []),
  ];

  const allSegTasks = [
    ...parsedVideo.segments,
    ...(parsedAudio ? parsedAudio.segments : []),
  ];

  if (allSegTasks.length === 0) {
    throw new Error('HLS playlist contains zero downloadable media segments.');
  }

  const totalSegments = allSegTasks.length;

  // Download keys and init maps first
  for (const task of allMetaTasks) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const alreadySaved = await hasBinaryChunk(item.id, task.chunkKey);
    if (alreadySaved) continue;
    const fetched = await fetchBytesViaProxy(task.targetUrl, task.referer, signal);
    await saveBinaryChunk(item.id, task.chunkKey, fetched.bytes, fetched.mimeType);
  }

  let finalPlaylistText = parsedVideo.rewrittenPlaylist;
  if (parsedAudio) {
    const audioPlaylistBytes = new TextEncoder().encode(parsedAudio.rewrittenPlaylist);
    await saveBinaryChunk(
      item.id,
      'audio_playlist',
      audioPlaylistBytes,
      'application/vnd.apple.mpegurl'
    );
    finalPlaylistText = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="offline_aud",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="kuro-offline://chunk/audio_playlist"',
      '#EXT-X-STREAM-INF:BANDWIDTH=2000000,AUDIO="offline_aud"',
      'kuro-offline://chunk/video_playlist',
    ].join('\n');
    await saveBinaryChunk(
      item.id,
      'video_playlist',
      new TextEncoder().encode(parsedVideo.rewrittenPlaylist),
      'application/vnd.apple.mpegurl'
    );
  }

  let completedCount = 0;
  let downloadedBytes = Math.max(0, item.downloadedBytes || 0);
  let newlyFetchedBytes = 0;
  let newlyFetchedSegments = 0;
  const startWall = Date.now();
  let lastUiUpdate = 0;
  let nextIndex = 0;

  updateStoredItem(item.id, {
    format: 'hls',
    totalSegments,
    completedSegments: item.completedSegments || 0,
    mimeType: 'application/vnd.apple.mpegurl',
  });

  const emitProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastUiUpdate < 350) return;
    lastUiUpdate = now;

    const elapsedSec = Math.max(0.25, (now - startWall) / 1000);
    const speedBytesPerSec =
      newlyFetchedBytes > 0 ? Math.round(newlyFetchedBytes / elapsedSec) : 0;
    const avgSegBytes =
      newlyFetchedSegments > 0
        ? newlyFetchedBytes / newlyFetchedSegments
        : completedCount > 0 && downloadedBytes > 0
          ? downloadedBytes / completedCount
          : 0;
    const estimatedTotalBytes =
      avgSegBytes > 0
        ? Math.max(downloadedBytes, Math.round(avgSegBytes * totalSegments))
        : item.fileSize || downloadedBytes;
    const progress =
      completedCount >= totalSegments
        ? 99
        : Math.min(99, Math.round((completedCount / totalSegments) * 100));

    updateStoredItem(item.id, {
      completedSegments: completedCount,
      totalSegments,
      downloadedBytes,
      fileSize: estimatedTotalBytes,
      progress,
      speedBytesPerSec,
      status: 'downloading',
    });
  };

  const worker = async () => {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const idx = nextIndex++;
      if (idx >= totalSegments) break;

      const seg = allSegTasks[idx];
      const alreadyExists = await hasBinaryChunk(item.id, seg.chunkKey);
      if (alreadyExists) {
        completedCount += 1;
        emitProgress(false);
        continue;
      }

      const fetched = await fetchBytesViaProxy(seg.targetUrl, seg.referer, signal);
      await saveBinaryChunk(item.id, seg.chunkKey, fetched.bytes, fetched.mimeType);

      completedCount += 1;
      downloadedBytes += fetched.bytes.byteLength;
      newlyFetchedBytes += fetched.bytes.byteLength;
      newlyFetchedSegments += 1;
      emitProgress(false);
    }
  };

  const workerCount = Math.min(HLS_SEGMENT_CONCURRENCY, totalSegments);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const segmentKeys = allSegTasks.map((s) => s.chunkKey);
  const manifest: OfflineManifestRecord = {
    downloadId: item.id,
    format: 'hls',
    mimeType: 'application/vnd.apple.mpegurl',
    playlistText: finalPlaylistText,
    segmentKeys,
    totalBytes: downloadedBytes,
    updatedAt: Date.now(),
  };

  await saveOfflineManifest(manifest);
  return manifest;
}

function parseTotalFromContentRange(header: string | null): number {
  if (!header) return 0;
  const match = header.match(/bytes\s+\d+-\d+\/(\d+)/i);
  return match ? Number(match[1]) || 0 : 0;
}

async function runMp4Download(
  item: DownloadItem,
  signal: AbortSignal
): Promise<OfflineManifestRecord> {
  const { targetUrl, referer } = unwrapProxyUrl(item.streamUrl, item.referer || '');
  const isNative = Capacitor.isNativePlatform();
  const nativeFileName = `episode_${item.episodeNumber}.mp4`;

  // Resume offset check
  let existingBytes = 0;
  let existingChunkCount = 0;

  if (isNative) {
    existingBytes = await getNativeMp4FileSize(item.id, nativeFileName);
  } else {
    let idx = 0;
    while (idx < (item.mp4ChunkCount || 0)) {
      const ok = await hasBinaryChunk(item.id, `mp4_part_${idx}`);
      if (!ok) break;
      idx += 1;
    }
    existingChunkCount = idx;
    existingBytes = existingChunkCount * MP4_CHUNK_BYTES;
  }

  // Probe range 0..1023 (or 0..MP4_CHUNK_BYTES-1 cleanly!)
  const probeStart = existingBytes > 0 ? existingBytes : 0;
  const probeEnd = probeStart + MP4_CHUNK_BYTES - 1;

  const firstSlice = await fetchBytesViaProxy(targetUrl, referer, signal, {
    Range: `bytes=${probeStart}-${probeEnd}`,
  });

  const mimeType =
    firstSlice.mimeType && !firstSlice.mimeType.includes('octet-stream')
      ? firstSlice.mimeType
      : 'video/mp4';

  const totalFromRange = parseTotalFromContentRange(firstSlice.contentRange);
  const supportsRange = firstSlice.status === 206 && totalFromRange > 0;

  if (supportsRange) {
    const totalSize = totalFromRange;
    let currentOffset = probeStart;
    let currentChunkIndex = existingChunkCount;
    let nativeUri = item.fileUri || '';
    let nativePath = '';
    const startWall = Date.now();
    let lastUiUpdate = 0;

    // Persist first slice
    if (isNative) {
      const writeRes = await writeNativeMp4Chunk(
        item.id,
        nativeFileName,
        firstSlice.bytes,
        currentOffset > 0
      );
      nativeUri = writeRes.uri;
      nativePath = writeRes.path;
    } else {
      await saveBinaryChunk(
        item.id,
        `mp4_part_${currentChunkIndex}`,
        firstSlice.bytes,
        mimeType
      );
      currentChunkIndex += 1;
    }

    currentOffset += firstSlice.bytes.byteLength;
    let sessionFetchedBytes = firstSlice.bytes.byteLength;

    updateStoredItem(item.id, {
      format: 'mp4',
      mimeType,
      supportsRange: true,
      fileSize: totalSize,
      downloadedBytes: currentOffset,
      mp4ChunkCount: currentChunkIndex,
      progress: Math.min(99, Math.round((currentOffset / totalSize) * 100)),
    });

    while (currentOffset < totalSize) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const endByte = Math.min(totalSize - 1, currentOffset + MP4_CHUNK_BYTES - 1);
      const slice = await fetchBytesViaProxy(targetUrl, referer, signal, {
        Range: `bytes=${currentOffset}-${endByte}`,
      });

      if (isNative) {
        const writeRes = await writeNativeMp4Chunk(
          item.id,
          nativeFileName,
          slice.bytes,
          true
        );
        nativeUri = writeRes.uri;
        nativePath = writeRes.path;
      } else {
        await saveBinaryChunk(
          item.id,
          `mp4_part_${currentChunkIndex}`,
          slice.bytes,
          mimeType
        );
        currentChunkIndex += 1;
      }

      currentOffset += slice.bytes.byteLength;
      sessionFetchedBytes += slice.bytes.byteLength;

      const now = Date.now();
      if (now - lastUiUpdate >= 350 || currentOffset >= totalSize) {
        lastUiUpdate = now;
        const elapsedSec = Math.max(0.25, (now - startWall) / 1000);
        const speedBytesPerSec = Math.round(sessionFetchedBytes / elapsedSec);
        updateStoredItem(item.id, {
          downloadedBytes: currentOffset,
          fileSize: totalSize,
          mp4ChunkCount: currentChunkIndex,
          fileUri: nativeUri || undefined,
          progress: Math.min(99, Math.round((currentOffset / totalSize) * 100)),
          speedBytesPerSec,
          status: 'downloading',
        });
      }
    }

    const manifest: OfflineManifestRecord = {
      downloadId: item.id,
      format: 'mp4',
      mimeType,
      nativeMp4Path: nativePath || undefined,
      nativeMp4Uri: nativeUri || undefined,
      chunkCount: isNative ? undefined : currentChunkIndex,
      totalBytes: totalSize,
      updatedAt: Date.now(),
    };
    await saveOfflineManifest(manifest);
    return manifest;
  }

  // Non-range provider fallback: stream full file via ReadableStream in 1.5MB flushes
  const fullProxyUrl = buildProxyMediaUrl(targetUrl, referer, true);
  const fullRes = await authorizedApiFetch(fullProxyUrl, { signal, timeoutMs: 120000 });
  if (fullRes.status === 401 || fullRes.status === 403 || fullRes.status === 410) {
    throw new ExpiredStreamUrlError(fullRes.status, `Download URL expired (HTTP ${fullRes.status}).`);
  }
  if (!fullRes.ok) {
    throw new Error(`MP4 download failed with HTTP ${fullRes.status}.`);
  }
  const ct = (fullRes.headers.get('content-type') || mimeType).toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) {
    throw new Error('Upstream server returned HTML instead of an MP4 file.');
  }

  const totalBytesHeader = Number(fullRes.headers.get('content-length') || 0);
  const reader = fullRes.body?.getReader();
  if (!reader) {
    throw new Error('MP4 response stream could not be read.');
  }

  const bufferParts: Uint8Array[] = [];
  let bufferedLen = 0;
  let totalReceived = 0;
  let chunkIndex = 0;
  let nativeUri = '';
  let nativePath = '';
  const startWall = Date.now();
  let lastUiUpdate = 0;

  const flushBuffer = async () => {
    if (bufferedLen === 0) return;
    const merged = new Uint8Array(bufferedLen);
    let offset = 0;
    for (const part of bufferParts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }
    bufferParts.length = 0;
    bufferedLen = 0;

    if (chunkIndex === 0 && merged.byteLength >= 15) {
      const head = new TextDecoder().decode(merged.subarray(0, 64)).trimStart().toLowerCase();
      if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
        throw new Error('Upstream server returned HTML instead of video bytes.');
      }
    }

    if (isNative) {
      const writeRes = await writeNativeMp4Chunk(
        item.id,
        nativeFileName,
        merged,
        chunkIndex > 0
      );
      nativeUri = writeRes.uri;
      nativePath = writeRes.path;
    } else {
      await saveBinaryChunk(item.id, `mp4_part_${chunkIndex}`, merged, ct);
    }
    chunkIndex += 1;
  };

  while (true) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      bufferParts.push(value);
      bufferedLen += value.byteLength;
      totalReceived += value.byteLength;

      if (bufferedLen >= MP4_CHUNK_BYTES) {
        await flushBuffer();
      }

      const now = Date.now();
      if (now - lastUiUpdate >= 350) {
        lastUiUpdate = now;
        const elapsedSec = Math.max(0.25, (now - startWall) / 1000);
        const speedBytesPerSec = Math.round(totalReceived / elapsedSec);
        const progress =
          totalBytesHeader > 0
            ? Math.min(99, Math.round((totalReceived / totalBytesHeader) * 100))
            : Math.min(95, Math.round(totalReceived / 120000));
        updateStoredItem(item.id, {
          downloadedBytes: totalReceived,
          fileSize: totalBytesHeader || totalReceived,
          mp4ChunkCount: chunkIndex,
          progress,
          speedBytesPerSec,
          status: 'downloading',
        });
      }
    }
  }

  await flushBuffer();
  if (totalReceived === 0) {
    throw new Error('MP4 download returned 0 bytes.');
  }

  const manifest: OfflineManifestRecord = {
    downloadId: item.id,
    format: 'mp4',
    mimeType: ct,
    nativeMp4Path: nativePath || undefined,
    nativeMp4Uri: nativeUri || undefined,
    chunkCount: isNative ? undefined : chunkIndex,
    totalBytes: totalReceived,
    updatedAt: Date.now(),
  };
  await saveOfflineManifest(manifest);
  return manifest;
}

async function refreshExpiredItemStreamUrl(item: DownloadItem): Promise<DownloadItem | null> {
  const ctx = item.refreshContext;
  if (!ctx) return null;

  if (ctx.kind === 'animeworld') {
    const awRes = await resolveAnimeWorldStreamForAnime({
      title: ctx.title,
      romajiTitle: ctx.romajiTitle,
      format: ctx.format,
      seasonYear: ctx.seasonYear,
      episodeNumber: ctx.episodeNumber || item.episodeNumber,
      preferHindi: ctx.audioMode === 'hindi',
      preferLang: ctx.audioMode,
    });
    if (!awRes.data) return null;
    const sel = selectDownloadableSource(awRes.data);
    if (!sel.ok) return null;
    return updateStoredItem(item.id, {
      streamUrl: sel.candidate.url,
      format: sel.candidate.format,
      quality: sel.candidate.quality,
      referer: sel.candidate.referer || item.referer,
    });
  }

  const streamRes = await fetchEpisodeStream(ctx.episodeId || item.episodeId, {
    server: ctx.server || item.serverName || 'vidstreaming',
    category: ctx.audioMode || item.audioMode,
    anilistId: ctx.anilistId || item.animeId,
    malId: ctx.malId,
    episodeNumber: ctx.episodeNumber || item.episodeNumber,
  });
  if (!streamRes.data) return null;
  const sel = selectDownloadableSource(streamRes.data);
  if (!sel.ok) return null;
  return updateStoredItem(item.id, {
    streamUrl: sel.candidate.url,
    format: sel.candidate.format,
    quality: sel.candidate.quality,
    referer: sel.candidate.referer || item.referer,
  });
}

function pumpDownloadQueue(): void {
  while (activeRunningIds.size < MAX_CONCURRENT_DOWNLOADS && pendingQueueIds.length > 0) {
    const nextId = pendingQueueIds.shift();
    if (!nextId) break;
    if (activeRunningIds.has(nextId)) continue;
    const item = getDownloadById(nextId);
    if (!item || item.status === 'completed' || item.status === 'paused') continue;
    void executeDownloadTask(nextId);
  }
}

async function executeDownloadTask(downloadId: string): Promise<void> {
  const initialItem = getDownloadById(downloadId);
  if (!initialItem) return;

  activeRunningIds.add(downloadId);
  const controller = new AbortController();
  activeAbortControllers.set(downloadId, controller);

  let workingItem =
    updateStoredItem(downloadId, {
      status: 'downloading',
      errorMessage: undefined,
      speedBytesPerSec: 0,
    }) || initialItem;

  try {
    let manifest: OfflineManifestRecord | null = null;
    let refreshedOnce = false;

    while (!manifest) {
      try {
        if (workingItem.format === 'hls') {
          manifest = await runHlsDownload(workingItem, controller.signal);
        } else {
          manifest = await runMp4Download(workingItem, controller.signal);
        }
      } catch (err) {
        if (
          err instanceof ExpiredStreamUrlError &&
          !refreshedOnce &&
          workingItem.refreshContext
        ) {
          refreshedOnce = true;
          const refreshed = await refreshExpiredItemStreamUrl(workingItem);
          if (refreshed) {
            workingItem = refreshed;
            continue;
          }
        }
        throw err;
      }
    }

    updateStoredItem(downloadId, {
      status: 'completed',
      progress: 100,
      speedBytesPerSec: 0,
      downloadedBytes: manifest.totalBytes,
      fileSize: manifest.totalBytes,
      fileUri: manifest.nativeMp4Uri || `offline://${downloadId}`,
      completedAt: Date.now(),
      errorMessage: undefined,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError' || controller.signal.aborted) {
      return;
    }
    const msg = err instanceof Error ? err.message : 'Download failed.';
    updateStoredItem(downloadId, {
      status: 'error',
      errorMessage: msg,
      speedBytesPerSec: 0,
    });
  } finally {
    activeAbortControllers.delete(downloadId);
    activeRunningIds.delete(downloadId);
    pumpDownloadQueue();
  }
}

export async function startDownloadEpisode(
  input: NewDownloadInput,
  onUpdate?: (updated: DownloadItem) => void
): Promise<DownloadItem> {
  const downloadId = input.id;
  if (onUpdate) {
    downloadUpdateListeners.set(downloadId, onUpdate);
  }

  const all = getStoredDownloads();
  const existingIdx = all.findIndex((d) => d.id === downloadId);

  const existing = existingIdx >= 0 ? all[existingIdx] : undefined;
  const detectedFormat = input.format || inferFormatFromUrl(input.streamUrl);

  // If already completed with valid offline storage, keep it
  if (existing && existing.status === 'completed') {
    const manifest = await getOfflineManifest(downloadId);
    if (manifest) {
      onUpdate?.(existing);
      return existing;
    }
  }

  const willQueue =
    activeRunningIds.size >= MAX_CONCURRENT_DOWNLOADS && !activeRunningIds.has(downloadId);

  const nextItem: DownloadItem = {
    ...input,
    format: detectedFormat,
    fileSize: input.fileSize ?? existing?.fileSize ?? 0,
    downloadedBytes:
      existing && existing.streamUrl === input.streamUrl ? existing.downloadedBytes : 0,
    progress: existing && existing.streamUrl === input.streamUrl ? existing.progress : 0,
    speedBytesPerSec: 0,
    status: willQueue ? 'queued' : 'downloading',
    errorMessage: undefined,
    completedSegments:
      existing && existing.streamUrl === input.streamUrl ? existing.completedSegments : 0,
    totalSegments:
      existing && existing.streamUrl === input.streamUrl ? existing.totalSegments : undefined,
    mp4ChunkCount:
      existing && existing.streamUrl === input.streamUrl ? existing.mp4ChunkCount : 0,
    createdAt: existing?.createdAt || Date.now(),
  };

  if (existingIdx >= 0) {
    all[existingIdx] = nextItem;
  } else {
    all.unshift(nextItem);
  }
  saveStoredDownloads(all);
  onUpdate?.(nextItem);

  if (!activeRunningIds.has(downloadId) && !pendingQueueIds.includes(downloadId)) {
    pendingQueueIds.push(downloadId);
    pumpDownloadQueue();
  }

  return nextItem;
}

export function pauseDownload(downloadId: string): void {
  const qIdx = pendingQueueIds.indexOf(downloadId);
  if (qIdx >= 0) pendingQueueIds.splice(qIdx, 1);

  const controller = activeAbortControllers.get(downloadId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(downloadId);
  }
  activeRunningIds.delete(downloadId);

  updateStoredItem(downloadId, (prev) => ({
    status: prev.status === 'completed' ? 'completed' : 'paused',
    speedBytesPerSec: 0,
  }));
  pumpDownloadQueue();
}

export function resumeDownload(downloadId: string): void {
  const item = getDownloadById(downloadId);
  if (!item || item.status === 'completed') return;
  if (activeRunningIds.has(downloadId) || pendingQueueIds.includes(downloadId)) return;

  const willQueue = activeRunningIds.size >= MAX_CONCURRENT_DOWNLOADS;
  updateStoredItem(downloadId, {
    status: willQueue ? 'queued' : 'downloading',
    errorMessage: undefined,
    speedBytesPerSec: 0,
  });

  pendingQueueIds.push(downloadId);
  pumpDownloadQueue();
}

export async function retryDownload(downloadId: string): Promise<void> {
  const item = getDownloadById(downloadId);
  if (!item) return;

  if (item.refreshContext) {
    const refreshed = await refreshExpiredItemStreamUrl(item).catch(() => null);
    if (refreshed) {
      resumeDownload(downloadId);
      return;
    }
  }
  resumeDownload(downloadId);
}

export async function cancelOrDeleteDownload(downloadId: string): Promise<void> {
  const qIdx = pendingQueueIds.indexOf(downloadId);
  if (qIdx >= 0) pendingQueueIds.splice(qIdx, 1);

  const controller = activeAbortControllers.get(downloadId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(downloadId);
  }
  activeRunningIds.delete(downloadId);
  downloadUpdateListeners.delete(downloadId);

  const all = getStoredDownloads();
  const target = all.find((d) => d.id === downloadId);
  const next = all.filter((d) => d.id !== downloadId);
  saveStoredDownloads(next);

  await deleteDownloadStorage(downloadId, target?.fileUri);
  pumpDownloadQueue();
}

export async function getOfflinePlaybackHandle(
  item: DownloadItem
): Promise<OfflinePlaybackHandle> {
  const manifest = await getOfflineManifest(item.id);
  if (!manifest) {
    throw new Error(
      'Offline media manifest was not found. Please delete and re-download this episode.'
    );
  }

  if (manifest.format === 'hls') {
    if (!manifest.playlistText) {
      throw new Error('Offline HLS playlist is missing.');
    }
    const firstKey = manifest.segmentKeys?.[0];
    if (firstKey) {
      const ok = await hasBinaryChunk(item.id, firstKey);
      if (!ok) {
        throw new Error('Offline video segments are missing from local storage.');
      }
    }
    return {
      mode: 'hls',
      manifest,
    };
  }

  // MP4
  if (Capacitor.isNativePlatform()) {
    const uri = manifest.nativeMp4Uri || item.fileUri;
    if (!uri || uri.startsWith('offline://')) {
      throw new Error('Native MP4 file URI is missing on this device.');
    }
    return {
      mode: 'mp4',
      url: Capacitor.convertFileSrc(uri),
      mimeType: manifest.mimeType || 'video/mp4',
    };
  }

  const chunkCount = manifest.chunkCount || item.mp4ChunkCount || 0;
  if (chunkCount <= 0) {
    throw new Error('No offline MP4 video chunks found in browser storage.');
  }
  const blobUrl = await assembleWebMp4BlobUrl(
    item.id,
    chunkCount,
    manifest.mimeType || 'video/mp4'
  );
  if (!blobUrl) {
    throw new Error('Stored offline video chunks are incomplete. Please re-download.');
  }
  return {
    mode: 'mp4',
    url: blobUrl,
    mimeType: manifest.mimeType || 'video/mp4',
    revoke: () => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // ignore
      }
    },
  };
}
