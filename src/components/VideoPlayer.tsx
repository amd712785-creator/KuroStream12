import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  Download,
  Gauge,
  Languages,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  Settings2,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getStreamingApiBase, setStreamingApiOverride } from '@/src/config/env';
import type {
  ParsedStreamResult,
  SkipInterval,
  StreamFetchError,
  StreamServer,
  StreamSource,
} from '@/src/types/anime';

interface VideoPlayerProps {
  streamData?: ParsedStreamResult | null;
  streamError?: StreamFetchError | null;
  loading: boolean;
  episodeKey?: string;
  episodeTitle: string;
  initialTime?: number;
  autoNext: boolean;
  hasNextEpisode: boolean;
  audioMode?: 'sub' | 'dub' | 'hindi';
  servers?: StreamServer[];
  selectedServer?: string;
  onSelectServer?: (serverName: string) => void;
  skipIntro?: SkipInterval;
  skipOutro?: SkipInterval;
  skipRecap?: SkipInterval;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onRefreshStream?: () => Promise<boolean>;
  onRetry: () => void;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isSignedUrlNearExpiry(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const expParam = parsed.searchParams.get('exp') || parsed.searchParams.get('expires');
    if (!expParam || !/^\d+$/.test(expParam)) return false;
    const rawNum = Number(expParam);
    const expMs = rawNum > 1e12 ? rawNum : rawNum * 1000;
    if (expMs < 1577836800000) return false;
    return Date.now() >= expMs - 15000;
  } catch {
    return false;
  }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamData,
  streamError,
  loading,
  episodeKey,
  episodeTitle,
  initialTime = 0,
  autoNext,
  hasNextEpisode,
  audioMode,
  servers,
  selectedServer,
  onSelectServer,
  skipIntro,
  skipOutro,
  skipRecap,
  onNextEpisode,
  onPreviousEpisode,
  onProgress,
  onRefreshStream,
  onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const initialTimeRef = useRef(initialTime);
  initialTimeRef.current = initialTime;

