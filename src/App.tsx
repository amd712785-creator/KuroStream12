import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppUpdateModal } from '@/src/components/AppUpdateModal';
import { AuthModal } from '@/src/components/AuthModal';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { Footer } from '@/src/components/Footer';
import { LoginVpnNoticeModal } from '@/src/components/LoginVpnNoticeModal';
import { MobileBottomNav } from '@/src/components/MobileBottomNav';
import { Navbar } from '@/src/components/Navbar';
import { StartupSplashIntro } from '@/src/components/StartupSplashIntro';
import { LevelUpModal } from '@/src/components/UserLevelXpSection';
import { ASSETS } from '@/src/config/env';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { LoadingThemeProvider } from '@/src/context/LoadingThemeContext';
import { NotificationProvider } from '@/src/context/NotificationContext';
import { ServerProvider } from '@/src/context/ServerContext';
import { DynamicLoadingScreen } from '@/src/components/DynamicLoadingScreen';
import { resolveLoadingArtworkForPath } from '@/src/services/dynamicLoadingService';
import { useAppFullscreen } from '@/src/services/fullscreenBridge';
import { HomePage } from '@/src/pages/HomePage';
import {
  recordSiteVisit,
  sendPresenceHeartbeat,
  sendPresenceOfflineBeacon,
} from '@/src/services/adminService';

