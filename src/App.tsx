import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthModal } from '@/src/components/AuthModal';
import { Footer } from '@/src/components/Footer';
import { MobileBottomNav } from '@/src/components/MobileBottomNav';
import { Navbar } from '@/src/components/Navbar';
import { PopupBannerModal } from '@/src/components/PopupBannerModal';
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
  return (
    <div key={location.pathname} className="kuro-page-enter">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/anime"
          element={
            <CatalogPage
              heading="Anime Catalog"
              subheading="Explore trending series, films, and verified Hindi dubbed anime"
            />
          }
        />
        <Route
          path="/movies"
          element={
            <CatalogPage
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
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PresenceTracker />
        <div className="relative flex min-h-screen flex-col overflow-x-clip bg-[#07080d] text-slate-100">
          {/* Subtle ambient violet aura behind viewport */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.16),transparent_65%)]"
          />
          <Navbar />
          <main className="relative z-10 flex-1 pb-24">
            <AnimatedRoutes />
          </main>
          <Footer />
          <MobileBottomNav />
          <AuthModal />
          <PopupBannerModal />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

