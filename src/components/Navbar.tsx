import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Calendar,
  Film,
  Home,
  LogIn,
  Menu,
  Package,
  Play,
  Search,
  Tv,
  User,
  X,
} from 'lucide-react';
import { AnimeImage } from '@/src/components/AnimeImage';
import { ASSETS } from '@/src/config/env';
import { useAuth } from '@/src/context/AuthContext';
import { getDisplayTitle, searchAnime } from '@/src/services/anilistApi';
import type { AnimeSummary } from '@/src/types/anime';

export const Navbar: React.FC = () => {
  const { user, preferences, openAuthModal } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AnimeSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchAnime({ query: trimmed, perPage: 6 });
        setSuggestions(res.items);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    setShowDropdown(false);
    setMobileMenuOpen(false);
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap shrink-0 text-sm font-medium transition-colors py-1.5 border-b-2 ${
      isActive
        ? 'text-white border-violet-500'
        : 'text-slate-300 border-transparent hover:text-white'
    }`;

  const hasCustomAvatar =
    Boolean(preferences.photoURL) && preferences.photoURL !== ASSETS.defaultAvatar;

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#07080d]/80 backdrop-blur-2xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:gap-8">
        {/* Brand Zone */}
        <Link
          to="/"
          className="group flex items-center gap-2.5 sm:gap-3 whitespace-nowrap shrink-0 select-none"
          aria-label="KuroStream Home"
        >
          <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-violet-400/30 bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600 text-white shadow-[0_0_20px_-2px_rgba(147,51,234,0.6)] transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_26px_0px_rgba(168,85,247,0.75)] group-active:scale-95">
            <Play className="h-4 w-4 sm:h-4.5 sm:w-4.5 translate-x-0.5 fill-current" />
          </span>
          <span className="font-display text-xl sm:text-2xl font-black tracking-[-0.02em] leading-none drop-shadow-[0_0_16px_rgba(168,85,247,0.45)] transition-all duration-300 group-hover:drop-shadow-[0_0_24px_rgba(168,85,247,0.65)]">
            <span className="text-white">Kuro</span>
            <span className="bg-gradient-to-r from-violet-400 via-purple-300 to-fuchsia-400 bg-clip-text text-transparent">Stream</span>
          </span>
        </Link>

        {/* Desktop Nav Zone */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/anime" className={navLinkClass}>
            Anime
          </NavLink>
          <NavLink to="/movies" className={navLinkClass}>
            Movies
          </NavLink>
          <NavLink to="/tv-series" className={navLinkClass}>
            TV Series
          </NavLink>
          <NavLink to="/schedule" className={navLinkClass}>
            Schedule
          </NavLink>
        </nav>

        {/* Search + Profile / Menu Action Zone */}
        <div className="flex flex-1 items-center justify-end gap-2.5 sm:gap-3 min-w-0">
          <div ref={searchContainerRef} className="relative w-full max-w-xs lg:max-w-sm hidden sm:block">
            <form onSubmit={handleSubmit} className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search anime..."
                aria-label="Search anime titles"
                className="h-10 w-full rounded-2xl border border-white/[0.1] bg-white/[0.04] pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-violet-500/70 focus:bg-[#10121e] focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </form>

            {showDropdown && query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0e101a]/95 shadow-2xl backdrop-blur-2xl">
                {searching ? (
                  <div className="px-4 py-3 text-xs text-slate-400">Searching catalog...</div>
                ) : suggestions.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400">
                    No matching anime found. Press Enter for full search.
                  </div>
                ) : (
                  <ul className="divide-y divide-white/[0.06]">
                    {suggestions.map((anime) => {
                      const title = getDisplayTitle(anime.title);
                      return (
                        <li key={anime.id}>
                          <Link
                            to={`/anime/${anime.id}`}
                            onClick={() => setShowDropdown(false)}
                            className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/[0.06] transition-colors"
                          >
                            <AnimeImage
                              src={anime.coverImage?.medium || anime.coverImage?.large}
                              alt={title}
                              className="h-12 w-9 shrink-0 rounded-lg object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-100">{title}</p>
                              <p className="truncate text-xs text-slate-400 tabular-nums">
                                {[
                                  anime.format?.replace('_', ' '),
                                  anime.seasonYear,
                                  anime.episodes ? `${anime.episodes} Eps` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                    <li>
                      <button
                        type="button"
                        onClick={handleSubmit}
                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-violet-400 hover:bg-white/[0.04] transition-colors"
                      >
                        View all results for &ldquo;{query.trim()}&rdquo;
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            )}
          </div>

          {user ? (
            <Link
              to="/profile"
              aria-label="Open profile"
              className="kuro-btn-glass flex min-h-[40px] items-center gap-2 rounded-2xl px-2.5 py-1.5 text-sm font-medium whitespace-nowrap shrink-0"
            >
              <AnimeImage
                src={preferences.photoURL}
                alt={preferences.displayName}
                variant="avatar"
                className="h-6 w-6 rounded-full object-cover object-top ring-1 ring-violet-400/50"
              />
              <span className="hidden lg:inline max-w-[110px] truncate">
                {preferences.displayName}
              </span>
            </Link>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/profile"
                aria-label="Profile avatar and library"
                className="kuro-btn-glass inline-flex min-h-[40px] items-center gap-2 rounded-2xl px-2.5 py-1.5 text-sm font-medium whitespace-nowrap shrink-0"
              >
                {hasCustomAvatar ? (
                  <AnimeImage
                    src={preferences.photoURL}
                    alt={preferences.displayName}
                    variant="avatar"
                    className="h-6 w-6 rounded-full object-cover object-top ring-1 ring-violet-400/50"
                  />
                ) : (
                  <User className="h-4 w-4 text-violet-300" />
                )}
                <span className="hidden lg:inline">Profile</span>
              </Link>
              <button
                type="button"
                onClick={openAuthModal}
                className="kuro-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 sm:text-sm"
              >
                <LogIn className="h-3.5 w-3.5 sm:hidden" />
                <span>Sign In</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="kuro-btn-glass flex h-10 w-10 items-center justify-center rounded-2xl md:hidden shrink-0"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Glass Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-white/[0.08] bg-[#0a0b13]/95 px-4 py-4 backdrop-blur-2xl md:hidden">
          <form onSubmit={handleSubmit} className="relative mb-3 sm:hidden">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anime titles..."
              aria-label="Search anime titles"
              className="h-11 w-full rounded-2xl border border-white/[0.1] bg-white/[0.05] pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </form>
          <nav className="grid grid-cols-2 gap-2.5" aria-label="Quick navigation menu">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="kuro-btn-glass flex min-h-[46px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-medium"
            >
              <Home className="h-4 w-4 text-violet-300" />
              <span>Home</span>
            </Link>
            <Link
              to="/anime"
              onClick={() => setMobileMenuOpen(false)}
              className="kuro-btn-glass flex min-h-[46px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-medium"
            >
              <Film className="h-4 w-4 text-violet-300" />
              <span>Anime</span>
            </Link>
            <Link
              to="/movies"
              onClick={() => setMobileMenuOpen(false)}
              className="kuro-btn-glass flex min-h-[46px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-medium"
            >
              <Film className="h-4 w-4 text-violet-300" />
              <span>Movies</span>
            </Link>
            <Link
              to="/tv-series"
              onClick={() => setMobileMenuOpen(false)}
              className="kuro-btn-glass flex min-h-[46px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-medium"
            >
              <Tv className="h-4 w-4 text-violet-300" />
              <span>TV Series</span>
            </Link>
            <Link
              to="/schedule"
              onClick={() => setMobileMenuOpen(false)}
              className="kuro-btn-glass flex min-h-[46px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-medium"
            >
              <Calendar className="h-4 w-4 text-violet-300" />
              <span>Schedule</span>
            </Link>
            <Link
              to="/profile?tab=watchlist"
              onClick={() => setMobileMenuOpen(false)}
              className="kuro-btn-glass flex min-h-[46px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-medium"
            >
              <Bookmark className="h-4 w-4 text-violet-300" />
              <span>Watchlist</span>
            </Link>
            <Link
              to="/profile?tab=sources"
              onClick={() => setMobileMenuOpen(false)}
              className="kuro-btn-glass col-span-2 flex min-h-[46px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-medium"
            >
              <Package className="h-4 w-4 text-violet-300" />
              <span>Sources &amp; Extensions</span>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
};
