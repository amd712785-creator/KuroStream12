import { getDefaultStreamingApiBase, getStreamingApiBase } from '@/src/config/env';
import { getDisplayTitle, slugifyTitle } from '@/src/services/anilistApi';
import { fetchAniZipMetadata } from '@/src/services/extensionsApi';
import type {
  AnimeDetail,
  AniZipResponse,
  EpisodeItem,
  ParsedStreamResult,
  SkipInterval,
  StreamFetchError,
  StreamServer,
  StreamSource,
  StreamSubtitle,
} from '@/src/types/anime';

export interface EpisodesFetchResult {
  episodes: EpisodeItem[];
  source: 'provider' | 'metadata-fallback';
  providerError?: StreamFetchError;
  aniZipMalId?: number | null;
}

function normalizeTrackUrl(raw: string): string {
  return raw.trim().replace(/^https:\/{3,}/i, 'https://').replace(/^http:\/{3,}/i, 'http://');
}

function classifyStreamType(
  url: string,
  explicitM3u8?: boolean,
  explicitType?: unknown
): 'hls' | 'mp4' | 'embed' {
  if (explicitType === 'embed') return 'embed';
  const lower = url.toLowerCase();
  if (explicitM3u8 || lower.includes('.m3u8')) return 'hls';
  if (/\.(mp4|webm)(\?|$)/i.test(lower)) return 'mp4';
  if (
    lower.includes('embed') ||
    lower.includes('iframe') ||
    lower.includes('/e/') ||
    lower.includes('abyssplayer') ||
    lower.includes('ravok') ||
    lower.includes('short.icu') ||
    lower.includes('megaplay') ||
    lower.includes('multi-lang-plyr') ||
    lower.includes('/video/')
  ) {
    return 'embed';
  }
  return 'hls';
}

/**
 * Flexibly parses real responses from streaming endpoints
 * without assuming a single rigid JSON shape.
 */
