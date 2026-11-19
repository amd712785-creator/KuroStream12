import { resolveApiUrl } from '@/src/config/env';
import { parseWatchResponse } from '@/src/services/streamingApi';
import {
  extractErrorDetails,
  extractErrorMessage,
  isPlayableStreamUrl,
  parseSafeJsonResponse,
} from '@/src/utils/errorUtils';
import type {
  AnimeWorldEpisode,
  AnimeWorldItem,
  AnimeWorldSeason,
  AnimeWorldStreamResponse,
  MediaFormat,
  ParsedStreamResult,
  StreamFetchError,
  StreamSource,
} from '@/src/types/anime';

const AW_BASE = '/api/anime-world-india/v1';

export interface AnimeWorldHomeResponse {
  success: boolean;
  source: string;
  latest_series: AnimeWorldItem[];
  latest_movies: AnimeWorldItem[];
  error?: string;
}

export interface AnimeWorldSeriesListResponse {
  success: boolean;
  source: string;
  current_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  pages: number[];
  total_results: number;
  series: AnimeWorldItem[];
  error?: string;
}

export interface AnimeWorldSearchResponse {
  success: boolean;
  query: string;
  currentPage: number;
  source: string;
  results: AnimeWorldItem[];
  error?: string;
}

export interface AnimeWorldSeasonsResponse {
  success: boolean;
  source: string;
  series: {
    seriesId: string;
    title: string;
    poster: string | null;
    year: string | null;
    totalSeasons: string;
    languages: string[];
    description: string | null;
  };
  seasons: AnimeWorldSeason[];
  error?: string;
}

export interface AnimeWorldEpisodesResponse {
  success: boolean;
  source: string;
  season: {
    seasonId: string;
    animeTitle: string;
    seasonName: string;
    totalEpisodes: string;
  };
  episodes: AnimeWorldEpisode[];
  error?: string;
}

export async function fetchAnimeWorldHome(): Promise<AnimeWorldHomeResponse> {
  const endpoint = `${AW_BASE}/home.php`;
  const res = await fetch(resolveApiUrl(endpoint), { headers: { Accept: 'application/json' } });
  const parsed = await parseSafeJsonResponse<AnimeWorldHomeResponse>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(
      extractErrorMessage(
        parsed.data || parsed.rawText,
        `AnimeWorld India homepage returned HTTP ${parsed.status}`
      )
    );
  }
  return parsed.data;
}

export async function fetchAnimeWorldSeries(page = 1): Promise<AnimeWorldSeriesListResponse> {
  const endpoint = `${AW_BASE}/series.php?p=${encodeURIComponent(String(page))}`;
  const res = await fetch(resolveApiUrl(endpoint), { headers: { Accept: 'application/json' } });
  const parsed = await parseSafeJsonResponse<AnimeWorldSeriesListResponse>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(
      extractErrorMessage(
        parsed.data || parsed.rawText,
        `AnimeWorld India series list returned HTTP ${parsed.status}`
      )
    );
  }
  return parsed.data;
}

export async function searchAnimeWorld(query: string, page = 1): Promise<AnimeWorldSearchResponse> {
  const endpoint = `${AW_BASE}/search.php?query=${encodeURIComponent(query)}&p=${encodeURIComponent(String(page))}`;
  const res = await fetch(resolveApiUrl(endpoint), { headers: { Accept: 'application/json' } });
  const parsed = await parseSafeJsonResponse<AnimeWorldSearchResponse>(res);
  if (!parsed.ok || !parsed.data) {
    const details = extractErrorDetails(
      parsed.data || parsed.rawText,
      endpoint,
      parsed.status,
      `AnimeWorld India search returned HTTP ${parsed.status}`
    );
    const err = new Error(details.message) as Error & {
      statusCode?: number;
      detail?: string;
      response?: { status: number; data: unknown };
    };
    err.statusCode = details.statusCode || parsed.status || 502;
    err.detail = details.detail;
    err.response = { status: parsed.status, data: parsed.data || parsed.rawText };
    throw err;
  }
  return parsed.data;
}

