import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  Camera,
  Check,
  Clock,
  Download,
  Flame,
  HardDrive,
  Heart,
  Package,
  Pause,
  Play,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
  Trophy,
  User,
  WifiOff,
} from 'lucide-react';
import { AchievementsSection } from '@/src/components/AchievementsSection';
import { AdminDashboardSection } from '@/src/components/AdminDashboardSection';
import { AnimeImage } from '@/src/components/AnimeImage';
import { OptimizedBannerImage } from '@/src/components/OptimizedBannerImage';
import { AvatarGalleryModal } from '@/src/components/AvatarGalleryModal';
import {
  DownloadManagerModal,
  formatDownloadBytes,
  formatDownloadSpeed,
} from '@/src/components/DownloadManagerModal';
import { ExtensionManager } from '@/src/components/ExtensionManager';
import { OfflinePlayerModal } from '@/src/components/OfflinePlayerModal';
import { StreakCalendarSection } from '@/src/components/StreakCalendarSection';
import { useAuth } from '@/src/context/AuthContext';
import {
  cancelOrDeleteDownload,
  getStoredDownloads,
  pauseDownload,
  resumeDownload,
  retryDownload,
  type DownloadItem,
} from '@/src/services/downloadService';

type ProfileSection =
  | 'overview'
  | 'streak'
  | 'achievements'
  | 'continue'
  | 'downloads'
  | 'watchlist'
  | 'favorites'
  | 'history'
  | 'sources'
  | 'admin';