export function parseWatchResponse(payload: unknown): ParsedStreamResult {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const dataObj =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;

  const sources: StreamSource[] = [];
  const subtitles: StreamSubtitle[] = [];
  const servers: StreamServer[] = [];

  const rawSources = Array.isArray(dataObj.sources)
    ? dataObj.sources
    : Array.isArray(dataObj.streams)
      ? dataObj.streams
      : [];

  for (const item of rawSources) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const rawUrl =
      typeof s.url === 'string'
        ? s.url
        : typeof s.file === 'string'
          ? s.file
          : typeof s.streamLink === 'string'
            ? s.streamLink
            : '';
    const url = normalizeTrackUrl(rawUrl);
    if (!url) continue;
    const isM3U8 = Boolean(s.isM3U8 ?? s.hls ?? url.toLowerCase().includes('.m3u8'));
    const quality =
      typeof s.quality === 'string' && s.quality.trim()
        ? s.quality.trim()
        : typeof s.label === 'string' && s.label.trim()
          ? s.label.trim()
          : 'Auto';
    const language = typeof s.language === 'string' && s.language.trim() ? s.language.trim() : undefined;
    const type = classifyStreamType(url, isM3U8, s.type);
    sources.push({
      url,
      quality,
      isM3U8: type === 'hls',
      type,
      language,
    });
  }

  // Handle single direct URL or embed fields (including AnimeWorld stream.streamLink)
  const streamNested =
    dataObj.stream && typeof dataObj.stream === 'object'
      ? (dataObj.stream as Record<string, unknown>)
      : null;

  const directCandidates: Array<{ url: unknown; explicitType?: unknown }> = [
    { url: dataObj.source, explicitType: dataObj.type },
    { url: dataObj.stream, explicitType: dataObj.type },
    { url: streamNested?.streamLink, explicitType: streamNested?.type },
    { url: dataObj.url, explicitType: dataObj.type },
    { url: dataObj.embed, explicitType: 'embed' },
    { url: dataObj.iframe, explicitType: 'embed' },
    { url: dataObj.embedURL, explicitType: 'embed' },
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate.url === 'string' && candidate.url.trim().startsWith('http')) {
      const url = normalizeTrackUrl(candidate.url);
      const exists = sources.some((s) => s.url === url);
      if (!exists) {
        const type = classifyStreamType(url, candidate.explicitType === 'hls', candidate.explicitType);
        sources.push({
          url,
          quality: type === 'embed' ? 'Embed Player' : 'Default',
          isM3U8: type === 'hls',
          type,
        });
      }
    }
  }

  const rawSubs = Array.isArray(dataObj.subtitles)
    ? dataObj.subtitles
    : Array.isArray(dataObj.tracks)
      ? dataObj.tracks
      : [];

  for (const sub of rawSubs) {
    if (!sub || typeof sub !== 'object') continue;
    const t = sub as Record<string, unknown>;
    const rawUrl = typeof t.url === 'string' ? t.url : typeof t.file === 'string' ? t.file : '';
    if (!rawUrl) continue;
    const url = rawUrl.startsWith('/') ? rawUrl : normalizeTrackUrl(rawUrl);
    const lang =
      typeof t.lang === 'string'
        ? t.lang
        : typeof t.label === 'string'
          ? t.label
          : 'Subtitles';
    subtitles.push({
      url,
      lang,
      label: lang,
    });
  }

  const rawServers = Array.isArray(dataObj.servers) ? dataObj.servers : [];
  for (const srv of rawServers) {
    if (typeof srv === 'string') {
      servers.push({ name: srv });
    } else if (srv && typeof srv === 'object') {
      const obj = srv as Record<string, unknown>;
      const name =
        typeof obj.name === 'string'
          ? obj.name
          : typeof obj.serverName === 'string'
            ? obj.serverName
            : '';
      if (name) {
        servers.push({
          name,
          url: typeof obj.url === 'string' ? obj.url : undefined,
        });
      }
    }
  }

  const headers =
    dataObj.headers && typeof dataObj.headers === 'object'
      ? (dataObj.headers as Record<string, string>)
      : undefined;

  const downloadUrl =
    typeof dataObj.download === 'string'
      ? dataObj.download
      : typeof streamNested?.file === 'string'
        ? streamNested.file
        : undefined;

  const parseSkip = (raw: unknown): SkipInterval | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.start === 'number' && typeof obj.end === 'number' && obj.end > obj.start) {
      return {
        start: obj.start,
        end: obj.end,
        type: typeof obj.type === 'string' ? (obj.type as SkipInterval['type']) : undefined,
        source: obj.source === 'aniskip' ? 'aniskip' : 'provider',
      };
    }
    return undefined;
  };

  const intro = parseSkip(dataObj.intro);
  const outro = parseSkip(dataObj.outro);
  const recap = parseSkip(dataObj.recap);

  const audioLanguages = Array.isArray(dataObj.audioLanguages)
    ? (dataObj.audioLanguages.filter((x) => typeof x === 'string') as string[])
    : undefined;

  const hasHindiAudio =
    typeof dataObj.hasHindiAudio === 'boolean' ? dataObj.hasHindiAudio : undefined;

  return {
    sources,
    subtitles,
    servers,
    headers,
    downloadUrl,
    intro,
    outro,
    recap,
    hasHindiAudio,
    audioLanguages,
    providerSource:
      typeof dataObj.source === 'string' ? dataObj.source : undefined,
    rawResponse: payload,
  };
}

