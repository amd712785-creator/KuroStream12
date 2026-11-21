import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  cancelOrDeleteDownload,
  getStoredDownloads,
  pauseDownload,
  startDownloadEpisode,
  type DownloadItem,
} from '@/src/services/downloadService';

interface DownloadManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayOffline?: (item: DownloadItem) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 KB/s';
  const kb = bytesPerSec / 1024;
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB/s`;
  }
  return `${Math.round(kb)} KB/s`;
}

export const DownloadManagerModal: React.FC<DownloadManagerModalProps> = ({
  isOpen,
  onClose,
  onPlayOffline,
}) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const load = () => {
      setDownloads(getStoredDownloads());
    };
    load();
    window.addEventListener('kurostream:downloads-updated', load);
    const timer = setInterval(load, 1000);
    return () => {
      window.removeEventListener('kurostream:downloads-updated', load);
      clearInterval(timer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePause = (id: string) => {
    pauseDownload(id);
    setDownloads(getStoredDownloads());
  };

  const handleRetry = (item: DownloadItem) => {
    cancelOrDeleteDownload(item.id);
    startDownloadEpisode(
      {
        id: item.id,
        animeId: item.animeId,
        animeTitle: item.animeTitle,
        coverImage: item.coverImage,
        episodeId: item.episodeId,
        episodeNumber: item.episodeNumber,
        episodeTitle: item.episodeTitle,
        audioMode: item.audioMode,
        streamUrl: item.streamUrl,
        fileSize: 0,
      },
      () => setDownloads(getStoredDownloads())
    );
  };

  const handleDelete = (id: string) => {
    cancelOrDeleteDownload(id);
    setDownloads(getStoredDownloads());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Download Manager"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <div className="kuro-glass-elevated flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-600/15 text-violet-300">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Download Manager &amp; Offline</h2>
              <p className="text-xs text-slate-400">
                {downloads.length} episodes in download queue / offline storage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close download manager"
            className="kuro-btn-glass flex h-9 w-9 items-center justify-center rounded-xl"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {downloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400 mb-3">
                <Download className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-white">No Downloads Yet</h3>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                Tap the Download button on any episode to save it for offline playback without internet.
              </p>
            </div>
          ) : (
            downloads.map((item) => {
              const isCompleted = item.status === 'completed';
              const isDownloading = item.status === 'downloading';
              const isError = item.status === 'error';
              const isPaused = item.status === 'paused';

              return (
                <div
                  key={item.id}
                  className="kuro-glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={item.coverImage}
                      alt={item.animeTitle}
                      className="h-14 w-11 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-violet-300">
                        <span className="font-semibold uppercase tracking-wider">
                          EP {item.episodeNumber} · {item.audioMode.toUpperCase()}
                        </span>
                        <span className="text-slate-400">
                          {formatBytes(item.fileSize || item.downloadedBytes)}
                        </span>
                        {isDownloading && (
                          <span className="text-emerald-400">{formatSpeed(item.speedBytesPerSec)}</span>
                        )}
                      </div>
                      <h4 className="truncate text-xs sm:text-sm font-bold text-white">
                        {item.animeTitle}
                      </h4>
                      <p className="truncate text-xs text-slate-400">{item.episodeTitle}</p>

                      {/* Progress bar */}
                      {(isDownloading || isPaused) && (
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>
                              {isDownloading ? 'Downloading...' : 'Paused'} ({item.progress}%)
                            </span>
                            <span>
                              {formatBytes(item.downloadedBytes)} / {formatBytes(item.fileSize)}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {isError && (
                        <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.errorMessage || 'Download failed'}</span>
                        </p>
                      )}

                      {isCompleted && (
                        <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>Ready for offline playback</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                    {isDownloading && (
                      <button
                        type="button"
                        onClick={() => handlePause(item.id)}
                        className="kuro-btn-glass inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        <span>Pause</span>
                      </button>
                    )}

                    {isPaused && (
                      <button
                        type="button"
                        onClick={() => handleRetry(item)}
                        className="kuro-btn-primary inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>Resume</span>
                      </button>
                    )}

                    {isError && (
                      <button
                        type="button"
                        onClick={() => handleRetry(item)}
                        className="kuro-btn-primary inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Retry</span>
                      </button>
                    )}

                    {isCompleted && onPlayOffline && (
                      <button
                        type="button"
                        onClick={() => {
                          onPlayOffline(item);
                          onClose();
                        }}
                        className="kuro-btn-primary inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Play Offline</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      aria-label="Delete download"
                      className="kuro-btn-glass flex h-9 w-9 items-center justify-center rounded-xl text-rose-300 hover:text-rose-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