export async function fetchAnimeWorldSeasons(
  seriesID: string
): Promise<{ status: number; data: AnimeWorldSeasonsResponse | null; rawText?: string; endpointUrl: string }> {
  const endpointUrl = `${AW_BASE}/seasons.php?seriesID=${encodeURIComponent(seriesID)}`;
  const res = await fetch(resolveApiUrl(endpointUrl), { headers: { Accept: 'application/json' } });
  const parsed = await parseSafeJsonResponse<AnimeWorldSeasonsResponse>(res);
  return { status: parsed.status, data: parsed.data, rawText: parsed.rawText, endpointUrl };
}

export async function fetchAnimeWorldEpisodes(
  seasonId: string
): Promise<{ status: number; data: AnimeWorldEpisodesResponse | null; rawText?: string; endpointUrl: string }> {
  const endpointUrl = `${AW_BASE}/episodes.php?seasonId=${encodeURIComponent(seasonId)}`;
  const res = await fetch(resolveApiUrl(endpointUrl), { headers: { Accept: 'application/json' } });
  const parsed = await parseSafeJsonResponse<AnimeWorldEpisodesResponse>(res);
  return { status: parsed.status, data: parsed.data, rawText: parsed.rawText, endpointUrl };
}

export async function fetchAnimeWorldStream(params: {
  episodeId?: string;
  movieId?: string;
}): Promise<{ status: number; data: AnimeWorldStreamResponse | null; rawText?: string; endpointUrl: string }> {
  const qs = params.episodeId
    ? `episodeId=${encodeURIComponent(params.episodeId)}`
    : `movieId=${encodeURIComponent(params.movieId || '')}`;
  const endpointUrl = `${AW_BASE}/stream.php?${qs}`;
  const res = await fetch(resolveApiUrl(endpointUrl), { headers: { Accept: 'application/json' } });
  const parsed = await parseSafeJsonResponse<AnimeWorldStreamResponse>(res);
  return { status: parsed.status, data: parsed.data, rawText: parsed.rawText, endpointUrl };
}

