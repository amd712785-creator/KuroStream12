import { useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthModal } from '@/src/components/AuthModal';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { Footer } from '@/src/components/Footer';
import { MobileBottomNav } from '@/src/components/MobileBottomNav';
import { Navbar } from '@/src/components/Navbar';
import { PopupBannerModal } from '@/src/components/PopupBannerModal';
import { StartupSplashIntro } from '@/src/components/StartupSplashIntro';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { AnimeDetailPage } from '@/src/pages/AnimeDetailPage';
import { CatalogPage } from '@/src/pages/CatalogPage';
import { HomePage } from '@/src/pages/HomePage';
import { ProfilePage } from '@/src/pages/ProfilePage';
import { SchedulePage } from '@/src/pages/SchedulePage';
import { WatchPage } from '@/src/pages/WatchPage';
import {
  recordSiteVisit,
  sendPresenceHeartbeat,
  sendPresenceOfflineBeacon,
} from '@/src/services/adminService';

function PresenceTracker() {
  const { user, authReady } = useAuth();

  useEffect(() => {
    if (!authReady) return;
    const uid = user?.uid || null;
    recordSiteVisit(uid);

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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/anime"
            element={
              <CatalogPage
                key="catalog-anime"
                heading="Anime Catalog"
                subheading="Explore trending series, films, and verified Hindi dubbed anime"
              />
            }
          />
          <Route
            path="/movies"
            element={
              <CatalogPage
                key="catalog-movies"
                presetFormat="MOVIE"
                heading="Anime Movies"
                subheading="Feature-length theatrical anime films and cinema specials"
              />
            }
          />
          <Route
            path="/tv-series"
            element={
              <CatalogPage
                key="catalog-tv"
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
              <CatalogPage
                key="catalog-search"
                heading="Browse & Search"
                subheading="Filter the anime catalog by title, genre, language, format, and release status"
              />
            }
          />
          <Route path="/anime/:id" element={<AnimeDetailPage />} />
          <Route path="/watch/:id/:episodeId" element={<WatchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}

function AppShell() {
  const { user, authReady } = useAuth();
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
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-[var(--theme-bg,#07080d)] text-slate-100">
      {/* Subtle ambient violet aura behind viewport */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.16),transparent_65%)]"
      />
      <Navbar />
      <main className="relative z-10 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <AnimatedRoutes />
      </main>
      <Footer />
      <MobileBottomNav />
      <AuthModal />
      <PopupBannerModal />
      <StartupSplashIntro />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="KuroStream encountered an unexpected error">
      <BrowserRouter>
        <AuthProvider>
          <PresenceTracker />
          <AppShell />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
