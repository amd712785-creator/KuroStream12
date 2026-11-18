import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Languages,
  Package,
  Search,
  Server,
  X,
} from 'lucide-react';
import { ExtensionManager } from '@/src/components/ExtensionManager';
import { VideoPlayer } from '@/src/components/VideoPlayer';
import { useAuth } from '@/src/context/AuthContext';
import { getAnimeDetails, getDisplayTitle } from '@/src/services/anilistApi';
import { resolveAnimeWorldStreamForAnime } from '@/src/services/animeWorldApi';
import {
  fetchAniSkipTimestamps,
  fetchExtensionsCatalog,
  getEnabledExtensionIds,
} from '@/src/services/extensionsApi';
import { isHindiDubbedAnime } from '@/src/services/hindiAnime';
import {
  fetchAnimeEpisodes,
  fetchEpisodeServers,
  fetchEpisodeStream,
} from '@/src/services/streamingApi';
import type {
  AnimeDetail,
  AniSkipResponse,
  EpisodeItem,
  ExtensionRepoItem,
  ParsedStreamResult,
  StreamFetchError,
  StreamServer,
} from '@/src/types/anime';

const FALLBACK_SERVERS: StreamServer[] = [
  { name: 'animeworld-india' },
  { name: 'vidstreaming' },
  { name: 'megacloud' },
  { name: 'streamsb' },
];

function ensureAnimeWorldInServers(list: StreamServer[]): StreamServer[] {
  const seen = new Set<string>();
  const merged: StreamServer[] = [];
  if (!list.some((s) => s.name.toLowerCase() === 'animeworld-india')) {
    merged.push({ name: 'animeworld-india' });
    seen.add('animeworld-india');
  }
  for (const s of list) {
    const key = s.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(s);
    }
  }
  return merged;
}

