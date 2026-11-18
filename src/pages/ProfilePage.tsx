import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bookmark,
  Camera,
  Check,
  Clock,
  Cloud,
  Heart,
  LogIn,
  LogOut,
  Package,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { AdminDashboardSection } from '@/src/components/AdminDashboardSection';
import { AnimeImage } from '@/src/components/AnimeImage';
import { AvatarGalleryModal } from '@/src/components/AvatarGalleryModal';
import { ExtensionManager } from '@/src/components/ExtensionManager';
import {
  getDefaultStreamingApiBase,
  getStreamingApiBase,
  setStreamingApiOverride,
} from '@/src/config/env';
import { useAuth } from '@/src/context/AuthContext';

type ProfileTab =
  | 'continue'
  | 'watchlist'
  | 'favorites'
  | 'history'
  | 'settings'
  | 'sources'
  | 'admin';

export const ProfilePage: React.FC = () => {
  const {
    user,
    authReady,
    isGuest,
    isAdmin,
    firebaseEnabled,
    preferences,
    watchlist,
    favorites,
    history,
    openAuthModal,
    signOut,
    updatePreferences,
    removeHistoryItem,
    clearHistory,
  } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTabParam = searchParams.get('tab');
  const [tab, setTab] = useState<ProfileTab>(
    initialTabParam === 'sources' ||
      initialTabParam === 'watchlist' ||
      initialTabParam === 'favorites' ||
      initialTabParam === 'history' ||
      initialTabParam === 'settings' ||
      initialTabParam === 'admin'
      ? initialTabParam
      : 'continue'
  );
  const [nameInput, setNameInput] = useState(preferences.displayName);
  const [savedToast, setSavedToast] = useState(false);
  const [showAvatarGallery, setShowAvatarGallery] = useState(false);
  const [avatarSavedToast, setAvatarSavedToast] = useState(false);
  const [endpointInput, setEndpointInput] = useState(() => getStreamingApiBase());
  const [endpointSaved, setEndpointSaved] = useState(false);

  useEffect(() => {
    setNameInput(preferences.displayName);
  }, [preferences.displayName]);

  useEffect(() => {
    const p = searchParams.get('tab');
    if (
      p === 'sources' ||
      p === 'watchlist' ||
      p === 'favorites' ||
      p === 'history' ||
      p === 'settings' ||
      p === 'continue'
    ) {
      setTab(p);
    } else if (p === 'admin') {
      if (isAdmin) {
        setTab('admin');
      } else if (authReady) {
        setTab('continue');
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, isAdmin, authReady, setSearchParams]);

  const selectTab = (next: ProfileTab) => {
    if (next === 'admin' && !isAdmin) return;
    setTab(next);
    setSearchParams(next === 'continue' ? {} : { tab: next }, { replace: true });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    await updatePreferences({ displayName: nameInput.trim() });
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 2000);
  };

  const handleSaveAvatar = async (photoURL: string) => {
    await updatePreferences({ photoURL });
    setAvatarSavedToast(true);
    window.setTimeout(() => setAvatarSavedToast(false), 2500);
  };

  const handleSaveEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    setStreamingApiOverride(endpointInput.trim() || null);
    setEndpointSaved(true);
    window.setTimeout(() => setEndpointSaved(false), 2200);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      {/* User Header Card */}
      <section className="kuro-glass rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowAvatarGallery(true)}
              aria-label="Edit profile picture"
              className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-violet-400/35 bg-[#141726] shadow-lg shadow-violet-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <AnimeImage
                src={preferences.photoURL}
                alt={preferences.displayName}
                variant="avatar"
                className="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </span>
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-xl sm:text-2xl font-bold text-white">
                {preferences.displayName}
              </h1>
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                {user ? (
                  <>
                    <Cloud className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                    <span className="truncate">Synced via Firebase ({user.email})</span>
                  </>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>Local Guest Mode · Saved on this device</span>
                  </>
                )}
              </p>
              {avatarSavedToast && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  <span>Profile picture updated</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowAvatarGallery(true)}
              className="kuro-btn-active inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4.5 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap"
            >
              <Camera className="h-4 w-4" />
              <span>Edit Profile Picture</span>
            </button>
            {isGuest && firebaseEnabled && (
              <button
                type="button"
                onClick={openAuthModal}
                className="kuro-btn-primary inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4.5 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap"
              >
                <LogIn className="h-4 w-4" />
                <span>Sign In with Google</span>
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={signOut}
                className="kuro-btn-glass inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4.5 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Preferences Row */}
        <form
          onSubmit={handleSaveProfile}
          className="mt-6 grid grid-cols-1 gap-4 border-t border-white/[0.08] pt-5 sm:grid-cols-3"
        >
          <div>
            <label htmlFor="profile-name" className="block text-xs font-medium text-slate-400 mb-1.5">
              Display Name
            </label>
            <div className="flex gap-2">
              <input
                id="profile-name"
                type="text"
                maxLength={80}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="h-10 flex-1 rounded-xl border border-white/[0.1] bg-[#07080d]/85 px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
              />
              <button
                type="submit"
                className="kuro-btn-glass min-h-[40px] rounded-xl px-4 text-xs font-semibold"
              >
                {savedToast ? <Check className="h-4 w-4 text-emerald-400" /> : 'Save'}
              </button>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-400 mb-1.5">Default Audio</span>
            <div className="kuro-segment-track inline-flex rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => updatePreferences({ preferredAudio: 'sub' })}
                className={`min-h-[34px] rounded-lg px-3.5 py-1 text-xs font-semibold ${
                  preferences.preferredAudio === 'sub'
                    ? 'kuro-segment-active'
                    : 'kuro-segment-idle'
                }`}
              >
                Japanese
              </button>
              <button
                type="button"
                onClick={() => updatePreferences({ preferredAudio: 'dub' })}
                className={`min-h-[34px] rounded-lg px-3.5 py-1 text-xs font-semibold ${
                  preferences.preferredAudio === 'dub'
                    ? 'kuro-segment-active'
                    : 'kuro-segment-idle'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => updatePreferences({ preferredAudio: 'hindi' })}
                className={`min-h-[34px] rounded-lg px-3.5 py-1 text-xs font-semibold ${
                  preferences.preferredAudio === 'hindi'
                    ? 'kuro-segment-amber'
                    : 'kuro-segment-idle'
                }`}
              >
                Hindi
              </button>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-400 mb-1.5">Playback</span>
            <button
              type="button"
              onClick={() => updatePreferences({ autoNext: !preferences.autoNext })}
              className={`min-h-[40px] rounded-xl px-4 py-2 text-xs font-semibold ${
                preferences.autoNext ? 'kuro-btn-active' : 'kuro-btn-glass text-slate-300'
              }`}
            >
              Auto Next Episode: {preferences.autoNext ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </form>
      </section>

      {/* Library & Settings Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="kuro-segment-track flex w-full sm:w-auto gap-1 overflow-x-auto no-scrollbar rounded-2xl p-1">
          <button
            type="button"
            onClick={() => selectTab('continue')}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              tab === 'continue' ? 'kuro-segment-active' : 'kuro-segment-idle'
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            <span>Continue Watching ({history.length})</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('watchlist')}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              tab === 'watchlist' ? 'kuro-segment-active' : 'kuro-segment-idle'
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span>Watchlist ({watchlist.length})</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('favorites')}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              tab === 'favorites' ? 'kuro-segment-active' : 'kuro-segment-idle'
            }`}
          >
            <Heart className="h-3.5 w-3.5" />
            <span>Favorites ({favorites.length})</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('history')}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              tab === 'history' ? 'kuro-segment-active' : 'kuro-segment-idle'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Watch History ({history.length})</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('settings')}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              tab === 'settings' ? 'kuro-segment-active' : 'kuro-segment-idle'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>Settings</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('sources')}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              tab === 'sources' ? 'kuro-segment-active' : 'kuro-segment-idle'
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span>Sources</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => selectTab('admin')}
              className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
                tab === 'admin' ? 'kuro-segment-active' : 'kuro-segment-idle'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin Dashboard</span>
            </button>
          )}
        </div>

        {(tab === 'history' || tab === 'continue') && history.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="kuro-btn-glass inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Tab Content */}
      {(tab === 'continue' || tab === 'history') && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <EmptyLibraryState
              title="No watch history yet"
              description="Start watching any series or film and your episode progress will appear here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {history.map((item) => {
                const pct =
                  item.durationSeconds > 0
                    ? Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100))
                    : 0;
                return (
                  <div
                    key={`${item.animeId}-${item.episodeId}`}
                    className="kuro-glass flex items-center justify-between gap-4 rounded-2xl p-3.5 hover:border-violet-500/45 transition-colors"
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
                      aria-label={`Remove ${item.title} from history`}
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

      {tab === 'watchlist' && (
        <div>
          {watchlist.length === 0 ? (
            <EmptyLibraryState
              title="Your watchlist is empty"
              description="Bookmark anime series or movies while browsing to build your queue."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
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
                  <p className="text-xs text-slate-400 tabular-nums">
                    {[item.format?.replace('_', ' '), item.episodes ? `${item.episodes} Eps` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'favorites' && (
        <div>
          {favorites.length === 0 ? (
            <EmptyLibraryState
              title="No favorite anime yet"
              description="Tap Favorite on any anime detail page to keep your all-time favorites here."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
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
                  <p className="text-xs text-slate-400 tabular-nums">
                    {[
                      item.format?.replace('_', ' '),
                      item.averageScore ? `★ ${(item.averageScore / 10).toFixed(1)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <section className="kuro-glass rounded-3xl p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">Playback &amp; Streaming Settings</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Configure your streaming API provider URL and playback behavior.
            </p>
          </div>

          <form onSubmit={handleSaveEndpoint} className="space-y-3 max-w-2xl">
            <label htmlFor="streaming-endpoint" className="block text-xs font-semibold text-slate-300">
              Primary Streaming Provider Base URL
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="streaming-endpoint"
                type="url"
                value={endpointInput}
                onChange={(e) => setEndpointInput(e.target.value)}
                placeholder={getDefaultStreamingApiBase()}
                className="h-11 flex-1 rounded-xl border border-white/[0.1] bg-[#07080d]/85 px-3.5 text-sm text-white focus:border-violet-500 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="kuro-btn-primary inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl px-4.5 text-xs font-semibold"
                >
                  {endpointSaved ? <Check className="h-4 w-4" /> : null}
                  <span>{endpointSaved ? 'Saved' : 'Apply URL'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const def = getDefaultStreamingApiBase();
                    setEndpointInput(def);
                    setStreamingApiOverride(null);
                    setEndpointSaved(true);
                    window.setTimeout(() => setEndpointSaved(false), 2000);
                  }}
                  className="kuro-btn-glass inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl px-4 text-xs font-semibold"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {tab === 'sources' && <ExtensionManager />}

      {tab === 'admin' && isAdmin && <AdminDashboardSection />}

      <AvatarGalleryModal
        isOpen={showAvatarGallery}
        currentAvatarUrl={preferences.photoURL}
        displayName={preferences.displayName}
        onClose={() => setShowAvatarGallery(false)}
        onSave={handleSaveAvatar}
      />
    </div>
  );
};

const EmptyLibraryState: React.FC<{ title: string; description: string }> = ({
  title,
  description,
}) => (
  <div className="kuro-glass rounded-3xl p-12 text-center">
    <h3 className="text-base font-semibold text-white">{title}</h3>
    <p className="mt-1 text-sm text-slate-400">{description}</p>
    <Link
      to="/anime"
      className="kuro-btn-primary mt-4 inline-flex min-h-[42px] items-center rounded-2xl px-5 py-2 text-sm font-semibold"
    >
      Explore Anime
    </Link>
  </div>
);
