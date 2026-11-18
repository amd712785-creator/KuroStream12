import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Play } from 'lucide-react';
import { AnimeImage } from '@/src/components/AnimeImage';
import { getAiringSchedule, getDisplayTitle, slugifyTitle } from '@/src/services/anilistApi';
import type { AiringScheduleItem } from '@/src/types/anime';

function formatDayKey(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDayTab(timestampSec: number): { short: string; date: string } {
  const d = new Date(timestampSec * 1000);
  return {
    short: d.toLocaleDateString(undefined, { weekday: 'short' }),
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

export const SchedulePage: React.FC = () => {
  const [schedule, setSchedule] = useState<AiringScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await getAiringSchedule(7);
        if (!active) return;
        setSchedule(items);
        if (items.length > 0) {
          setSelectedDay(formatDayKey(items[0].airingAt));
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load airing schedule.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const days = useMemo(() => {
    const map = new Map<string, { label: string; sub: string; items: AiringScheduleItem[] }>();
    for (const item of schedule) {
      const key = formatDayKey(item.airingAt);
      if (!map.has(key)) {
        const { short, date } = formatDayTab(item.airingAt);
        map.set(key, { label: short, sub: date, items: [] });
      }
      map.get(key)!.items.push(item);
    }
    return Array.from(map.entries());
  }, [schedule]);

  const activeItems = useMemo(() => {
    const found = days.find(([k]) => k === selectedDay);
    return found ? found[1].items : days[0]?.[1].items || [];
  }, [days, selectedDay]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Airing Schedule
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400">
          Upcoming simulcast episodes displayed in your local timezone
        </p>
      </div>

      {error ? (
        <div className="kuro-glass rounded-2xl border-rose-500/30 bg-rose-500/10 p-6 text-center text-sm text-rose-200">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-14 w-28 shrink-0 animate-pulse rounded-2xl bg-[#121420]" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#121420]" />
            ))}
          </div>
        </div>
      ) : days.length === 0 ? (
        <div className="kuro-glass rounded-3xl p-12 text-center">
          <Calendar className="mx-auto h-8 w-8 text-violet-400" />
          <p className="mt-3 text-sm text-slate-400">No upcoming broadcasts scheduled.</p>
        </div>
      ) : (
        <>
          <div
            className="flex gap-2 overflow-x-auto no-scrollbar pb-2"
            role="tablist"
            aria-label="Schedule days"
          >
            {days.map(([key, info]) => {
              const active = key === (selectedDay || days[0]?.[0]);
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedDay(key)}
                  className={`flex min-w-[104px] shrink-0 flex-col items-center rounded-2xl px-4 py-2.5 ${
                    active ? 'kuro-btn-active' : 'kuro-btn-glass text-slate-300'
                  }`}
                >
                  <span className="text-sm font-semibold">{info.label}</span>
                  <span className="text-xs opacity-75 tabular-nums">{info.sub}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeItems.map((entry) => {
              const title = getDisplayTitle(entry.media.title);
              const airTime = new Date(entry.airingAt * 1000).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              });
              const epSlug = `${slugifyTitle(entry.media.title.romaji || title) || `anime-${entry.media.id}`}-episode-${entry.episode}`;

              return (
                <div
                  key={entry.id}
                  className="kuro-glass flex items-center justify-between gap-4 rounded-2xl p-3.5 hover:border-violet-500/45 transition-colors"
                >
                  <Link
                    to={`/anime/${entry.media.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3.5"
                  >
                    <AnimeImage
                      src={entry.media.coverImage?.medium || entry.media.coverImage?.large}
                      alt={title}
                      className="h-16 w-12 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-white hover:text-violet-300 transition-colors">
                        {title}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 tabular-nums">
                        <span className="inline-flex items-center gap-1 text-violet-300 font-medium">
                          <Clock className="h-3 w-3" />
                          {airTime}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Episode {entry.episode}</span>
                      </div>
                    </div>
                  </Link>

                  <Link
                    to={`/watch/${entry.media.id}/${encodeURIComponent(epSlug)}?ep=${entry.episode}`}
                    className="kuro-btn-glass inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <Play className="h-3.5 w-3.5 fill-current text-violet-300" />
                    <span>Ep {entry.episode}</span>
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