export const ProfilePage: React.FC = () => {
  const {
    user,
    authReady,
    isAdmin,
    firebaseEnabled,
    preferences,
    watchlist,
    favorites,
    history,
    watchStats,
    openAuthModal,
    signOut,
    updatePreferences,
    removeHistoryItem,
    clearHistory,
  } = useAuth();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as ProfileSection) || 'overview';

  const [downloads, setDownloads] = useState<DownloadItem[]>(() => getStoredDownloads());
  const [showAvatarGallery, setShowAvatarGallery] = useState(false);
  const [avatarSavedToast, setAvatarSavedToast] = useState(false);
  const [nameInput, setNameInput] = useState(preferences.displayName);
  const [savedToast, setSavedToast] = useState(false);
  const [showDownloadManager, setShowDownloadManager] = useState(false);
  const [offlinePlayerItem, setOfflinePlayerItem] = useState<DownloadItem | null>(null);

  useEffect(() => {
    const sync = () => setDownloads(getStoredDownloads());
    sync();
    window.addEventListener('kurostream:downloads-updated', sync);
    const timer = window.setInterval(sync, 1200);
    return () => {
      window.removeEventListener('kurostream:downloads-updated', sync);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setNameInput(preferences.displayName);
  }, [preferences.displayName]);

  const selectTab = (tab: ProfileSection) => {
    if (tab === 'admin' && !isAdmin) return;
    if (tab === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    if (!nameInput.trim()) return;
    await updatePreferences({ displayName: nameInput.trim() });
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 2000);
  };

  const handleSaveAvatar = async (photoURL: string) => {
    if (!user) {
      openAuthModal();
      return;
    }
    await updatePreferences({ photoURL });
    setAvatarSavedToast(true);
    window.setTimeout(() => setAvatarSavedToast(false), 2500);
  };

  const completedDownloadsCount = downloads.filter((d) => d.status === 'completed').length;
  const totalDownloadsBytes = downloads.reduce(
    (sum, d) => sum + (d.status === 'completed' ? d.fileSize || d.downloadedBytes : d.downloadedBytes),
    0
  );

  const uniqueAnimeWatched = new Set(history.map((h) => h.animeId)).size;
  const totalEpisodesCount = watchStats.totalEpisodesCompleted || history.length;
  const totalMinutes = totalEpisodesCount * 24;
  const watchTimeFormatted =
    totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)} hrs ${totalMinutes % 60} mins`
      : `${totalMinutes} mins`;

  const currentStreak = watchStats.streakCurrent || 0;
  const unlockedBadgesCount = (watchStats.unlockedAchievements || []).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      {/* Profile Header with Custom Profile Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-[#121422] via-[#0b0d17] to-[#07080d] p-6 sm:p-8 shadow-[0_0_50px_-10px_rgba(147,51,234,0.25)]">
        {preferences.bannerURL && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <OptimizedBannerImage
              src={preferences.bannerURL}
              alt="Profile Banner Backdrop"
              priority
              className="h-full w-full object-cover filter brightness-[0.35] scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#07080d]/95 via-[#07080d]/85 to-[#07080d]/70 pointer-events-none" />
          </div>
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl"
        />

        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => (user ? navigate('/profile/edit') : openAuthModal())}
              aria-label="Edit profile picture"
              className="group relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-3xl border-2 border-violet-400 bg-[#141726] shadow-[0_0_25px_rgba(168,85,247,0.5)] transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <AnimeImage
                src={preferences.photoURL}
                alt={preferences.displayName}
                variant="avatar"
                className="h-full w-full object-cover object-top"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-6 w-6 text-white" />
              </span>
            </button>

            <div className="min-w-0 space-y-1">
              <h1 className="text-xl sm:text-2xl font-black text-white truncate">
                {preferences.displayName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 truncate">
                {user ? user.email : 'Guest Session (Sign in to sync across devices)'}
              </p>
              {avatarSavedToast && (
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  <span>Profile picture updated successfully</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/profile/edit')}
                  className="kuro-btn-active inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4.5 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap shadow-lg"
                >
                  <Camera className="h-4 w-4" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="kuro-btn-glass inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4.5 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap text-rose-300 hover:text-rose-200"
                >
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              firebaseEnabled && (
                <button
                  type="button"
                  onClick={openAuthModal}
                  className="kuro-btn-primary inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap shadow-lg shadow-violet-950/50"
                >
                  <User className="h-4 w-4" />
                  <span>Sign In / Create Account</span>
                </button>
              )
            )}
          </div>
        </div>

        {user && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-6 flex flex-col sm:flex-row items-center gap-3 border-t border-white/[0.08] pt-5"
          >
            <div className="w-full sm:max-w-md flex-1">
              <label htmlFor="profile-name-input" className="block text-xs font-medium text-slate-400 mb-1">
                Display Name
              </label>
              <input
                id="profile-name-input"
                type="text"
                maxLength={60}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d]/90 px-3.5 text-sm text-white focus:border-violet-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="kuro-btn-glass mt-5 sm:mt-0 min-h-[40px] w-full sm:w-auto rounded-xl px-5 text-xs font-semibold"
            >
              {savedToast ? <Check className="h-4 w-4 text-emerald-400 inline" /> : 'Update Name'}
            </button>
          </form>
        )}
      </section>

      {/* Subheader if viewing subsection */}
      {activeTab !== 'overview' && (
        <div className="flex items-center justify-between rounded-2xl border border-violet-500/35 bg-[#10121d]/90 px-5 py-3.5">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-white capitalize">
            <span>Viewing: {activeTab.replace('-', ' ')}</span>
          </div>
          <button
            type="button"
            onClick={() => selectTab('overview')}
            className="kuro-btn-glass rounded-xl px-4 py-1.5 text-xs font-semibold text-violet-300"
          >
            ← Back to My Profile
          </button>
        </div>
      )}

      {/* Overview Dashboard */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* MY ACTIVITY */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-violet-400 px-1">
              My Activity &amp; Streaks
            </h2>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <ProfileCard
                icon={Flame}
                title="Watch Streak"
                count={`${currentStreak} Days 🔥`}
                description={`Total watched: ${totalEpisodesCount} eps · ${watchTimeFormatted}`}
                onClick={() => selectTab('streak')}
                isAmber
              />
              <ProfileCard
                icon={Trophy}
                title="Achievements"
                count={`${unlockedBadgesCount} / 6 Unlocked`}
                description="Collector badges & streaming milestones"
                onClick={() => selectTab('achievements')}
              />
              <ProfileCard
                icon={Play}
                title="Continue Watching"
                count={history.length}
                description="Resume your currently playing shows"
                onClick={() => selectTab('continue')}
              />
              <ProfileCard
                icon={Download}
                title="Downloads"
                count={downloads.length}
                description={`${completedDownloadsCount} ready offline · ${formatDownloadBytes(totalDownloadsBytes)}`}
                onClick={() => selectTab('downloads')}
              />
              <ProfileCard
                icon={Bookmark}
                title="Watchlist"
                count={watchlist.length}
                description="Bookmarked series and movies queue"
                onClick={() => selectTab('watchlist')}
              />
              <ProfileCard
                icon={Heart}
                title="Favorites"
                count={favorites.length}
                description="Your all-time favorite anime titles"
                onClick={() => selectTab('favorites')}
              />
              <ProfileCard
                icon={Clock}
                title="Watch History"
                count={history.length}
                description="Previously watched episodes timeline"
                onClick={() => selectTab('history')}
              />
            </div>
          </section>

          {/* APP & STREAMING SETTINGS */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-violet-400 px-1">
              App &amp; Streaming Settings
            </h2>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <ProfileLinkCard
                icon={Settings2}
                title="Settings"
                description="General configuration, audio language, themes & APIs"
                to="/settings"
              />
              <ProfileCard
                icon={Package}
                title="Sources"
                count="Aniyomi"
                description="Manage streaming extension repos & servers"
                onClick={() => selectTab('sources')}
              />
            </div>
          </section>

          {/* ADMINISTRATION */}
          {isAdmin && (
            <section className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400 px-1">
                Administration
              </h2>
              <div className="grid grid-cols-1 gap-3.5">
                <ProfileCard
                  icon={ShieldCheck}
                  title="Admin Dashboard"
                  count="Protected"
                  description="Telemetry, user stats and presence monitoring"
                  onClick={() => selectTab('admin')}
                  isAmber
                />
              </div>
            </section>
          )}
        </div>
      )}

      {/* SUB-SECTION VIEWS */}
      {activeTab === 'streak' && <StreakCalendarSection stats={watchStats} />}
      {activeTab === 'achievements' && <AchievementsSection stats={watchStats} />}

      {activeTab === 'continue' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Continue Watching ({history.length})</h2>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="kuro-btn-glass inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear History</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <EmptyProfileState
              title="No continue watching history"
              description="Start playing any episode to automatically track your progress here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {history.map((item) => {
                const pct =
                  item.durationSeconds > 0
                    ? Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100))
                    : 0;
                return (
                  <div
                    key={`${item.animeId}-${item.episodeId}`}
                    className="kuro-glass flex items-center justify-between gap-4 rounded-2xl p-4 hover:border-violet-500/50 transition-colors"
                  >
                    <Link
                      to={`/watch/${item.animeId}/${encodeURIComponent(item.episodeId)}?ep=${item.episodeNumber}`}
                      className="flex min-w-0 flex-1 items-center gap-3.5"
                    >
                      <AnimeImage
                        src={item.coverImage}
                        alt={item.title}
                        className="h-20 w-14 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white hover:text-violet-300">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
                          Episode {item.episodeNumber} · {item.audioMode.toUpperCase()}
                        </p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.1]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                            style={{ width: `${Math.max(8, pct)}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeHistoryItem(item.animeId)}
                      aria-label="Remove item"
                      className="kuro-btn-glass flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'downloads' && (
        <div className="space-y-4">
          <div className="kuro-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5">
            <div className="flex items-center gap-2.5 text-xs text-slate-300 tabular-nums">
              <HardDrive className="h-4 w-4 text-emerald-400" />
              <span>
                {completedDownloadsCount} ready for offline playback ·{' '}
                {formatDownloadBytes(totalDownloadsBytes)} used
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDownloadManager(true)}
              className="kuro-btn-glass inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-violet-200"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Open Download Manager</span>
            </button>
          </div>

          {downloads.length === 0 ? (
            <EmptyProfileState
              title="No offline downloads"
              description="Download episodes to watch them without an internet connection."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {downloads.map((item) => {
                const isCompleted = item.status === 'completed';
                const isDownloading = item.status === 'downloading';
                const isQueued = item.status === 'queued';
                const isPaused = item.status === 'paused';
                const isError = item.status === 'error';

                return (
                  <div
                    key={item.id}
                    className="kuro-glass flex flex-col justify-between gap-3 rounded-2xl p-4"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <AnimeImage
                        src={item.coverImage}
                        alt={item.animeTitle}
                        className="h-20 w-14 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-violet-300 tabular-nums">
                          <span className="font-semibold">
                            EP {item.episodeNumber} · {item.audioMode.toUpperCase()}
                          </span>
                          <span className="uppercase text-slate-400">
                            · {formatDownloadBytes(item.fileSize || item.downloadedBytes)}
                          </span>
                        </div>
                        <p className="truncate text-sm font-bold text-white">{item.animeTitle}</p>
                        <p className="truncate text-xs text-slate-400">{item.episodeTitle}</p>

                        {isCompleted && (
                          <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                            <WifiOff className="h-3.5 w-3.5 shrink-0" />
                            <span>Offline Ready</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-2.5">
                      {isCompleted && (
                        <button
                          type="button"
                          onClick={() => setOfflinePlayerItem(item)}
                          className="kuro-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>Play Offline</span>
                        </button>
                      )}
                      {(isDownloading || isQueued) && (
                        <button
                          type="button"
                          onClick={() => pauseDownload(item.id)}
                          className="kuro-btn-glass rounded-xl px-3 py-1.5 text-xs font-semibold"
                        >
                          Pause
                        </button>
                      )}
                      {isPaused && (
                        <button
                          type="button"
                          onClick={() => resumeDownload(item.id)}
                          className="kuro-btn-primary rounded-xl px-3 py-1.5 text-xs font-semibold"
                        >
                          Resume
                        </button>
                      )}
                      {isError && (
                        <button
                          type="button"
                          onClick={() => void retryDownload(item.id)}
                          className="kuro-btn-primary rounded-xl px-3 py-1.5 text-xs font-semibold"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void cancelOrDeleteDownload(item.id)}
                        className="kuro-btn-glass flex h-9 w-9 items-center justify-center rounded-xl text-rose-300 hover:text-rose-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'watchlist' && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Watchlist ({watchlist.length})</h2>
          {watchlist.length === 0 ? (
            <EmptyProfileState
              title="Your watchlist is empty"
              description="Bookmark series or movies while exploring the catalog."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {watchlist.map((item) => (
                <Link
                  key={item.animeId}
                  to={`/anime/${item.animeId}`}
                  className="group flex flex-col"
                >
                  <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10121c] group-hover:border-violet-500/50 transition-colors">
                    <AnimeImage
                      src={item.coverImage}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-100 group-hover:text-violet-300">
                    {item.title}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Favorites ({favorites.length})</h2>
          {favorites.length === 0 ? (
            <EmptyProfileState
              title="No favorites yet"
              description="Tap favorite on anime detail pages to keep them here."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {favorites.map((item) => (
                <Link
                  key={item.animeId}
                  to={`/anime/${item.animeId}`}
                  className="group flex flex-col"
                >
                  <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10121c] group-hover:border-rose-500/50 transition-colors">
                    <AnimeImage
                      src={item.coverImage}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-100 group-hover:text-rose-300">
                    {item.title}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Watch History ({history.length})</h2>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="kuro-btn-glass inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear History</span>
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <EmptyProfileState
              title="No watch history"
              description="Your viewing history will appear here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {history.map((item) => (
                <div
                  key={`${item.animeId}-${item.episodeId}`}
                  className="kuro-glass flex items-center justify-between gap-4 rounded-2xl p-3.5"
                >
                  <Link
                    to={`/watch/${item.animeId}/${encodeURIComponent(item.episodeId)}?ep=${item.episodeNumber}`}
                    className="flex min-w-0 flex-1 items-center gap-3.5"
                  >
                    <AnimeImage
                      src={item.coverImage}
                      alt={item.title}
                      className="h-16 w-12 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-xs text-slate-400">Episode {item.episodeNumber}</p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeHistoryItem(item.animeId)}
                    className="kuro-btn-glass p-2 rounded-xl text-slate-400 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white">Streaming Sources &amp; Extensions</h2>
          <ExtensionManager />
        </div>
      )}

      {activeTab === 'admin' && isAdmin && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white">Admin Dashboard</h2>
          <AdminDashboardSection />
        </div>
      )}

      {/* Modals */}
      <AvatarGalleryModal
        isOpen={showAvatarGallery}
        currentAvatarUrl={preferences.photoURL}
        displayName={preferences.displayName}
        onClose={() => setShowAvatarGallery(false)}
        onSave={handleSaveAvatar}
      />

      <DownloadManagerModal
        isOpen={showDownloadManager}
        onClose={() => setShowDownloadManager(false)}
        onPlayOffline={(item) => setOfflinePlayerItem(item)}
      />

      <OfflinePlayerModal
        item={offlinePlayerItem}
        onClose={() => setOfflinePlayerItem(null)}
      />
    </div>
  );
};

interface ProfileCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: string | number;
  description: string;
  onClick: () => void;
  isAmber?: boolean;
}

const ProfileCard: React.FC<ProfileCardProps> = ({
  icon: Icon,
  title,
  count,
  description,
  onClick,
  isAmber = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`kuro-glass group relative flex items-center justify-between gap-4 rounded-3xl p-5 text-left transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_10px_30px_-10px_rgba(147,51,234,0.35)] ${
      isAmber ? 'hover:border-amber-500/50' : 'hover:border-violet-500/50'
    }`}
  >
    <div className="flex items-center gap-4 min-w-0">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110 ${
          isAmber
            ? 'border-amber-400/35 bg-amber-500/20 text-amber-300'
            : 'border-violet-400/35 bg-violet-600/20 text-violet-300'
        }`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-bold text-white group-hover:text-violet-300 transition-colors">
            {title}
          </h3>
          {count !== undefined && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                isAmber
                  ? 'border-amber-400/35 bg-amber-500/15 text-amber-300'
                  : 'border-violet-400/35 bg-violet-500/20 text-violet-300'
              }`}
            >
              {count}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">{description}</p>
      </div>
    </div>
    <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-white" />
  </button>
);

interface ProfileLinkCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  to: string;
}

const ProfileLinkCard: React.FC<ProfileLinkCardProps> = ({
  icon: Icon,
  title,
  description,
  to,
}) => (
  <Link
    to={to}
    className="kuro-glass group relative flex items-center justify-between gap-4 rounded-3xl p-5 text-left transition-all duration-300 hover:scale-[1.01] hover:border-violet-500/50 hover:shadow-[0_10px_30px_-10px_rgba(147,51,234,0.35)]"
  >
    <div className="flex items-center gap-4 min-w-0">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-600/20 text-violet-300 transition-transform duration-300 group-hover:scale-110">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-base font-bold text-white group-hover:text-violet-300 transition-colors">
          {title}
        </h3>
        <p className="mt-0.5 truncate text-xs text-slate-400">{description}</p>
      </div>
    </div>
    <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-white" />
  </Link>
);

const EmptyProfileState: React.FC<{ title: string; description: string }> = ({
  title,
  description,
}) => (
  <div className="kuro-glass rounded-3xl p-12 text-center">
    <h3 className="text-base font-semibold text-white">{title}</h3>
    <p className="mt-1 text-sm text-slate-400">{description}</p>
    <Link
      to="/anime"
      className="kuro-btn-primary mt-4 inline-flex items-center rounded-2xl px-5 py-2 text-sm font-semibold"
    >
      Explore Anime Catalog
    </Link>
  </div>
);
