import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Globe, Server } from 'lucide-react';
import { useServer } from '@/src/context/ServerContext';

interface ServerSelectorProps {
  variant?: 'cards' | 'compact';
  showQuickLinks?: boolean;
}

export const ServerSelector: React.FC<ServerSelectorProps> = ({
  variant = 'cards',
  showQuickLinks = true,
}) => {
  const { activeServer, setActiveServer } = useServer();
  const isGlobal = activeServer === 'kurostream-global';
  const isAnimeWorld = activeServer === 'animeworld-india';

  if (variant === 'compact') {
    return (
      <section
        aria-label="Server Selector"
        className="kuro-glass flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isGlobal ? (
              <Globe className="h-4 w-4 shrink-0 text-violet-300" />
            ) : (
              <Server className="h-4 w-4 shrink-0 text-amber-300" />
            )}
            <h2 className="text-sm font-bold text-white">Streaming Server</h2>
            <span
              className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
                isGlobal
                  ? 'border-violet-400/40 bg-violet-500/20 text-violet-200'
                  : 'border-amber-400/40 bg-amber-500/20 text-amber-200'
              }`}
            >
              Active: {isGlobal ? 'KuroStream Global' : 'AnimeWorld India'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {isGlobal
              ? 'Showing KuroStream Global (Default · AniList & Global multi-server)'
              : 'Showing AnimeWorld India (Manual Selection · Hindi Dub & Multi-Audio)'}
          </p>
        </div>

        <div className="kuro-segment-track inline-flex flex-wrap items-center gap-1.5 rounded-2xl p-1">
          <button
            type="button"
            onClick={() => setActiveServer('kurostream-global')}
            aria-pressed={isGlobal}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              isGlobal ? 'kuro-segment-active' : 'kuro-segment-idle'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>KuroStream Global</span>
            {isGlobal && (
              <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                Default
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveServer('animeworld-india')}
            aria-pressed={isAnimeWorld}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              isAnimeWorld ? 'kuro-segment-amber' : 'kuro-segment-idle'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>AnimeWorld India</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Streaming Servers" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Streaming Servers
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold ${
                isGlobal
                  ? 'border-violet-400/40 bg-violet-500/20 text-violet-200'
                  : 'border-amber-400/40 bg-amber-500/20 text-amber-200'
              }`}
            >
              {isGlobal ? <Globe className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
              <span>Active: {isGlobal ? 'KuroStream Global' : 'AnimeWorld India'}</span>
            </span>
          </div>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
            KuroStream Global is active by default — switch manually to AnimeWorld India anytime
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Primary Default Server: KuroStream Global */}
        <div
          className={`relative overflow-hidden rounded-3xl p-5 transition-all duration-200 ${
            isGlobal
              ? 'kuro-glass-elevated border-violet-400/55 shadow-[0_14px_34px_-12px_rgba(124,58,237,0.4)]'
              : 'kuro-glass border-violet-400/20 hover:border-violet-400/45'
          }`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-violet-500/15 blur-2xl"
          />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-600/20 text-violet-300">
                <Globe className="h-6 w-6" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    KuroStream Global
                  </h3>
                  <span className="text-xs font-semibold text-violet-300">
                    {isGlobal ? '· Active · Default Server' : '· Default Server'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Vidstreaming, Megacloud, Streamsb, AnimePahe, AniWatchTV, HiAnime, Kaido &amp; Munchyroll for SUB &amp; English DUB.
                </p>
              </div>
            </div>

            {isGlobal ? (
              <span className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-violet-400/40 bg-violet-500/20 px-4 py-2 text-xs sm:text-sm font-semibold text-violet-200">
                <CheckCircle2 className="h-4 w-4" />
                <span>Selected</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setActiveServer('kurostream-global')}
                className="kuro-btn-primary inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 py-2 text-xs sm:text-sm font-semibold"
              >
                <span>Switch to Default</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {showQuickLinks && (
            <div className="relative z-10 mt-3.5 flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
              <Link
                to="/anime"
                onClick={() => setActiveServer('kurostream-global')}
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Catalog
              </Link>
              <Link
                to="/tv-series"
                onClick={() => setActiveServer('kurostream-global')}
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                TV Series
              </Link>
              <Link
                to="/movies"
                onClick={() => setActiveServer('kurostream-global')}
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Movies
              </Link>
              <Link
                to="/search"
                onClick={() => setActiveServer('kurostream-global')}
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Search
              </Link>
            </div>
          )}
        </div>

        {/* Manual Selection Server: AnimeWorld India */}
        <div
          className={`relative overflow-hidden rounded-3xl p-5 transition-all duration-200 ${
            isAnimeWorld
              ? 'kuro-glass-elevated border-amber-400/55 shadow-[0_14px_34px_-12px_rgba(245,158,11,0.3)]'
              : 'kuro-glass hover:border-amber-400/45'
          }`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-500/15 blur-2xl"
          />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/35 bg-amber-500/20 text-amber-300">
                <Server className="h-6 w-6" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    AnimeWorld India
                  </h3>
                  <span className="text-xs font-semibold text-amber-300">
                    {isAnimeWorld ? '· Active Server' : '· Manual Selection'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Hindi dubbed &amp; multi-audio library with dedicated Series, Movies, Episodes, A–Z index &amp; Search.
                </p>
              </div>
            </div>

            {isAnimeWorld ? (
              <span className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-xs sm:text-sm font-semibold text-amber-200">
                <CheckCircle2 className="h-4 w-4" />
                <span>Selected</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setActiveServer('animeworld-india')}
                className="kuro-btn-glass inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 py-2 text-xs sm:text-sm font-semibold text-amber-200 hover:border-amber-400/50"
              >
                <span>Select AnimeWorld</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {showQuickLinks && (
            <div className="relative z-10 mt-3.5 flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
              <Link
                to="/anime?tab=series"
                onClick={() => setActiveServer('animeworld-india')}
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Series
              </Link>
              <Link
                to="/anime?tab=movies"
                onClick={() => setActiveServer('animeworld-india')}
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Movies
              </Link>
              <Link
                to="/anime?tab=a2z"
                onClick={() => setActiveServer('animeworld-india')}
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                A–Z Index
              </Link>
              <Link
                to="/anime?tab=search"
                onClick={() => setActiveServer('animeworld-india')}
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Search
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