function buildMetadataEpisodes(
  anime?: AnimeDetail,
  aniZip?: AniZipResponse | null
): EpisodeItem[] {
  const baseSlug = anime
    ? slugifyTitle(anime.title.romaji || getDisplayTitle(anime.title)) || `anime-${anime.id}`
    : `anime-${aniZip?.anilistId || 'series'}`;

  const zipEpisodes = aniZip?.episodes || {};
  const zipNumbers = Object.keys(zipEpisodes)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0);
  const maxZipEpisode = zipNumbers.length > 0 ? Math.max(...zipNumbers) : 0;

  const releasedCount = anime?.nextAiringEpisode?.episode
    ? Math.max(1, anime.nextAiringEpisode.episode - 1)
    : anime?.episodes || anime?.streamingEpisodes?.length || maxZipEpisode || 0;

  const count = Math.min(
    Math.max(releasedCount, anime?.streamingEpisodes?.length || 0, maxZipEpisode),
    2000
  );
  if (count === 0) return [];

  const streamMap = new Map<
    number,
    { title?: string | null; thumbnail?: string | null; url?: string | null }
  >();
  if (anime?.streamingEpisodes?.length) {
    anime.streamingEpisodes.forEach((se, index) => {
      const match = se.title?.match(/Episode\s+(\d+)/i);
      const epNum = match ? parseInt(match[1], 10) : index + 1;
      streamMap.set(epNum, {
        title: se.title?.replace(/^Episode\s+\d+\s*[-–:]?\s*/i, '').trim() || se.title,
        thumbnail: se.thumbnail,
        url: se.url,
      });
    });
  }

  const list: EpisodeItem[] = [];
  for (let i = 1; i <= count; i++) {
    const meta = streamMap.get(i);
    const zipEp = zipEpisodes[String(i)];
    list.push({
      id: `${baseSlug}-episode-${i}`,
      dubId: `${baseSlug}-dub-episode-${i}`,
      number: i,
      title: zipEp?.title || meta?.title || `Episode ${i}`,
      description: zipEp?.overview,
      image: zipEp?.image || meta?.thumbnail || anime?.coverImage?.large || null,
      airDate: zipEp?.airDate || null,
      runtime: zipEp?.runtime ?? null,
      externalUrl: meta?.url || null,
      hasDub: true,
    });
  }
  return list;
}

function mergeEpisodesWithAniZip(
  episodes: EpisodeItem[],
  aniZip?: AniZipResponse | null
): EpisodeItem[] {
  if (!aniZip?.episodes) return episodes;
  return episodes.map((ep) => {
    const zipEp = aniZip.episodes[String(ep.number)];
    if (!zipEp) return ep;
    const isGenericTitle = /^Episode\s+\d+$/i.test(ep.title.trim());
    return {
      ...ep,
      title: isGenericTitle && zipEp.title ? zipEp.title : ep.title || zipEp.title,
      description: ep.description || zipEp.overview,
      image: ep.image || zipEp.image || null,
      airDate: ep.airDate || zipEp.airDate || null,
      runtime: ep.runtime ?? zipEp.runtime ?? null,
    };
  });
}

function getCustomBaseParam(): string | null {
  const current = getStreamingApiBase();
  const def = getDefaultStreamingApiBase();
  return current !== def ? current : null;
}

export async function fetchAnimeEpisodes(
  anilistId: number,
  anime?: AnimeDetail,
  category: 'sub' | 'dub' | 'hindi' = 'sub'
): Promise<EpisodesFetchResult> {
  const params = new URLSearchParams();
  if (category === 'dub' || category === 'hindi') params.set('dub', 'true');
  const customBase = getCustomBaseParam();
  if (customBase) params.set('base', customBase);

  const queryStr = params.toString();
  const endpointUrl = `/api/anime/info/${anilistId}${queryStr ? `?${queryStr}` : ''}`;

  const [infoRes, aniZip] = await Promise.all([
    fetch(endpointUrl, { headers: { Accept: 'application/json' } }).catch(() => null),
    fetchAniZipMetadata(anilistId),
  ]);

  const aniZipMalId = aniZip?.mappings?.malId ?? null;

  try {
    if (!infoRes || !infoRes.ok) {
      return {
        episodes: buildMetadataEpisodes(anime, aniZip),
        source: 'metadata-fallback',
        aniZipMalId,
        providerError: infoRes
          ? {
              statusCode: infoRes.status,
              endpointUrl,
              message: `Streaming info API returned HTTP ${infoRes.status}.`,
            }
          : {
              endpointUrl,
              message: 'Unable to reach streaming info endpoint.',
            },
      };
    }

    const json = (await infoRes.json()) as Record<string, unknown>;
    const rawEpisodes = Array.isArray(json.episodes) ? json.episodes : [];
    if (rawEpisodes.length === 0) {
      return {
        episodes: buildMetadataEpisodes(anime, aniZip),
        source: 'metadata-fallback',
        aniZipMalId,
        providerError: json.upstreamError as StreamFetchError | undefined,
      };
    }

    const parsed: EpisodeItem[] = rawEpisodes
      .map((ep, idx): EpisodeItem | null => {
        if (!ep || typeof ep !== 'object') return null;
        const item = ep as Record<string, unknown>;
        const id = typeof item.id === 'string' ? item.id : '';
        if (!id) return null;
        const number = typeof item.number === 'number' ? item.number : idx + 1;
        return {
          id,
          dubId: typeof item.dubId === 'string' ? item.dubId : undefined,
          number,
          title:
            typeof item.title === 'string' && item.title.trim()
              ? item.title
              : `Episode ${number}`,
          description: typeof item.description === 'string' ? item.description : undefined,
          image: typeof item.image === 'string' ? item.image : null,
          isFiller: Boolean(item.isFiller),
          hasDub: Boolean(item.dubId || item.hasDub || category === 'dub'),
        };
      })
      .filter((x): x is EpisodeItem => Boolean(x));

    return {
      episodes: mergeEpisodesWithAniZip(parsed, aniZip),
      source: 'provider',
      aniZipMalId,
    };
  } catch (err) {
    return {
      episodes: buildMetadataEpisodes(anime, aniZip),
      source: 'metadata-fallback',
      aniZipMalId,
      providerError: {
        endpointUrl,
        message: err instanceof Error ? err.message : 'Unable to reach streaming info endpoint.',
      },
    };
  }
}