const PopupBannerModal = lazy(() =>
  import('@/src/components/PopupBannerModal').then((m) => ({ default: m.PopupBannerModal }))
);
const AnimeDetailPage = lazy(() =>
  import('@/src/pages/AnimeDetailPage').then((m) => ({ default: m.AnimeDetailPage }))
);
const AnimeWorldBrowsePage = lazy(() =>
  import('@/src/pages/AnimeWorldBrowsePage').then((m) => ({ default: m.AnimeWorldBrowsePage }))
);
const AnimeWorldSeriesPage = lazy(() =>
  import('@/src/pages/AnimeWorldSeriesPage').then((m) => ({ default: m.AnimeWorldSeriesPage }))
);
const AnimeWorldWatchPage = lazy(() =>
  import('@/src/pages/AnimeWorldWatchPage').then((m) => ({ default: m.AnimeWorldWatchPage }))
);
const ProfilePage = lazy(() =>
  import('@/src/pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const ProfileEditPage = lazy(() =>
  import('@/src/pages/ProfileEditPage').then((m) => ({ default: m.ProfileEditPage }))
);
const SchedulePage = lazy(() =>
  import('@/src/pages/SchedulePage').then((m) => ({ default: m.SchedulePage }))
);
const ServerCatalogPage = lazy(() =>
  import('@/src/pages/ServerCatalogPage').then((m) => ({ default: m.ServerCatalogPage }))
);
const SettingsPage = lazy(() =>
  import('@/src/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const NotificationsPage = lazy(() =>
  import('@/src/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const CommunityPage = lazy(() =>
  import('@/src/pages/CommunityPage').then((m) => ({ default: m.CommunityPage }))
);
const WatchPage = lazy(() =>
  import('@/src/pages/WatchPage').then((m) => ({ default: m.WatchPage }))
);
const CharacterDatabasePage = lazy(() =>
  import('@/src/pages/CharacterDatabasePage').then((m) => ({ default: m.CharacterDatabasePage }))
);
const CharacterDetailPage = lazy(() =>
  import('@/src/pages/CharacterDetailPage').then((m) => ({ default: m.CharacterDetailPage }))
);

function RouteLoadingFallback() {
  const location = useLocation();
  const artwork = resolveLoadingArtworkForPath(location.pathname);
  return (
    <div className="relative mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center overflow-hidden rounded-3xl px-4 py-12">
      <DynamicLoadingScreen
        mode="embedded"
        backgroundImage={artwork}
        message="Preparing KuroStream..."
        subMessage="Loading view & media assets"
      />
    </div>
  );
}

function PresenceTracker() {
  const { user, authReady } = useAuth();

  useEffect(() => {
    if (!authReady) return;
    const uid = user?.uid || null;
    const visitTimer = window.setTimeout(() => {
      recordSiteVisit(uid);
    }, 1500);

    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        sendPresenceHeartbeat(uid);
      }
    }, 25_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendPresenceHeartbeat(uid);
      }
    };

    const handlePageHide = () => {
      sendPresenceOfflineBeacon();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.clearTimeout(visitTimer);
      window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [authReady, user?.uid]);

  return null;
}

function AnimatedRoutes() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ErrorBoundary
      resetKey={`${location.pathname}${location.search}`}
      onResetHome={() => navigate('/', { replace: true })}
      fallbackTitle="Unable to display this page"
    >
      <div className="kuro-page-enter">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/anime"
              element={
                <ServerCatalogPage
                  key="catalog-anime"
                  animeWorldDefaultTab="home"
                  heading="Anime Catalog"
                  subheading="Explore trending series, films, and verified Hindi dubbed anime"
                />
              }
            />
            <Route
              path="/movies"
              element={
                <ServerCatalogPage
                  key="catalog-movies"
                  animeWorldDefaultTab="movies"
                  presetFormat="MOVIE"
                  heading="Anime Movies"
                  subheading="Feature-length theatrical anime films and cinema specials"
                />
              }
            />
            <Route
              path="/tv-series"
              element={
                <ServerCatalogPage
                  key="catalog-tv"
                  animeWorldDefaultTab="series"
                  presetFormat="TV"
                  heading="Anime TV Series"
                  subheading="Episodic anime series from classic arcs to current simulcasts"
                />
              }
            />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route
              path="/search"
              element={
                <ServerCatalogPage
                  key="catalog-search"
                  animeWorldDefaultTab="search"
                  heading="Browse & Search"
                  subheading="Filter the anime catalog by title, genre, language, format, and release status"
                />
              }
            />
            <Route path="/anime/:id" element={<AnimeDetailPage />} />
            <Route path="/watch/:id/:episodeId" element={<WatchPage />} />
            <Route path="/animeworld-india" element={<AnimeWorldBrowsePage />} />
            <Route path="/animeworld-india/series/:seriesId" element={<AnimeWorldSeriesPage />} />
            <Route path="/animeworld-india/watch/:kind/:contentId" element={<AnimeWorldWatchPage />} />
            <Route path="/characters" element={<CharacterDatabasePage />} />
            <Route path="/characters/:characterKey" element={<CharacterDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/edit" element={<ProfileEditPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}

function AppShell() {
  const { user, authReady, showLoginVpnNotice, dismissLoginVpnNotice } = useAuth();
  const appFullscreen = useAppFullscreen();
  const navigate = useNavigate();
  const wasUnauthenticatedRef = useRef(false);

  const isAuthenticated = Boolean(user && user.emailVerified);

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) {
      wasUnauthenticatedRef.current = true;
    } else if (wasUnauthenticatedRef.current) {
      wasUnauthenticatedRef.current = false;
      navigate('/', { replace: true });
    }
  }, [authReady, isAuthenticated, navigate]);

  if (!authReady) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#07080d] text-slate-100">
        <StartupSplashIntro />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07080d] text-slate-100">
        <AuthModal mandatory />
        <StartupSplashIntro />
      </div>
    );
  }

  return (
    <div
      className={`relative flex min-h-screen flex-col overflow-x-clip text-slate-100 ${
        appFullscreen ? 'bg-black' : 'bg-[var(--theme-bg,#07080d)]'
      }`}
    >
      {/* Subtle ambient violet aura behind viewport */}
      {!appFullscreen && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.16),transparent_65%)]"
        />
      )}
      {!appFullscreen && <Navbar />}
      <main
        className={`flex-1 ${
          appFullscreen
            ? 'p-0'
            : 'relative pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8'
        }`}
      >
        <AnimatedRoutes />
      </main>
      {!appFullscreen && <Footer />}
      {!appFullscreen && <MobileBottomNav />}
      <AuthModal />
      <AppUpdateModal />
      <LevelUpModal />
      <LoginVpnNoticeModal open={showLoginVpnNotice} onDismiss={dismissLoginVpnNotice} />
      <Suspense fallback={null}>
        <PopupBannerModal />
      </Suspense>
      <StartupSplashIntro />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="KuroStream encountered an unexpected error">
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <ServerProvider>
              <LoadingThemeProvider>
                <PresenceTracker />
                <AppShell />
              </LoadingThemeProvider>
            </ServerProvider>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