  const playbackRateRef = useRef(1);
  const hasAppliedInitialSeekRef = useRef(false);
  const resumeStateRef = useRef<{ time: number; shouldPlay: boolean } | null>(null);
  const networkRetryCountRef = useRef(0);
  const mediaRetryCountRef = useRef(0);
  const refreshAttemptCountRef = useRef(0);
  const proxyAttemptedRef = useRef(false);
  const lastSavedVideoTimeRef = useRef(-10);
  const lastSavedWallMsRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onRefreshStreamRef = useRef(onRefreshStream);
  onRefreshStreamRef.current = onRefreshStream;

  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [showCustomEndpoint, setShowCustomEndpoint] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState(() => getStreamingApiBase());
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [useProxyFallback, setUseProxyFallback] = useState(false);
  const [hindiAudioWarning, setHindiAudioWarning] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; name: string; lang: string }>>([]);
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<number>(-1);

  const sources: StreamSource[] = useMemo(() => streamData?.sources || [], [streamData]);
  const activeSource = sources[selectedSourceIndex] || sources[0];
  const activeSourceUrl = activeSource?.url || '';
  const activeSourceType = activeSource?.type || '';
  const refererHeader = streamData?.headers?.Referer || streamData?.headers?.referer || '';
  const subtitles = useMemo(() => streamData?.subtitles || [], [streamData]);
  const activeIntro = skipIntro || streamData?.intro;
  const activeOutro = skipOutro || streamData?.outro;
  const activeRecap = skipRecap || streamData?.recap;

  useEffect(() => {
    setSelectedSourceIndex(0);
    setSelectedSubtitleIndex(0);
    setMediaError(null);
    setIsBuffering(false);
    setAutoNextCountdown(null);
    setUseProxyFallback(false);
    setHindiAudioWarning(null);
    setAudioTracks([]);
    setSelectedAudioTrackIndex(-1);
    hasAppliedInitialSeekRef.current = false;
    resumeStateRef.current = null;
    networkRetryCountRef.current = 0;
    mediaRetryCountRef.current = 0;
    refreshAttemptCountRef.current = 0;
    proxyAttemptedRef.current = false;
    lastSavedVideoTimeRef.current = -10;
    lastSavedWallMsRef.current = 0;
  }, [episodeKey]);

  useEffect(() => {
    setMediaError(null);
    setAutoNextCountdown(null);
    networkRetryCountRef.current = 0;
    mediaRetryCountRef.current = 0;
  }, [streamData]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const triggerSignedRefresh = useCallback(async (): Promise<boolean> => {
    if (!onRefreshStreamRef.current || refreshAttemptCountRef.current >= 1) {
      return false;
    }
    refreshAttemptCountRef.current += 1;
    const video = videoRef.current;
    if (video) {
      resumeStateRef.current = {
        time: video.currentTime || 0,
        shouldPlay: !video.paused,
      };
    }
    return onRefreshStreamRef.current();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeSourceUrl || activeSourceType === 'embed') return;

    let cancelled = false;
    setMediaError(null);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const initializePlayback = async () => {
      if (isSignedUrlNearExpiry(activeSourceUrl)) {
        const refreshed = await triggerSignedRefresh();
        if (refreshed || cancelled) return;
      }

      const referer = refererHeader || 'https://megavid.buzz/';
      const playbackUrl =
        activeSourceUrl.startsWith('http') && !activeSourceUrl.includes(window.location.host)
          ? `/api/anime/proxy?url=${encodeURIComponent(activeSourceUrl)}&referer=${encodeURIComponent(referer)}`
          : activeSourceUrl;

      const handleLoadedMetadata = () => {
        if (cancelled) return;
        const resume = resumeStateRef.current;
        if (resume) {
          resumeStateRef.current = null;
          if (resume.time > 0 && (!video.duration || resume.time < video.duration - 2)) {
            video.currentTime = resume.time;
          }
          if (resume.shouldPlay) {
            video.play().catch(() => {});
          }
        } else if (!hasAppliedInitialSeekRef.current) {
          hasAppliedInitialSeekRef.current = true;
          const startAt = initialTimeRef.current;
          if (startAt > 5 && video.duration && startAt < video.duration - 15) {
            video.currentTime = startAt;
          }
        }
        video.playbackRate = playbackRateRef.current;
        setDuration(video.duration || 0);
        setIsBuffering(false);
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);

      if (activeSourceType === 'hls') {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            fragLoadingMaxRetry: 3,
            manifestLoadingMaxRetry: 2,
            levelLoadingMaxRetry: 2,
          });
          hlsRef.current = hls;
          hls.loadSource(playbackUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
            const tracks = data.audioTracks || [];
            setAudioTracks(
              tracks.map((t, idx) => ({
                id: idx,
                name: t.name || `Audio ${idx + 1}`,
                lang: t.lang || 'unknown',
              }))
            );

            if (audioMode === 'hindi' && tracks.length > 0) {
              const hindiIdx = tracks.findIndex(
                (t) =>
                  (t.lang && t.lang.toLowerCase().startsWith('hi')) ||
                  (t.name &&
                    (t.name.toLowerCase().includes('hindi') ||
                      t.name.toLowerCase().includes('hin')))
              );
              if (hindiIdx >= 0) {
                hls.audioTrack = hindiIdx;
                setSelectedAudioTrackIndex(hindiIdx);
                setHindiAudioWarning(null);
              } else {
                setHindiAudioWarning('Hindi audio track not found in stream. Playing default audio.');
              }
            } else if (tracks.length > 0) {
              setSelectedAudioTrackIndex(hls.audioTrack >= 0 ? hls.audioTrack : 0);
            }
          });
          hls.on(Hls.Events.ERROR, async (_, data) => {
            if (cancelled || !data.fatal) return;

            const httpCode = data.response?.code;
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              (httpCode === 401 || httpCode === 403 || httpCode === 410)
            ) {
              const refreshed = await triggerSignedRefresh();
              if (refreshed) return;
            }

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetryCountRef.current < 1) {
              networkRetryCountRef.current += 1;
              hls.startLoad();
              return;
            }

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetryCountRef.current < 1) {
              mediaRetryCountRef.current += 1;
              hls.recoverMediaError();
              return;
            }

            if (
              !proxyAttemptedRef.current &&
              !useProxyFallback &&
              activeSourceUrl.startsWith('http')
            ) {
              proxyAttemptedRef.current = true;
              resumeStateRef.current = {
                time: video.currentTime || 0,
                shouldPlay: !video.paused,
              };
              setUseProxyFallback(true);
              return;
            }

            setIsBuffering(false);
            setMediaError(`HLS playback error (${data.details}). Try another server or retry.`);
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = playbackUrl;
        } else {
          setMediaError('HLS streaming is not supported in this browser.');
        }
      } else {
        video.src = playbackUrl;
      }

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    };

    let removeListener: (() => void) | undefined;
    initializePlayback().then((cleanup) => {
      if (cancelled) {
        cleanup?.();
      } else {
        removeListener = cleanup;
      }
    });

    return () => {
      cancelled = true;
      removeListener?.();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeSourceUrl, activeSourceType, refererHeader, useProxyFallback, triggerSignedRefresh, audioMode]);

  useEffect(() => {
    if (autoNextCountdown === null) return;
    if (autoNextCountdown <= 0) {
      setAutoNextCountdown(null);
      onNextEpisode?.();
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoNextCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [autoNextCountdown, onNextEpisode]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    try {
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
    } catch {
      // ignore fullscreen errors
    }
  }, []);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const onFsChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const video = videoRef.current;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          if (video) {
            e.preventDefault();
            togglePlay();
          }
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          if (video) {
            e.preventDefault();
            video.muted = !video.muted;
            setIsMuted(video.muted);
          }
          break;
        case 'arrowright':
          if (video) {
            e.preventDefault();
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          }
          break;
        case 'arrowleft':
          if (video) {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 10);
          }
          break;
        case 'n':
          if (hasNextEpisode && onNextEpisode) {
            e.preventDefault();
            onNextEpisode();
          }
          break;
        case 'p':
          if (onPreviousEpisode) {
            e.preventDefault();
            onPreviousEpisode();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleFullscreen, hasNextEpisode, onNextEpisode, onPreviousEpisode]);

  const flushProgress = useCallback((time: number, dur: number) => {
    if (!onProgressRef.current) return;
    lastSavedVideoTimeRef.current = time;
    lastSavedWallMsRef.current = Date.now();
    onProgressRef.current(time, dur);
  }, []);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const nowTime = video.currentTime;
    const totalDur = video.duration || 0;
    setCurrentTime(nowTime);
    setDuration(totalDur);

    const nowMs = Date.now();
    if (
      nowTime > 0 &&
      Math.abs(nowTime - lastSavedVideoTimeRef.current) >= 5 &&
      nowMs - lastSavedWallMsRef.current >= 4500
    ) {
      flushProgress(nowTime, totalDur);
    }
  };

  const handleSaveCustomEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    setStreamingApiOverride(customEndpoint);
    setShowCustomEndpoint(false);
    onRetry();
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-[#05060a] shadow-2xl shadow-violet-950/25 ${
        isFullscreen
          ? 'flex h-full w-full flex-col justify-center rounded-none border-0'
          : 'rounded-3xl border border-white/[0.1]'
      }`}
    >
      <div className={`relative w-full bg-black ${isFullscreen ? 'flex-1 min-h-0' : 'aspect-video'}`}>
        {loading ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3.5 bg-gradient-to-br from-[#090b13] via-[#0e0b1a] to-[#07080d] text-slate-200 px-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-600/15 shadow-lg shadow-violet-900/30">
              <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Connecting to stream</p>
              <p className="text-xs text-slate-400 line-clamp-1">{episodeTitle}</p>
            </div>
          </div>
        ) : streamError || mediaError ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#0b0d16] via-[#130d1d] to-[#160b14] p-5 sm:p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/15 text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="mt-3.5 text-base sm:text-lg font-bold text-white">
              Stream Currently Unavailable
            </h3>
            <p className="mt-1.5 max-w-lg text-xs sm:text-sm text-slate-300">
              {mediaError || streamError?.message}
            </p>
            {streamError?.endpointUrl && (
              <p className="mt-2 max-w-xl truncate font-mono text-[11px] text-slate-500">
                Endpoint: {streamError.endpointUrl}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onRetry}
                className="kuro-btn-primary inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4.5 py-2 text-xs sm:text-sm font-semibold"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry Stream</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCustomEndpoint((v) => !v)}
                className="kuro-btn-glass inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4.5 py-2 text-xs sm:text-sm font-semibold"
              >
                <Settings2 className="h-4 w-4" />
                <span>Provider URL</span>
              </button>
            </div>

            {servers && servers.length > 0 && onSelectServer && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs text-slate-400 mr-1">Switch Server:</span>
                {servers
                  .filter((srv) => srv.name.toLowerCase() !== (selectedServer || '').toLowerCase())
                  .map((srv) => (
                    <button
                      key={srv.name}
                      type="button"
                      onClick={() => onSelectServer(srv.name)}
                      className="kuro-btn-glass min-h-[36px] rounded-xl px-3.5 py-1.5 text-xs font-semibold capitalize"
                    >
                      {srv.name}
                    </button>
                  ))}
              </div>
            )}

            {showCustomEndpoint && (
              <form
                onSubmit={handleSaveCustomEndpoint}
                className="mt-4 flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/15 bg-[#07080d]/90 p-2.5"
              >
                <input
                  type="url"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="https://your-streaming-api.example.com"
                  className="flex-1 rounded-xl bg-[#121422] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button
                  type="submit"
                  className="kuro-btn-primary min-h-[36px] rounded-xl px-3.5 py-1.5 text-xs font-semibold"
                >
                  Apply
                </button>
              </form>
            )}
          </div>
        ) : !activeSource ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
            Select an episode to start streaming.
          </div>
        ) : activeSource.type === 'embed' ? (
          <iframe
            key={activeSource.url}
            src={activeSource.url}
            title={episodeTitle}
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture"
            className="h-full w-full border-0"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              crossOrigin="anonymous"
              playsInline
              preload="auto"
              onClick={togglePlay}
              onPlay={() => setIsPlaying(true)}
              onPlaying={() => {
                setIsPlaying(true);
                setIsBuffering(false);
              }}
              onPause={() => {
                setIsPlaying(false);
                if (videoRef.current && videoRef.current.currentTime > 0) {
                  flushProgress(videoRef.current.currentTime, videoRef.current.duration || 0);
                }
              }}
              onWaiting={() => setIsBuffering(true)}
              onSeeking={() => setIsBuffering(true)}
              onSeeked={() => setIsBuffering(false)}
              onCanPlay={() => setIsBuffering(false)}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => {
                setIsPlaying(false);
                setIsBuffering(false);
                if (videoRef.current) {
                  flushProgress(videoRef.current.duration || 0, videoRef.current.duration || 0);
                }
                if (autoNext && hasNextEpisode) {
                  setAutoNextCountdown(5);
                }
              }}
              onError={async () => {
                if (activeSourceType === 'hls') return;
                if (
                  !proxyAttemptedRef.current &&
                  !useProxyFallback &&
                  activeSourceUrl.startsWith('http')
                ) {
                  proxyAttemptedRef.current = true;
                  const video = videoRef.current;
                  resumeStateRef.current = {
                    time: video?.currentTime || 0,
                    shouldPlay: Boolean(video && !video.paused),
                  };
                  setUseProxyFallback(true);
                  return;
                }
                const refreshed = await triggerSignedRefresh();
                if (!refreshed) {
                  setIsBuffering(false);
                  setMediaError('Failed to decode video stream. Try switching quality or server.');
                }
              }}
              className="h-full w-full cursor-pointer bg-black object-contain"
            >
              {subtitles.map((sub, idx) => (
                <track
                  key={`${sub.url}-${idx}`}
                  kind="subtitles"
                  src={sub.url}
                  label={sub.label}
                  srcLang={sub.lang.slice(0, 2).toLowerCase()}
                  default={idx === selectedSubtitleIndex}
                />
              ))}
            </video>

            {isBuffering && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="h-9 w-9 animate-spin text-violet-400" />
              </div>
            )}

            {activeIntro &&
              currentTime >= activeIntro.start &&
              currentTime < activeIntro.end && (
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current && activeIntro) {
                      videoRef.current.currentTime = activeIntro.end;
                    }
                  }}
                  className="kuro-btn-glass absolute bottom-5 right-5 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>Skip Intro</span>
                </button>
              )}

            {activeOutro &&
              currentTime >= activeOutro.start &&
              currentTime < activeOutro.end && (
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current && activeOutro) {
                      videoRef.current.currentTime = activeOutro.end;
                    }
                  }}
                  className="kuro-btn-glass absolute bottom-5 right-5 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>Skip Outro</span>
                </button>
              )}

            {activeRecap &&
              currentTime >= activeRecap.start &&
              currentTime < activeRecap.end && (
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current && activeRecap) {
                      videoRef.current.currentTime = activeRecap.end;
                    }
                  }}
                  className="kuro-btn-glass absolute bottom-16 right-5 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>Skip Recap</span>
                </button>
              )}

            {autoNextCountdown !== null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md">
                <p className="text-sm font-medium text-slate-300">
                  Up Next in <span className="font-mono text-white">{autoNextCountdown}s</span>
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoNextCountdown(null);
                      onNextEpisode?.();
                    }}
                    className="kuro-btn-primary inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4.5 py-2 text-sm font-semibold"
                  >
                    <SkipForward className="h-4 w-4" />
                    <span>Play Next Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoNextCountdown(null)}
                    className="kuro-btn-glass min-h-[42px] rounded-2xl px-4.5 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Frosted Glass Controls Bar (HLS/MP4 native player) */}
      {activeSource && activeSource.type !== 'embed' && !streamError && !mediaError && (
        <div className="border-t border-white/[0.08] bg-[#090b13]/95 backdrop-blur-xl px-3.5 sm:px-4 py-3">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const nextTime = Number(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = nextTime;
              setCurrentTime(nextTime);
            }}
            aria-label="Seek video progress"
            className="mb-2.5 h-1.5 w-full cursor-pointer accent-violet-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="kuro-btn-primary flex h-9 w-9 items-center justify-center rounded-xl"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!videoRef.current) return;
                    videoRef.current.muted = !videoRef.current.muted;
                    setIsMuted(videoRef.current.muted);
                  }}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="kuro-btn-glass flex h-9 w-9 items-center justify-center rounded-xl"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    if (videoRef.current) {
                      videoRef.current.volume = v;
                      videoRef.current.muted = v === 0;
                    }
                    setIsMuted(v === 0);
                  }}
                  aria-label="Volume"
                  className="w-16 accent-violet-500 hidden sm:block"
                />
              </div>

              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {formatClock(currentTime)} / {formatClock(duration)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {subtitles.length > 0 && (
                <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#121422] px-2.5 text-xs text-slate-200">
                  <Captions className="h-3.5 w-3.5 text-violet-300" />
                  <select
                    value={selectedSubtitleIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedSubtitleIndex(idx);
                      if (videoRef.current) {
                        Array.from(videoRef.current.textTracks).forEach((track, tIdx) => {
                          track.mode = tIdx === idx ? 'showing' : 'disabled';
                        });
                      }
                    }}
                    className="bg-transparent focus:outline-none"
                    aria-label="Subtitle track"
                  >
                    {subtitles.map((sub, i) => (
                      <option key={`${sub.url}-${i}`} value={i} className="bg-[#10121a]">
                        {sub.label}
                      </option>
                    ))}
                    <option value={-1} className="bg-[#10121a]">
                      Off
                    </option>
                  </select>
                </label>
              )}

              {audioTracks.length > 1 && (
                <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#121422] px-2.5 text-xs text-slate-200">
                  <Languages className="h-3.5 w-3.5 text-violet-300" />
                  <select
                    value={selectedAudioTrackIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedAudioTrackIndex(idx);
                      if (hlsRef.current) {
                        hlsRef.current.audioTrack = idx;
                      }
                    }}
                    className="bg-transparent focus:outline-none"
                    aria-label="Audio language track"
                  >
                    {audioTracks.map((tr) => (
                      <option key={tr.id} value={tr.id} className="bg-[#10121a]">
                        {tr.name} ({tr.lang})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {sources.length > 1 && (
                <select
                  value={selectedSourceIndex}
                  onChange={(e) => {
                    const nextIdx = Number(e.target.value);
                    const video = videoRef.current;
                    if (video) {
                      resumeStateRef.current = {
                        time: video.currentTime || 0,
                        shouldPlay: !video.paused,
                      };
                    }
                    proxyAttemptedRef.current = false;
                    networkRetryCountRef.current = 0;
                    mediaRetryCountRef.current = 0;
                    setUseProxyFallback(false);
                    setSelectedSourceIndex(nextIdx);
                  }}
                  aria-label="Video quality"
                  className="h-9 rounded-xl border border-white/[0.08] bg-[#121422] px-2.5 text-xs text-slate-200 focus:outline-none"
                >
                  {sources.map((src, i) => (
                    <option key={`${src.url}-${i}`} value={i} className="bg-[#10121a]">
                      {src.quality}
                    </option>
                  ))}
                </select>
              )}

              <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#121422] px-2.5 text-xs text-slate-200">
                <Gauge className="h-3.5 w-3.5 text-violet-300" />
                <select
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  aria-label="Playback speed"
                  className="bg-transparent focus:outline-none"
                >
                  {PLAYBACK_RATES.map((rate) => (
                    <option key={rate} value={rate} className="bg-[#10121a]">
                      {rate}x
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="kuro-btn-glass flex h-9 w-9 items-center justify-center rounded-xl"
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {audioMode === 'hindi' && streamData?.hasHindiAudio === false && !hindiAudioWarning && (
            <p className="mt-2 text-xs text-amber-300">
              Hindi audio track not available on this server (playing{' '}
              {streamData.audioLanguages?.join(', ') || 'English/Japanese'}). Switch to AnimeWorld-India for Hindi audio where available.
            </p>
          )}
          {hindiAudioWarning && (
            <p className="mt-2 text-xs text-amber-300">{hindiAudioWarning}</p>
          )}
        </div>
      )}

      {/* Embed Player Controls Bar (for AnimeWorld India & iframe sources) */}
      {activeSource && activeSource.type === 'embed' && !streamError && !mediaError && (
        <div className="border-t border-white/[0.08] bg-[#090b13]/95 backdrop-blur-xl px-3.5 sm:px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {streamData?.hasHindiAudio ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Hindi Audio Verified</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>
                    Hindi Dub Not Available
                    {streamData?.audioLanguages?.length
                      ? ` (${streamData.audioLanguages.join(', ')} only)`
                      : ''}
                  </span>
                </span>
              )}

              {streamData?.audioLanguages && streamData.audioLanguages.length > 0 && (
                <span className="text-slate-400">
                  Audio: {streamData.audioLanguages.join(', ')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {sources.length > 1 && (
                <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#121422] px-2.5 text-xs text-slate-200">
                  <Languages className="h-3.5 w-3.5 text-violet-300" />
                  <select
                    value={selectedSourceIndex}
                    onChange={(e) => setSelectedSourceIndex(Number(e.target.value))}
                    aria-label="Audio language stream"
                    className="bg-transparent focus:outline-none"
                  >
                    {sources.map((src, i) => (
                      <option key={`${src.url}-${i}`} value={i} className="bg-[#10121a]">
                        {src.language ? `${src.language} — ${src.quality}` : src.quality}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {streamData?.downloadUrl && (
                <a
                  href={streamData.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kuro-btn-glass inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </a>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="kuro-btn-glass flex h-9 w-9 items-center justify-center rounded-xl"
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
