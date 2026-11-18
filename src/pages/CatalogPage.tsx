import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Filter, Languages, Search, X } from 'lucide-react';
import { AnimeCard } from '@/src/components/AnimeCard';
import { ANIME_GENRES, searchAnime } from '@/src/services/anilistApi';
import { isHindiDubbedAnime, VERIFIED_HINDI_DUBBED_ID_LIST } from '@/src/services/hindiAnime';
import type { AnimeSummary } from '@/src/types/anime';

interface CatalogPageProps {
  presetFormat?: 'MOVIE' | 'TV';
  heading: string;
  subheading: string;
}

type LanguageFilter = 'ALL' | 'hindi' | 'original';

export const CatalogPage: React.FC<CatalogPageProps> = ({
  presetFormat,
  heading,
  subheading,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery = searchParams.get('q') || '';
  const initialGenre = searchParams.get('genre') || 'ALL';
  const initialFormat = presetFormat || searchParams.get('format') || 'ALL';
  const initialStatus = searchParams.get('status') || 'ALL';
  const initialLang = (searchParams.get('lang') as LanguageFilter) || 'ALL';
  const initialSort =
    searchParams.get('sort') || (initialQuery ? 'SEARCH_MATCH' : 'TRENDING_DESC');
  const initialPage = Math.max(1, Number(searchParams.get('page') || 1));

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [genre, setGenre] = useState(initialGenre);
  const [format, setFormat] = useState(initialFormat);
  const [status, setStatus] = useState(initialStatus);
  const [language, setLanguage] = useState<LanguageFilter>(
    initialLang === 'hindi' || initialLang === 'original' ? initialLang : 'ALL'
  );
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(initialPage);

  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    const langParam = searchParams.get('lang');
    setQueryInput(q);
    setDebouncedQuery(q);
    setGenre(searchParams.get('genre') || 'ALL');
    setFormat(presetFormat || searchParams.get('format') || 'ALL');
    setStatus(searchParams.get('status') || 'ALL');
    setLanguage(
      langParam === 'hindi' || langParam === 'original' ? langParam : 'ALL'
    );
    setSort(searchParams.get('sort') || (q ? 'SEARCH_MATCH' : 'TRENDING_DESC'));
    setPage(Math.max(1, Number(searchParams.get('page') || 1)));
  }, [presetFormat, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(queryInput);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchAnime({
          query: debouncedQuery,
          genre,
          format: presetFormat || format,
          status,
          sort,
          idIn: language === 'hindi' ? VERIFIED_HINDI_DUBBED_ID_LIST : undefined,
          page,
          perPage: 24,
        });
        if (!active) return;
        setItems(res.items);
        setHasNextPage(res.hasNextPage);
        setTotal(res.total);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to search catalog.');
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [debouncedQuery, genre, format, presetFormat, status, language, sort, page]);

  const displayedItems = useMemo(() => {
    if (language === 'original') {
      return items.filter((item) => !isHindiDubbedAnime(item));
    }
    return items;
  }, [items, language]);

  const updateUrlParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (!v || v === 'ALL') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setQueryInput('');
    setDebouncedQuery('');
    setGenre('ALL');
    setFormat(presetFormat || 'ALL');
    setStatus('ALL');
    setLanguage('ALL');
    setSort('TRENDING_DESC');
    setPage(1);
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {heading}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">{subheading}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Verified Hindi Dubbed Toggle */}
          <div className="kuro-segment-track inline-flex rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => {
                setLanguage('ALL');
                setPage(1);
                updateUrlParam({ lang: null, page: null });
              }}
              className={`min-h-[36px] rounded-lg px-3.5 text-xs font-semibold whitespace-nowrap ${
                language === 'ALL' ? 'kuro-segment-active' : 'kuro-segment-idle'
              }`}
            >
              All Audio
            </button>
            <button
              type="button"
              onClick={() => {
                setLanguage('hindi');
                setPage(1);
                updateUrlParam({ lang: 'hindi', page: null });
              }}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold whitespace-nowrap ${
                language === 'hindi' ? 'kuro-segment-amber' : 'kuro-segment-idle'
              }`}
            >
              <Languages className="h-3.5 w-3.5" />
              <span>Hindi Dubbed</span>
            </button>
          </div>

          {!loading && (
            <p className="text-xs font-medium text-slate-400 tabular-nums">
              {(language === 'original' ? displayedItems.length : total).toLocaleString()} titles
            </p>
          )}
        </div>
      </div>

      {/* Glass Filter Bar */}
      <div className="kuro-glass rounded-3xl p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={queryInput}
              onChange={(e) => {
                setQueryInput(e.target.value);
                setPage(1);
                updateUrlParam({ q: e.target.value || null, page: null });
              }}
              placeholder="Search anime title..."
              aria-label="Filter by title"
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#07080d]/85 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <select
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              setPage(1);
              updateUrlParam({ genre: e.target.value, page: null });
            }}
            aria-label="Filter by genre"
            className="h-11 rounded-xl border border-white/[0.1] bg-[#07080d]/85 px-3 text-sm text-slate-200 focus:border-violet-500 focus:outline-none"
          >
            <option value="ALL">All Genres</option>
            {ANIME_GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={language}
            onChange={(e) => {
              const val = e.target.value as LanguageFilter;
              setLanguage(val);
              setPage(1);
              updateUrlParam({ lang: val === 'ALL' ? null : val, page: null });
            }}
            aria-label="Filter by audio language"
            className="h-11 rounded-xl border border-white/[0.1] bg-[#07080d]/85 px-3 text-sm text-slate-200 focus:border-violet-500 focus:outline-none"
          >
            <option value="ALL">All Languages</option>
            <option value="hindi">Hindi Dubbed (Verified)</option>
            <option value="original">Japanese / English</option>
          </select>

          {!presetFormat && (
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setPage(1);
                updateUrlParam({ format: e.target.value, page: null });
              }}
              aria-label="Filter by type"
              className="h-11 rounded-xl border border-white/[0.1] bg-[#07080d]/85 px-3 text-sm text-slate-200 focus:border-violet-500 focus:outline-none"
            >
              <option value="ALL">All Formats</option>
              <option value="TV">TV Series</option>
              <option value="MOVIE">Movies</option>
              <option value="OVA">OVA</option>
              <option value="ONA">ONA</option>
              <option value="SPECIAL">Special</option>
            </select>
          )}

          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
                updateUrlParam({ status: e.target.value, page: null });
              }}
              aria-label="Filter by status"
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#07080d]/85 px-3 text-sm text-slate-200 focus:border-violet-500 focus:outline-none"
            >
              <option value="ALL">All Status</option>
              <option value="RELEASING">Airing</option>
              <option value="FINISHED">Completed</option>
              <option value="NOT_YET_RELEASED">Upcoming</option>
            </select>

            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
                updateUrlParam({ sort: e.target.value, page: null });
              }}
              aria-label="Sort results"
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#07080d]/85 px-3 text-sm text-slate-200 focus:border-violet-500 focus:outline-none"
            >
              <option value="TRENDING_DESC">Trending</option>
              <option value="POPULARITY_DESC">Popular</option>
              <option value="SCORE_DESC">Top Rated</option>
              <option value="START_DATE_DESC">Newest</option>
              {debouncedQuery && <option value="SEARCH_MATCH">Best Match</option>}
            </select>

            <button
              type="button"
              onClick={resetFilters}
              title="Reset filters"
              aria-label="Reset filters"
              className="kuro-btn-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="kuro-glass rounded-2xl border-rose-500/30 bg-rose-500/10 p-6 text-center text-sm text-rose-200">
          {error}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2.5">
              <div className="aspect-[2/3] w-full animate-pulse rounded-2xl bg-[#121420]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-[#121420]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#121420]" />
            </div>
          ))}
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="kuro-glass flex flex-col items-center justify-center rounded-3xl py-16 text-center px-4">
          <Filter className="h-8 w-8 text-violet-400" />
          <h2 className="mt-3 text-lg font-semibold text-white">No matching anime found</h2>
          <p className="mt-1 text-sm text-slate-400">
            Try clearing one or more filters to broaden your search.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="kuro-btn-primary mt-5 min-h-[44px] rounded-2xl px-5 py-2.5 text-sm font-semibold"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
            {displayedItems.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} showHindiBadge />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                const next = Math.max(1, page - 1);
                setPage(next);
                updateUrlParam({ page: String(next) });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="kuro-btn-glass inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>
            <span className="font-mono text-sm text-slate-400 tabular-nums">Page {page}</span>
            <button
              type="button"
              disabled={!hasNextPage}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                updateUrlParam({ page: String(next) });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="kuro-btn-glass inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
