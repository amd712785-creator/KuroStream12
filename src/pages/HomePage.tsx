import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Globe, Play, RotateCcw, Server } from 'lucide-react';
import { AnimeImage } from '@/src/components/AnimeImage';
import { AnimeSection } from '@/src/components/AnimeSection';
import { FeaturedAnimeSection } from '@/src/components/FeaturedAnimeSection';
import { HeroBanner } from '@/src/components/HeroBanner';
import { useAuth } from '@/src/context/AuthContext';
import { getHomeSections, type HomeSectionsData } from '@/src/services/anilistApi';

export const HomePage: React.FC = () => {
  const { history } = useAuth();
  const [sections, setSections] = useState<HomeSectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHomeSections();
      setSections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load anime catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-10 sm:space-y-12 px-4 py-5 sm:px-6 sm:py-8">
      {error ? (
        <div className="kuro-glass rounded-3xl border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <h2 className="text-lg font-bold text-white">Failed to load AniList catalog</h2>
          <p className="mt-2 text-sm text-rose-200">{error}</p>
          <button
            type="button"
            onClick={loadData}
            className="kuro-btn-primary mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <>
          <HeroBanner items={sections?.trending || []} loading={loading} />
          <FeaturedAnimeSection
            items={sections?.featuredPriority || []}
            loading={loading}
          />
        </>
      )}

      {/* Streaming Servers Section */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Streaming Servers
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
              Choose an independent catalog server — switch freely anytime
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Existing Global Multi-Server Catalog */}
          <Link
            to="/anime"
            className="kuro-glass group relative overflow-hidden rounded-3xl p-5 transition-all duration-200 hover:border-violet-400/50 hover:shadow-[0_14px_34px_-12px_rgba(124,58,237,0.4)] active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-600/20 text-violet-300">
                  <Globe className="h-6 w-6" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-violet-300 transition-colors">
                    KuroStream Global
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Vidstreaming, Megacloud, Streamsb, AnimePahe, AniWatchTV, HiAnime, Kaido &amp; Munchyroll for SUB &amp; English DUB.
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
            </div>
          </Link>

          {/* New Independent AnimeWorld India Server */}
          <div className="kuro-glass-elevated relative overflow-hidden rounded-3xl border-amber-400/25 p-5 transition-all duration-200 hover:border-amber-400/50">
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
                      · Dedicated Server
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Separate Hindi dubbed &amp; multi-audio library with dedicated Series, Movies, A–Z index &amp; Search.
                  </p>
                </div>
              </div>

              <Link
                to="/animeworld-india"
                className="kuro-btn-primary inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 py-2 text-xs sm:text-sm font-semibold"
              >
                <span>Open Server</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="relative z-10 mt-3.5 flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
              <Link
                to="/animeworld-india?tab=series"
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Series
              </Link>
              <Link
                to="/animeworld-india?tab=movies"
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Movies
              </Link>
              <Link
                to="/animeworld-india?tab=a2z"
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                A–Z Index
              </Link>
              <Link
                to="/animeworld-india?tab=search"
                className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-semibold text-slate-200"
              >
                Search
              </Link>
            </div>
          </div>
        </div>
      </section>

      {history.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Continue Watching
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
                Resume right where you left off
              </p>
            </div>
            <Link
              to="/profile"
              className="kuro-btn-glass inline-flex min-h-[36px] items-center gap-1 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-violet-200 whitespace-nowrap shrink-0"
            >
              <span>View history</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible">
            {history.slice(0, 4).map((item) => {
              const pct =
                item.durationSeconds > 0
                  ? Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100))
                  : 0;
              return (
                <Link
                  key={`${item.animeId}-${item.episodeId}`}
                  to={`/watch/${item.animeId}/${encodeURIComponent(item.episodeId)}?ep=${item.episodeNumber}`}
                  className="kuro-glass group flex w-[275px] sm:w-auto shrink-0 snap-start items-center gap-3.5 rounded-2xl p-3 hover:border-violet-500/50 hover:shadow-[0_10px_28px_-10px_rgba(124,58,237,0.35)] active:scale-[0.98] transition-all duration-200"
                >
                  <div className="relative h-21 w-14 shrink-0 overflow-hidden rounded-xl bg-[#161925]">
                    <AnimeImage
                      src={item.coverImage}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="h-4 w-4 fill-white text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 tabular-nums">
                      Ep {item.episodeNumber} · {item.audioMode.toUpperCase()}
                    </p>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.1]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                        style={{ width: `${Math.max(8, pct)}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!error && (
        <>
          <AnimeSection
            title="Trending Now"
            subtitle="Most watched anime across the global community"
            items={sections?.trending || []}
            loading={loading}
            viewAllTo="/anime?sort=TRENDING_DESC"
            badgeResolver={(_, idx) => `Trending #${idx + 1}`}
          />

          <AnimeSection
            title="Popular Anime"
            subtitle="All-time fan favorites and acclaimed series"
            items={sections?.popular || []}
            loading={loading}
            viewAllTo="/anime?sort=POPULARITY_DESC"
          />

          <AnimeSection
            title="New Episodes"
            subtitle="Currently airing shows with new episodes this week"
            items={sections?.latestEpisodes || []}
            loading={loading}
            viewAllTo="/anime?status=RELEASING&sort=UPDATED_AT_DESC"
            badgeResolver={(anime) =>
              anime.nextAiringEpisode?.episode
                ? `New Episode · Ep ${Math.max(1, anime.nextAiringEpisode.episode - 1)}`
                : 'New Episode'
            }
          />

          <AnimeSection
            title="Recently Updated"
            subtitle="Freshly cataloged and updated anime releases"
            items={sections?.recentlyUpdated || []}
            loading={loading}
            viewAllTo="/anime?sort=UPDATED_AT_DESC"
          />

          <AnimeSection
            title="Upcoming Anime"
            subtitle="Anticipated premieres announced for upcoming seasons"
            items={sections?.upcoming || []}
            loading={loading}
            viewAllTo="/anime?status=NOT_YET_RELEASED&sort=POPULARITY_DESC"
            badgeResolver={(anime) =>
              anime.seasonYear ? `${anime.season || 'TBA'} ${anime.seasonYear}` : 'Upcoming'
            }
          />
        </>
      )}
    </div>
  );
};