function normalizeText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/shippuuden/g, 'shippuden')
    .replace(/shin[\s-]*chan/g, 'shinchan')
    .replace(/kimetsu no yaiba/g, 'demon slayer')
    .replace(/shingeki no kyojin/g, 'attack on titan')
    .replace(/boku no hero academia/g, 'my hero academia')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSeasonSuffix(raw: string): string {
  return raw
    .replace(/:\s*(the\s+)?final\s+season.*$/i, '')
    .replace(/\s*[-–:]\s*season\s*\d+.*$/i, '')
    .replace(/\s+season\s*\d+.*$/i, '')
    .replace(/\s+\d+(?:st|nd|rd|th)\s+season.*$/i, '')
    .replace(/\s+part\s*\d+.*$/i, '')
    .replace(/:\s*(entertainment district|swordsmith village|hashira training|mugen train|shibuya incident|hidden inventory).*$/i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTargetSeasonNumber(titles: Array<string | null | undefined>): number {
  const combined = titles.filter(Boolean).join(' ');
  const sMatch =
    combined.match(/season\s*(\d+)/i) ||
    combined.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
  if (sMatch) return Number(sMatch[1]);

  if (/entertainment district/i.test(combined)) return 2;
  if (/swordsmith village/i.test(combined)) return 3;
  if (/hashira training/i.test(combined)) return 4;
  if (/final season/i.test(combined)) return 4;

  return 1;
}

function buildSearchQueries(
  englishTitle?: string | null,
  romajiTitle?: string | null
): string[] {
  const candidates: string[] = [];
  const add = (q?: string | null) => {
    if (!q) return;
    const clean = q
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/shippuuden/gi, 'Shippuden')
      .trim();
    if (clean.length >= 2 && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  if (englishTitle) {
    add(stripSeasonSuffix(englishTitle));
    add(englishTitle);
    const colonHead = englishTitle.split(':')[0]?.trim();
    if (colonHead && colonHead.length >= 3) add(colonHead);
  }

  if (romajiTitle) {
    add(stripSeasonSuffix(romajiTitle));
    add(romajiTitle);
    const colonHead = romajiTitle.split(':')[0]?.trim();
    if (colonHead && colonHead.length >= 3) add(colonHead);
  }

  // Friendly fallback for hyphenated titles like "Crayon Shin-chan"
  for (const existing of [...candidates]) {
    if (existing.toLowerCase().includes('shin-chan')) add('Shinchan');
  }

  return candidates.slice(0, 4);
}

function scoreSearchItem(
  item: AnimeWorldItem,
  targetTitles: string[],
  isMovie: boolean,
  seasonYear?: number | null
): number {
  const itemNorm = normalizeText(item.title);
  if (!itemNorm) return 0;

  let bestTitleScore = 0;
  for (const rawTarget of targetTitles) {
    const targetNorm = normalizeText(rawTarget);
    const strippedTargetNorm = normalizeText(stripSeasonSuffix(rawTarget));
    if (!targetNorm) continue;

    if (itemNorm === targetNorm || (strippedTargetNorm && itemNorm === strippedTargetNorm)) {
      bestTitleScore = Math.max(bestTitleScore, 100);
      continue;
    }

    if (
      itemNorm.includes(targetNorm) ||
      targetNorm.includes(itemNorm) ||
      (strippedTargetNorm &&
        (itemNorm.includes(strippedTargetNorm) || strippedTargetNorm.includes(itemNorm)))
    ) {
      bestTitleScore = Math.max(bestTitleScore, 65);
    }

    const base = strippedTargetNorm || targetNorm;
    const tTokens = base.split(' ').filter((t) => t.length > 1);
    const iTokens = new Set(itemNorm.split(' ').filter((t) => t.length > 1));
    if (tTokens.length > 0) {
      const matches = tTokens.filter((t) => iTokens.has(t)).length;
      const ratio = matches / Math.max(tTokens.length, iTokens.size);
      bestTitleScore = Math.max(bestTitleScore, Math.round(ratio * 70));
    }
  }

  if (bestTitleScore < 20) return bestTitleScore;

  let total = bestTitleScore;
  if (isMovie) {
    total += item.movieId ? 30 : -15;
  } else {
    total += item.seriesId ? 30 : -20;
  }

  if (seasonYear && item.year && item.year === String(seasonYear)) {
    total += 8;
  }

  return total;
}

function parseEpisodeRange(text: string): { start: number; end: number } | null {
  const rangeMatch = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!rangeMatch) return null;
  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return { start, end };
  }
  return null;
}

function parseEpisodeNumberFromItem(ep: AnimeWorldEpisode): number | null {
  const fromLabel = ep.episodeNumber?.match(/(\d+)/);
  if (fromLabel) return Number(fromLabel[1]);
  const fromId = ep.episodeId?.match(/\d+x(\d+)/i) || ep.episodeId?.match(/episode[-_]?(\d+)/i);
  if (fromId) return Number(fromId[1]);
  return null;
}

function selectBestSeason(
  seasons: AnimeWorldSeason[],
  targetSeasonNum: number,
  episodeNumber: number,
  preferHindi: boolean
): AnimeWorldSeason | undefined {
  if (seasons.length === 0) return undefined;

  // 1. Check if any season explicitly lists an episode range covering episodeNumber (e.g., "33-53 (21)")
  const rangeMatches = seasons.filter((s) => {
    const range = parseEpisodeRange(s.episodes || '');
    return range ? episodeNumber >= range.start && episodeNumber <= range.end : false;
  });

  if (rangeMatches.length > 0) {
    if (preferHindi) {
      const hindiMatch = rangeMatches.find((s) => !s.isSubOnly);
      if (hindiMatch) return hindiMatch;
    }
    return rangeMatches[0];
  }

  // 2. Otherwise match by seasonNumber
  const bySeasonNum = seasons.filter((s) => Number(s.seasonNumber) === targetSeasonNum);
  if (bySeasonNum.length > 0) {
    if (preferHindi) {
      const hindiMatch = bySeasonNum.find((s) => !s.isSubOnly);
      if (hindiMatch) return hindiMatch;
    }
    return bySeasonNum[0];
  }

  // 3. Fallback to first dubbed season or first season
  if (preferHindi) {
    const firstHindi = seasons.find((s) => !s.isSubOnly);
    if (firstHindi) return firstHindi;
  }
  return seasons[0];
}

function selectBestEpisode(
  episodes: AnimeWorldEpisode[],
  episodeNumber: number
): AnimeWorldEpisode | undefined {
  if (episodes.length === 0) return undefined;

  const exactMatch = episodes.find((ep) => parseEpisodeNumberFromItem(ep) === episodeNumber);
  if (exactMatch) return exactMatch;

  // When an AniList Season 2 entry restarts at Episode 1 while AnimeWorld uses cumulative numbers (e.g. ep 27..49),
  // map relative 1-based episode index if it fits cleanly within the season
  if (episodeNumber >= 1 && episodeNumber <= episodes.length) {
    const sorted = [...episodes].sort((a, b) => {
      const na = parseEpisodeNumberFromItem(a) ?? 0;
      const nb = parseEpisodeNumberFromItem(b) ?? 0;
      return na - nb;
    });
    return sorted[episodeNumber - 1];
  }

  return undefined;
}

export async function resolveAnimeWorldStreamForAnime(options: {
  title?: string | null;
  romajiTitle?: string | null;
  format?: MediaFormat | null;
  seasonYear?: number | null;
  episodeNumber: number;
  preferHindi?: boolean;
}): Promise<{ data?: ParsedStreamResult; error?: StreamFetchError }> {
  const { title, romajiTitle, format, seasonYear, episodeNumber, preferHindi = true } = options;
  const queries = buildSearchQueries(title, romajiTitle);
  const targetTitles = [title, romajiTitle].filter((t): t is string => Boolean(t && t.trim()));
  const isMovie = format === 'MOVIE';

  if (queries.length === 0) {
    return {
      error: {
        statusCode: 400,
        endpointUrl: `${AW_BASE}/search.php`,
        message: 'Anime title is missing; cannot query AnimeWorld India.',
      },
    };
  }

  let bestItem: AnimeWorldItem | null = null;
  let bestScore = 0;
  let lastSearchUrl = `${AW_BASE}/search.php?query=${encodeURIComponent(queries[0])}`;

  try {
    for (const q of queries) {
      lastSearchUrl = `${AW_BASE}/search.php?query=${encodeURIComponent(q)}`;
      const searchRes = await searchAnimeWorld(q, 1);
      for (const item of searchRes.results || []) {
        const s = scoreSearchItem(item, targetTitles, isMovie, seasonYear);
        if (s > bestScore) {
          bestScore = s;
          bestItem = item;
        }
      }
      if (bestScore >= 95) break;
    }
  } catch (err) {
    const extracted = extractErrorDetails(
      err,
      lastSearchUrl,
      undefined,
      'Unable to reach AnimeWorld India search API.'
    );
    const msg = extracted.message.toLowerCase().includes('animeworld')
      ? extracted.message
      : `AnimeWorld India search failed: ${extracted.message}`;
    return {
      error: {
        statusCode: extracted.statusCode || 502,
        endpointUrl: lastSearchUrl,
        message: msg,
        detail: extracted.detail,
      },
    };
  }

  if (!bestItem || bestScore < 25) {
    return {
      error: {
        statusCode: 404,
        endpointUrl: lastSearchUrl,
        message: `"${title || romajiTitle}" was not found on AnimeWorld India (HTTP 404). Switch to Vidstreaming or Megacloud for SUB/DUB playback.`,
      },
    };
  }

  let streamStatus = 404;
  let streamEndpoint = '';
  let streamPayload: AnimeWorldStreamResponse | null = null;
  let streamRawText = '';

  if (bestItem.movieId && (isMovie || !bestItem.seriesId)) {
    const res = await fetchAnimeWorldStream({ movieId: bestItem.movieId });
    streamStatus = res.status;
    streamEndpoint = res.endpointUrl;
    streamPayload = res.data;
    streamRawText = res.rawText || '';
  } else if (bestItem.seriesId) {
    const seasonsRes = await fetchAnimeWorldSeasons(bestItem.seriesId);
    if (seasonsRes.status >= 400 || !seasonsRes.data?.success || seasonsRes.data.seasons.length === 0) {
      return {
        error: extractErrorDetails(
          seasonsRes.data || seasonsRes.rawText,
          seasonsRes.endpointUrl,
          seasonsRes.status || 404,
          `AnimeWorld India seasons API returned HTTP ${seasonsRes.status || 404} for "${bestItem.title}".`
        ),
      };
    }

    const targetSeasonNum = extractTargetSeasonNumber([title, romajiTitle]);
    const matchedSeason = selectBestSeason(
      seasonsRes.data.seasons,
      targetSeasonNum,
      episodeNumber,
      preferHindi
    );

    if (!matchedSeason) {
      return {
        error: {
          statusCode: 404,
          endpointUrl: seasonsRes.endpointUrl,
          message: `No matching season found on AnimeWorld India for Episode ${episodeNumber}.`,
        },
      };
    }

    const episodesRes = await fetchAnimeWorldEpisodes(matchedSeason.seasonId);
    if (episodesRes.status >= 400 || !episodesRes.data?.success) {
      return {
        error: extractErrorDetails(
          episodesRes.data || episodesRes.rawText,
          episodesRes.endpointUrl,
          episodesRes.status || 404,
          `AnimeWorld India episodes API returned HTTP ${episodesRes.status || 404}.`
        ),
      };
    }

    const matchedEpisode = selectBestEpisode(episodesRes.data.episodes, episodeNumber);
    if (!matchedEpisode) {
      return {
        error: {
          statusCode: 404,
          endpointUrl: episodesRes.endpointUrl,
          message: `Episode ${episodeNumber} is not available on AnimeWorld India (HTTP 404). Try Vidstreaming or Megacloud below.`,
        },
      };
    }

    const res = await fetchAnimeWorldStream({ episodeId: matchedEpisode.episodeId });
    streamStatus = res.status;
    streamEndpoint = res.endpointUrl;
    streamPayload = res.data;
    streamRawText = res.rawText || '';
  } else {
    return {
      error: {
        statusCode: 404,
        endpointUrl: lastSearchUrl,
        message: 'AnimeWorld India returned no valid seriesId or movieId.',
      },
    };
  }

  if (streamStatus >= 400 || !streamPayload?.success) {
    return {
      error: extractErrorDetails(
        streamPayload || streamRawText,
        streamEndpoint,
        streamStatus || 404,
        `AnimeWorld India API returned HTTP ${streamStatus || 404}`
      ),
    };
  }

  const parsed = parseWatchResponse(streamPayload);

  // Ensure streams from AnimeWorld India have clean labels, valid URLs & embed classification
  const candidateSources: StreamSource[] =
    parsed.sources.length > 0
      ? parsed.sources
      : streamPayload.stream?.streamLink
        ? [
            {
              url: streamPayload.stream.streamLink,
              quality: streamPayload.hasHindiAudio
                ? 'AnimeWorld India · Hindi Audio'
                : 'AnimeWorld India · Stream',
              type: streamPayload.stream.type || 'embed',
              isM3U8: streamPayload.stream.type === 'hls',
              language: streamPayload.hasHindiAudio ? 'Hindi' : streamPayload.audioLanguages?.[0],
            },
          ]
        : [];

  const mappedSources = candidateSources.filter((src) => isPlayableStreamUrl(src.url));

  if (mappedSources.length === 0) {
    return {
      error: {
        statusCode: 404,
        endpointUrl: streamEndpoint,
        message: 'AnimeWorld India returned no playable streamLink for this episode.',
      },
    };
  }

  return {
    data: {
      ...parsed,
      sources: mappedSources,
      downloadUrl: streamPayload.stream?.file || parsed.downloadUrl,
      hasHindiAudio: Boolean(streamPayload.hasHindiAudio),
      audioLanguages: streamPayload.audioLanguages || parsed.audioLanguages || [],
      providerSource: streamPayload.source || streamEndpoint,
      servers: [
        { name: 'animeworld-india' },
        { name: 'vidstreaming' },
        { name: 'megacloud' },
        { name: 'streamsb' },
      ],
    },
  };
}
