import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  ChevronRight,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { AnimeImage } from '@/src/components/AnimeImage';
import { CharacterGridSkeleton } from '@/src/components/LoadingSkeletons';
import { DynamicLoadingScreen } from '@/src/components/DynamicLoadingScreen';
import { useAuth } from '@/src/context/AuthContext';
import {
  searchCharacterDatabase,
  getRecentlyViewedCharacters,
} from '@/src/services/characterDatabaseService';
import { registerLoadingArtwork } from '@/src/services/dynamicLoadingService';
import type { CharacterProfile, CharacterRoleFilter } from '@/src/types/anime';

const POPULAR_ANIME_FILTER_OPTIONS = [
  'All Anime',
  'Naruto',
  'One Piece',
  'Dragon Ball',
  'Demon Slayer',
  'Jujutsu Kaisen',
  'Attack on Titan',
  'Blue Lock',
  'Solo Leveling',
  'Bleach',
  'Chainsaw Man',
  'My Hero Academia',
  'Hunter x Hunter',
  'Death Note',
  'Spy x Family',
];

export const CharacterDatabasePage: React.FC = () => {
  const { user, favoriteCharacters, isFavoriteCharacter, toggleFavoriteCharacter } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [animeFilter, setAnimeFilter] = useState('All Anime');
  const [roleFilter, setRoleFilter] = useState<CharacterRoleFilter>('ALL');
  const [sortOption, setSortOption] = useState<'POPULARITY' | 'ALPHABETICAL'>('POPULARITY');

  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [recentlyViewed, setRecentlyViewed] = useState<CharacterProfile[]>([]);

  useEffect(() => {
    setRecentlyViewed(getRecentlyViewedCharacters(user?.uid));
  }, [user?.uid]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const fetchCharacters = useCallback(async (reset = false) => {
    const targetPage = reset ? 1 : page;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const res = await searchCharacterDatabase({
        search: debouncedQuery,
        animeTitle: animeFilter === 'All Anime' ? undefined : animeFilter,
        roleFilter,
        sort: sortOption,
        page: targetPage,
        perPage: 24,
      });

      setCharacters((prev) => (reset ? res.characters : [...prev, ...res.characters]));
      setHasNextPage(res.hasNextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load character database.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedQuery, animeFilter, roleFilter, sortOption, page]);

  useEffect(() => {
    fetchCharacters(true);
  }, [debouncedQuery, animeFilter, roleFilter, sortOption]);

  const handleLoadMore = () => {
    if (loadingMore || !hasNextPage) return;
    setPage((p) => p + 1);
  };

  useEffect(() => {
    if (page > 1) {
      fetchCharacters(false);
    }
  }, [page]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      {/* Header Banner */}
      <div className="kuro-glass relative overflow-hidden rounded-3xl p-6 sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-600/25 blur-3xl"
        />
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-200 backdrop-blur-md">
              <Users className="h-3.5 w-3.5 text-violet-300" />
              <span>Official Character Database</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            Anime Character Encyclopedia
          </h1>
          <p className="max-w-2xl text-xs sm:text-sm text-slate-300">
            Explore verified character biographies, abilities, voice actors, and anime appearances.
          </p>
        </div>
      </div>

      {/* Recently Viewed Strip */}
      {recentlyViewed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-violet-400 px-1">
            Recently Viewed Characters
          </h2>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {recentlyViewed.map((ch) => (
              <Link
                key={`recent-${ch.key}`}
                to={`/characters/${encodeURIComponent(ch.key)}`}
                onClick={() => registerLoadingArtwork(`/characters/${ch.key}`, ch.imageUrl, ch.name)}
                className="kuro-glass group flex shrink-0 items-center gap-3 rounded-2xl p-2 pr-4 hover:border-violet-500/50 transition-all duration-200"
              >
                <AnimeImage
                  src={ch.imageUrl}
                  alt={ch.name}
                  className="h-12 w-12 rounded-xl object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white group-hover:text-violet-300">
                    {ch.name}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    {ch.animeTitle || 'Anime'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Search & Filters Bar */}
      <div className="kuro-glass rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search characters by name, ability, or biography..."
              aria-label="Search characters"
              className="h-11 w-full rounded-2xl border border-white/[0.1] bg-[#07080d]/85 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <SlidersHorizontal className="h-4 w-4 text-violet-400" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as 'POPULARITY' | 'ALPHABETICAL')}
              aria-label="Sort characters"
              className="h-11 rounded-2xl border border-white/[0.1] bg-[#07080d]/85 px-3.5 text-xs font-semibold text-slate-200 focus:border-violet-500 focus:outline-none"
            >
              <option value="POPULARITY">Most Popular</option>
              <option value="ALPHABETICAL">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Role Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.08]">
          <span className="text-xs font-semibold text-slate-400 mr-2">Role:</span>
          {(['ALL', 'MAIN', 'SUPPORTING', 'VILLAIN'] as CharacterRoleFilter[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                roleFilter === r
                  ? 'bg-violet-600 text-white shadow-[0_0_16px_rgba(139,92,246,0.45)]'
                  : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
              }`}
            >
              {r === 'ALL' ? 'All Roles' : r.charAt(0) + r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Anime Title Filter Selector */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
          <span className="text-xs font-semibold text-slate-400 shrink-0 mr-1">Anime:</span>
          {POPULAR_ANIME_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setAnimeFilter(opt)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                animeFilter === opt
                  ? 'border border-violet-400/50 bg-violet-500/25 text-white'
                  : 'border border-white/[0.08] bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Character Grid Results */}
      {error ? (
        <div className="kuro-glass rounded-3xl border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <h2 className="text-lg font-bold text-white">Failed to load characters</h2>
          <p className="mt-2 text-sm text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => fetchCharacters(true)}
            className="kuro-btn-primary mt-4 inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Retry</span>
          </button>
        </div>
      ) : loading ? (
        <CharacterGridSkeleton count={18} />
      ) : characters.length === 0 ? (
        <div className="kuro-glass rounded-3xl p-12 text-center text-slate-400">
          <Users className="mx-auto h-12 w-12 text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-white">No characters found</h3>
          <p className="mt-1 text-sm">Try adjusting your search query or filter options.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {characters.map((ch) => {
              const favorited = isFavoriteCharacter(ch.key);
              return (
                <div
                  key={ch.key}
                  className="kuro-glass group relative flex flex-col overflow-hidden rounded-2xl p-2.5 transition-all duration-300 hover:border-violet-500/50 hover:shadow-[0_12px_32px_-10px_rgba(139,92,246,0.4)]"
                >
                  <Link
                    to={`/characters/${encodeURIComponent(ch.key)}`}
                    onClick={() => registerLoadingArtwork(`/characters/${ch.key}`, ch.imageUrl, ch.name)}
                    className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[#12101f]"
                  >
                    <AnimeImage
                      src={ch.imageUrl}
                      alt={ch.name}
                      className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-90" />
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-violet-600/85 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                      <span>{ch.role}</span>
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleFavoriteCharacter(ch);
                    }}
                    aria-label={favorited ? 'Remove from favorite characters' : 'Add to favorite characters'}
                    className={`absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-xl backdrop-blur-md transition-transform active:scale-95 ${
                      favorited
                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/50'
                        : 'bg-black/50 text-white hover:bg-black/70'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${favorited ? 'fill-current' : ''}`} />
                  </button>

                  <div className="mt-2.5 min-w-0 flex-1 flex flex-col justify-between">
                    <Link
                      to={`/characters/${encodeURIComponent(ch.key)}`}
                      onClick={() => registerLoadingArtwork(`/characters/${ch.key}`, ch.imageUrl, ch.name)}
                    >
                      <p className="truncate text-xs sm:text-sm font-bold text-white group-hover:text-violet-300 transition-colors">
                        {ch.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {ch.animeTitle || 'Anime'}
                      </p>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {hasNextPage && (
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="kuro-btn-glass inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-violet-300" />}
                <span>Load More Characters</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