export async function fetchEpisodeServers(episodeId: string): Promise<StreamServer[]> {
  if (!episodeId || episodeId === 'EPISODE_ID') return [];
  const params = new URLSearchParams();
  const customBase = getCustomBaseParam();
  if (customBase) params.set('base', customBase);
  const queryStr = params.toString();
  const endpointUrl = `/api/anime/servers/${encodeURIComponent(episodeId)}${
    queryStr ? `?${queryStr}` : ''
  }`;

  try {
    const res = await fetch(endpointUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => {
        if (typeof item === 'string') return { name: item };
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).name === 'string'
        ) {
          return {
            name: (item as Record<string, unknown>).name as string,
            url:
              typeof (item as Record<string, unknown>).url === 'string'
                ? ((item as Record<string, unknown>).url as string)
                : undefined,
          };
        }
        return null;
      })
      .filter((x): x is StreamServer => Boolean(x));
  } catch {
    return [];
  }
}

export async function fetchEpisodeStream(
  episodeId: string,
  options?: {
    server?: string;
    category?: 'sub' | 'dub' | 'hindi';
    anilistId?: number;
    malId?: number | null;
    episodeNumber?: number;
  }
): Promise<{ data?: ParsedStreamResult; error?: StreamFetchError }> {
  const cleanEpisodeId = (episodeId || '').trim();
  if (!cleanEpisodeId || cleanEpisodeId === 'EPISODE_ID') {
    return {
      error: {
        endpointUrl: '',
        message: 'No valid episode ID was selected for playback.',
      },
    };
  }

  const params = new URLSearchParams();
  if (options?.server) params.set('server', options.server);
  if (options?.category) params.set('category', options.category);
  if (options?.anilistId) params.set('anilistId', String(options.anilistId));
  if (options?.malId) params.set('malId', String(options.malId));
  if (options?.episodeNumber) params.set('ep', String(options.episodeNumber));
  const customBase = getCustomBaseParam();
  if (customBase) params.set('base', customBase);

  const queryStr = params.toString();
  const endpointUrl = `/api/anime/watch/${encodeURIComponent(cleanEpisodeId)}${
    queryStr ? `?${queryStr}` : ''
  }`;

  try {
    const response = await fetch(endpointUrl, {
      headers: { Accept: 'application/json' },
    });

    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      return {
        error: {
          statusCode: response.status,
          endpointUrl,
          message:
            (json && typeof json.message === 'string' && json.message) ||
            `Streaming server returned HTTP ${response.status}.`,
          detail: json ? JSON.stringify(json).slice(0, 300) : undefined,
        },
      };
    }

    const parsed = parseWatchResponse(json);

    if (parsed.sources.length === 0) {
      return {
        error: {
          endpointUrl,
          message:
            (json && typeof json.message === 'string' && json.message) ||
            'The streaming provider returned no playable stream sources for this episode.',
          detail: json ? JSON.stringify(json).slice(0, 300) : undefined,
        },
      };
    }

    return { data: parsed };
  } catch (err) {
    return {
      error: {
        endpointUrl,
        message:
          err instanceof Error
            ? `Failed to fetch episode stream: ${err.message}`
            : 'Network error while contacting streaming backend.',
      },
    };
  }
}