export const WatchPage: React.FC = () => {
  const { id, episodeId } = useParams<{ id: string; episodeId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const animeId = Number(id);
  const decodedEpisodeId = episodeId ? decodeURIComponent(episodeId) : '';
  const epParam = Number(searchParams.get('ep') || 0);

  const {
    preferences,
    updatePreferences,
    isInWatchlist,
    toggleWatchlist,
    getHistoryForAnime,
    saveWatchProgress,
  } = useAuth();

  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [epFilter, setEpFilter] = useState('');
  const [aniZipMalId, setAniZipMalId] = useState<number | null>(null);
  const [aniSkipData, setAniSkipData] = useState<AniSkipResponse | null>(null);
  const [adaptedExtensions, setAdaptedExtensions] = useState<ExtensionRepoItem[]>([]);
  const [servers, setServers] = useState<StreamServer[]>(FALLBACK_SERVERS);
  const [selectedServer, setSelectedServer] = useState<string>(
    preferences.preferredAudio === 'hindi' ? 'animeworld-india' : 'vidstreaming'
  );
  const [audioMode, setAudioMode] = useState<'sub' | 'dub' | 'hindi'>(preferences.preferredAudio);
  const [autoNext, setAutoNext] = useState<boolean>(preferences.autoNext);

  const [streamData, setStreamData] = useState<ParsedStreamResult | null>(null);
  const [streamError, setStreamError] = useState<StreamFetchError | null>(null);
  const [loadingStream, setLoadingStream] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSourceManager, setShowSourceManager] = useState(false);

  // Load enabled compatible Aniyomi source adapters
  useEffect(() => {
    let active = true;
    const syncExtensions = async () => {
      try {
        const catalog = await fetchExtensionsCatalog();
        if (!active) return;
        const enabledIds = getEnabledExtensionIds();
        const enabledAdapted = catalog.extensions.filter(
          (ext) => ext.compatible && enabledIds.includes(ext.id)
        );
        setAdaptedExtensions(enabledAdapted);
      } catch {
        // ignore extension catalog errors during playback
      }
    };
    syncExtensions();
    window.addEventListener('kurostream:extensions-updated', syncExtensions);
    return () => {
      active = false;
      window.removeEventListener('kurostream:extensions-updated', syncExtensions);
    };
  }, []);

  // Load Anime Details + Episodes list (enriched via AniZip)
  useEffect(() => {
    if (!Number.isFinite(animeId) || animeId <= 0) return;
    let active = true;
    const loadMeta = async () => {
      try {
        const detail = await getAnimeDetails(animeId);
        if (!active) return;
        setAnime(detail);
        const epRes = await fetchAnimeEpisodes(animeId, detail, audioMode);
        if (!active) return;
        setEpisodes(epRes.episodes);
        if (epRes.aniZipMalId) setAniZipMalId(epRes.aniZipMalId);
      } catch {
        // handled gracefully in UI
      }
    };
    loadMeta();
    return () => {
      active = false;
    };
  }, [animeId, audioMode]);

  const currentEpisodeIndex = useMemo(() => {
    if (episodes.length === 0) return -1;
    const byId = episodes.findIndex(
      (ep) => ep.id === decodedEpisodeId || ep.dubId === decodedEpisodeId
    );
    if (byId >= 0) return byId;
    if (epParam > 0) {
      const byNum = episodes.findIndex((ep) => ep.number === epParam);
      if (byNum >= 0) return byNum;
    }
    return 0;
  }, [episodes, decodedEpisodeId, epParam]);

  const currentEpisode: EpisodeItem | undefined =
    currentEpisodeIndex >= 0 ? episodes[currentEpisodeIndex] : undefined;

  const resolvedEpNumber = useMemo(() => {
    if (currentEpisode?.number) return currentEpisode.number;
    if (epParam > 0) return epParam;
    const match = decodedEpisodeId.match(/(?:episode|ep)[-_]?(\d+)/i);
    return match ? Number(match[1]) : 1;
  }, [currentEpisode?.number, epParam, decodedEpisodeId]);

  const effectiveEpisodeId = useMemo(() => {
    if (audioMode === 'dub' && currentEpisode?.dubId) {
      return currentEpisode.dubId;
    }
    return currentEpisode?.id || decodedEpisodeId || '';
  }, [audioMode, currentEpisode, decodedEpisodeId]);

  const effectiveMalId = anime?.idMal || aniZipMalId || undefined;
  const malIdRef = useRef<number | null | undefined>(effectiveMalId);
  malIdRef.current = effectiveMalId;

  useEffect(() => {
    if (!effectiveMalId || resolvedEpNumber <= 0) {
      setAniSkipData(null);
      return;
    }
    let active = true;
    fetchAniSkipTimestamps(effectiveMalId, resolvedEpNumber).then((res) => {
      if (active) setAniSkipData(res);
    });
    return () => {
      active = false;
    };
  }, [effectiveMalId, resolvedEpNumber]);

  const episodeKey = `${animeId}:${effectiveEpisodeId || decodedEpisodeId}:${selectedServer}:${audioMode}`;

  const loadStream = useCallback(async () => {
    const epIdToUse = effectiveEpisodeId || decodedEpisodeId;
    if (!epIdToUse || epIdToUse === 'EPISODE_ID') return;

    const useAnimeWorld = selectedServer.toLowerCase() === 'animeworld-india';
    if (useAnimeWorld && !anime) {
      setLoadingStream(true);
      return;
    }

    setLoadingStream(true);
    setStreamError(null);

    if (useAnimeWorld && anime) {
      const awRes = await resolveAnimeWorldStreamForAnime({
        title: anime.title.english || anime.title.romaji,
        romajiTitle: anime.title.romaji,
        format: anime.format,
        seasonYear: anime.seasonYear,
        episodeNumber: resolvedEpNumber,
        preferHindi: audioMode === 'hindi',
      });

      setServers(FALLBACK_SERVERS);

      if (awRes.data) {
        setStreamData(awRes.data);
        setStreamError(null);
      } else {
        setStreamData(null);
        setStreamError(
          awRes.error || {
            statusCode: 404,
            endpointUrl: '/api/anime-world-india/v1/stream.php',
            message: 'AnimeWorld India returned no playable source for this episode.',
          }
        );
      }
      setLoadingStream(false);
      return;
    }

    const [streamRes, serverList] = await Promise.all([
      fetchEpisodeStream(epIdToUse, {
        server: selectedServer || 'vidstreaming',
        category: audioMode,
        anilistId: animeId,
        malId: malIdRef.current,
        episodeNumber: resolvedEpNumber,
      }),
      fetchEpisodeServers(epIdToUse),
    ]);

    if (serverList.length > 0) {
      setServers(ensureAnimeWorldInServers(serverList));
    } else if (streamRes.data?.servers?.length) {
      setServers(ensureAnimeWorldInServers(streamRes.data.servers));
    } else {
      setServers(FALLBACK_SERVERS);
    }

    if (streamRes.data) {
      setStreamData(streamRes.data);
      setStreamError(null);
    } else {
      setStreamData(null);
      setStreamError(
        streamRes.error || {
          endpointUrl: '',
          message: 'Unable to load stream.',
        }
      );
    }
    setLoadingStream(false);
  }, [
    effectiveEpisodeId,
    decodedEpisodeId,
    selectedServer,
    audioMode,
    animeId,
    anime,
    resolvedEpNumber,
  ]);

  const refreshStream = useCallback(async (): Promise<boolean> => {
    const epIdToUse = effectiveEpisodeId || decodedEpisodeId;
    if (!epIdToUse || epIdToUse === 'EPISODE_ID') return false;

    if (selectedServer.toLowerCase() === 'animeworld-india') {
      if (!anime) return false;
      const awRes = await resolveAnimeWorldStreamForAnime({
        title: anime.title.english || anime.title.romaji,
        romajiTitle: anime.title.romaji,
        format: anime.format,
        seasonYear: anime.seasonYear,
        episodeNumber: resolvedEpNumber,
        preferHindi: audioMode === 'hindi',
      });
      if (awRes.data) {
        setStreamData(awRes.data);
        setStreamError(null);
        return true;
      }
      return false;
    }

    const streamRes = await fetchEpisodeStream(epIdToUse, {
      server: selectedServer || 'vidstreaming',
      category: audioMode,
      anilistId: animeId,
      malId: malIdRef.current,
      episodeNumber: resolvedEpNumber,
    });
    if (streamRes.data) {
      setStreamData(streamRes.data);
      setStreamError(null);
      return true;
    }
    return false;
  }, [effectiveEpisodeId, decodedEpisodeId, selectedServer, audioMode, animeId, anime, resolvedEpNumber]);

  useEffect(() => {
    loadStream();
    window.scrollTo({ top: 0 });
  }, [loadStream]);

  // Save initial watch entry when episode opens
  useEffect(() => {
    if (!anime || !effectiveEpisodeId) return;
    const existing = getHistoryForAnime(anime.id);
    const sameEpisode = existing && existing.episodeNumber === resolvedEpNumber;

    saveWatchProgress({
      animeId: anime.id,
      title: getDisplayTitle(anime.title),
      coverImage: anime.coverImage?.large || anime.coverImage?.extraLarge || '',
      episodeId: effectiveEpisodeId,
      episodeNumber: resolvedEpNumber,
      episodeTitle: currentEpisode?.title,
      progressSeconds: sameEpisode ? existing.progressSeconds : 0,
      durationSeconds: sameEpisode ? existing.durationSeconds : 0,
      audioMode,
    });
  }, [anime?.id, effectiveEpisodeId, resolvedEpNumber, audioMode]);

  const prevEpisode = currentEpisodeIndex > 0 ? episodes[currentEpisodeIndex - 1] : undefined;
  const nextEpisode =
    currentEpisodeIndex >= 0 && currentEpisodeIndex < episodes.length - 1
      ? episodes[currentEpisodeIndex + 1]
      : undefined;

  const goToEpisode = useCallback(
    (ep: EpisodeItem) => {
      const targetId = audioMode === 'dub' && ep.dubId ? ep.dubId : ep.id;
      navigate(`/watch/${animeId}/${encodeURIComponent(targetId)}?ep=${ep.number}`);
    },
    [animeId, audioMode, navigate]
  );

  const filteredEpisodes = useMemo(() => {
    const q = epFilter.trim().toLowerCase();
    if (!q) return episodes;
    return episodes.filter(
      (ep) => String(ep.number).includes(q) || ep.title.toLowerCase().includes(q)
    );
  }, [episodes, epFilter]);

  const displayTitle = anime ? getDisplayTitle(anime.title) : 'Loading...';
  const epNumber = resolvedEpNumber;
  const epTitle = currentEpisode?.title || `Episode ${epNumber}`;
  const historyForAnime = getHistoryForAnime(animeId);
  const initialTime =
    historyForAnime && historyForAnime.episodeNumber === epNumber
      ? historyForAnime.progressSeconds
      : 0;

  const detectedLangsLower = useMemo(
    () => (streamData?.audioLanguages || []).map((l) => l.toLowerCase()),
    [streamData?.audioLanguages]
  );

  const isAnimeWorldSelected = selectedServer.toLowerCase() === 'animeworld-india';

  const hasEnglishAvailable = useMemo(() => {
    if (isAnimeWorldSelected && detectedLangsLower.length > 0) {
      return detectedLangsLower.some((l) => l.includes('english') || l === 'en');
    }
    return currentEpisode ? Boolean(currentEpisode.hasDub || currentEpisode.dubId) : false;
  }, [isAnimeWorldSelected, detectedLangsLower, currentEpisode]);

  const hasJapaneseAvailable = useMemo(() => {
    if (isAnimeWorldSelected && detectedLangsLower.length > 0) {
      return detectedLangsLower.some((l) => l.includes('japanese') || l === 'ja' || l === 'jpn');
    }
    return true;
  }, [isAnimeWorldSelected, detectedLangsLower]);

  const hasHindiAvailable = useMemo(() => {
    if (streamData?.hasHindiAudio) return true;
    if (anime && isHindiDubbedAnime(anime)) return true;
    if (isAnimeWorldSelected && streamData && streamData.hasHindiAudio === false) return false;
    return audioMode === 'hindi';
  }, [streamData, anime, isAnimeWorldSelected, audioMode]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/anime/${animeId}`}
          className="kuro-btn-glass inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="truncate max-w-[200px] sm:max-w-md">{displayTitle}</span>
        </Link>

        {anime && (
          <button
            type="button"
            onClick={() => toggleWatchlist(anime)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold ${
              isInWatchlist(anime.id) ? 'kuro-btn-active' : 'kuro-btn-glass'
            }`}
          >
            {isInWatchlist(anime.id) ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
            <span>{isInWatchlist(anime.id) ? 'Saved' : 'Watchlist'}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Primary Player Column */}
        <div className="space-y-4 sm:space-y-5 min-w-0">
          <VideoPlayer
            streamData={streamData}
            streamError={streamError}
            loading={loadingStream}
            episodeKey={episodeKey}
            episodeTitle={`${displayTitle} — Episode ${epNumber}`}
            initialTime={initialTime}
            autoNext={autoNext}
            hasNextEpisode={Boolean(nextEpisode)}
            audioMode={audioMode}
            servers={servers}
            selectedServer={selectedServer}
            onSelectServer={setSelectedServer}
            skipIntro={aniSkipData?.intro || streamData?.intro}
            skipOutro={aniSkipData?.outro || streamData?.outro}
            skipRecap={aniSkipData?.recap || streamData?.recap}
            onNextEpisode={nextEpisode ? () => goToEpisode(nextEpisode) : undefined}
            onPreviousEpisode={prevEpisode ? () => goToEpisode(prevEpisode) : undefined}
            onProgress={(progressSeconds, durationSeconds) => {
              if (!anime) return;
              saveWatchProgress({
                animeId: anime.id,
                title: displayTitle,
                coverImage: anime.coverImage?.large || anime.coverImage?.extraLarge || '',
                episodeId: effectiveEpisodeId,
                episodeNumber: epNumber,
                episodeTitle: epTitle,
                progressSeconds,
                durationSeconds,
                audioMode,
              });
            }}
            onRefreshStream={refreshStream}
            onRetry={loadStream}
          />

          {/* Episode Bar + Prev/Next + Auto Next */}
          <div className="kuro-glass flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-violet-300 tabular-nums">
                <span className="font-semibold">Episode {epNumber}</span>
                {currentEpisode?.airDate && (
                  <span className="text-slate-400">· Aired {currentEpisode.airDate}</span>
                )}
                {currentEpisode?.runtime && (
                  <span className="text-slate-400">· {currentEpisode.runtime}m</span>
                )}
                {aniSkipData?.found && (
                  <span className="text-emerald-400">· AniSkip Active</span>
                )}
                {streamData?.hasHindiAudio && (
                  <span className="text-emerald-400">· Hindi Audio Verified</span>
                )}
                {streamData && streamData.hasHindiAudio === false && audioMode === 'hindi' && (
                  <span className="text-amber-400">· Hindi Dub Not Available</span>
                )}
              </div>
              <h1 className="truncate text-base sm:text-lg font-bold text-white">{epTitle}</h1>
              {currentEpisode?.description && (
                <p className="line-clamp-2 text-xs text-slate-400 leading-relaxed">
                  {currentEpisode.description}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = !autoNext;
                  setAutoNext(next);
                  updatePreferences({ autoNext: next });
                }}
                className={`min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-semibold ${
                  autoNext ? 'kuro-btn-active' : 'kuro-btn-glass text-slate-300'
                }`}
              >
                Auto Next: {autoNext ? 'On' : 'Off'}
              </button>

              <button
                type="button"
                disabled={!prevEpisode}
                onClick={() => prevEpisode && goToEpisode(prevEpisode)}
                className="kuro-btn-glass inline-flex min-h-[40px] items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Prev</span>
              </button>

              <button
                type="button"
                disabled={!nextEpisode}
                onClick={() => nextEpisode && goToEpisode(nextEpisode)}
                className="kuro-btn-primary inline-flex min-h-[40px] items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Audio Language & Server Selector Card */}
          <div className="kuro-glass rounded-3xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Languages className="h-3.5 w-3.5 text-violet-400" />
                  <span>Audio Language:</span>
                </span>
                <div className="kuro-segment-track inline-flex flex-wrap rounded-xl p-1 gap-1">
                  {hasJapaneseAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setAudioMode('sub');
                        updatePreferences({ preferredAudio: 'sub' });
                        if (selectedServer.toLowerCase() === 'animeworld-india') {
                          setSelectedServer('vidstreaming');
                        }
                      }}
                      className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold ${
                        audioMode === 'sub' ? 'kuro-segment-active' : 'kuro-segment-idle'
                      }`}
                    >
                      Japanese (SUB)
                    </button>
                  )}

                  {hasEnglishAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setAudioMode('dub');
                        updatePreferences({ preferredAudio: 'dub' });
                        if (selectedServer.toLowerCase() === 'animeworld-india') {
                          setSelectedServer('vidstreaming');
                        }
                      }}
                      className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold ${
                        audioMode === 'dub' ? 'kuro-segment-active' : 'kuro-segment-idle'
                      }`}
                    >
                      English (DUB)
                    </button>
                  )}

                  {hasHindiAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setAudioMode('hindi');
                        updatePreferences({ preferredAudio: 'hindi' });
                        setSelectedServer('animeworld-india');
                      }}
                      className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold ${
                        audioMode === 'hindi' ? 'kuro-segment-amber' : 'kuro-segment-idle'
                      }`}
                    >
                      Hindi Dubbed
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowShortcuts((v) => !v)}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  showShortcuts ? 'kuro-btn-active' : 'kuro-btn-glass text-slate-300'
                }`}
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span>Shortcuts</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 mr-1">
                  <Server className="h-3.5 w-3.5 text-violet-400" />
                  <span>Servers:</span>
                </span>
                {(servers.length > 0 ? servers : FALLBACK_SERVERS).map((srv) => {
                  const isSelected =
                    (selectedServer || servers[0]?.name || 'vidstreaming').toLowerCase() ===
                    srv.name.toLowerCase();
                  return (
                    <button
                      key={srv.name}
                      type="button"
                      onClick={() => setSelectedServer(srv.name)}
                      className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-xs font-semibold capitalize ${
                        isSelected ? 'kuro-btn-active' : 'kuro-btn-glass text-slate-300'
                      }`}
                    >
                      {srv.name}
                    </button>
                  );
                })}

                {adaptedExtensions.map((ext) => {
                  const extServerKey = ext.name.toLowerCase();
                  const isSelected = selectedServer.toLowerCase() === extServerKey;
                  return (
                    <button
                      key={ext.id}
                      type="button"
                      onClick={() => setSelectedServer(extServerKey)}
                      title={ext.limitationReason}
                      className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-xs font-semibold ${
                        isSelected ? 'kuro-btn-active' : 'kuro-btn-glass text-slate-300'
                      }`}
                    >
                      {ext.name}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setShowSourceManager(true)}
                className="kuro-btn-glass inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-violet-200"
              >
                <Package className="h-3.5 w-3.5" />
                <span>Manage Sources</span>
              </button>
            </div>

            {showShortcuts && (
              <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-3 text-xs text-slate-400 sm:grid-cols-3">
                <p>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-slate-200">
                    Space / K
                  </kbd>{' '}
                  Play / Pause
                </p>
                <p>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-slate-200">
                    F
                  </kbd>{' '}
                  Fullscreen
                </p>
                <p>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-slate-200">
                    M
                  </kbd>{' '}
                  Mute / Unmute
                </p>
                <p>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-slate-200">
                    ← / →
                  </kbd>{' '}
                  Seek ±10s
                </p>
                <p>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-slate-200">
                    N / P
                  </kbd>{' '}
                  Next / Prev Ep
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Episode Selector Sidebar */}
        <aside className="kuro-glass rounded-3xl p-4 flex flex-col max-h-[680px]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white">Episodes</h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {episodes.length} total
            </span>
          </div>

          {episodes.length > 10 && (
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={epFilter}
                onChange={(e) => setEpFilter(e.target.value)}
                placeholder="Filter episode..."
                aria-label="Filter episodes"
                className="h-9 w-full rounded-xl border border-white/[0.1] bg-[#07080d]/85 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
            {episodes.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Loading episode directory...
              </p>
            ) : filteredEpisodes.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                No matching episodes.
              </p>
            ) : (
              filteredEpisodes.map((ep) => {
                const active = ep.number === epNumber;
                return (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => goToEpisode(ep)}
                    className={`flex w-full min-h-[50px] items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left ${
                      active ? 'kuro-btn-active' : 'kuro-btn-glass text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-violet-300 tabular-nums">
                        EP {ep.number}
                      </span>
                      <p className="truncate text-xs font-medium mt-0.5">{ep.title}</p>
                    </div>
                    {active && (
                      <span className="text-[11px] font-semibold text-violet-200 shrink-0">
                        Playing
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {showSourceManager && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Anime Source & Extension Manager"
        >
          <div className="kuro-glass-elevated flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-white">Anime Sources &amp; Extensions</h2>
                <p className="text-xs text-slate-400">
                  Manage Aniyomi &amp; Tachiyomi repositories and backend-adapted sources
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSourceManager(false)}
                aria-label="Close source manager"
                className="kuro-btn-glass flex h-9 w-9 items-center justify-center rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <ExtensionManager compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
