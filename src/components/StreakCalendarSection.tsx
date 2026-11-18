import React, { useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronRight,
  Flame,
  Info,
  ShieldAlert,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  computeStreakMilestones,
  getTodayUtcKey,
  getYesterdayUtcKey,
} from '@/src/services/achievementService';
import type { UserWatchStats } from '@/src/types/anime';

interface StreakCalendarSectionProps {
  stats: UserWatchStats;
}

export const StreakCalendarSection: React.FC<StreakCalendarSectionProps> = ({ stats }) => {
  const todayKey = getTodayUtcKey();
  const yesterdayKey = getYesterdayUtcKey();

  const isWatchedToday = (stats.streakWatchedDays || []).includes(todayKey);
  const currentStreak = stats.streakCurrent || 0;
  const longestStreak = stats.streakLongest || 0;
  const milestones = useMemo(() => computeStreakMilestones(currentStreak), [currentStreak]);

  // Generate rolling 30-day calendar data
  const calendarDays = useMemo(() => {
    const days: Array<{
      dateKey: string;
      dayNumber: number;
      dayName: string;
      monthName: string;
      isWatched: boolean;
      isToday: boolean;
      isYesterday: boolean;
      isFuture: boolean;
    }> = [];

    const now = new Date();
    // Rolling 28-30 days ending today + 2 upcoming placeholder days
    for (let i = 27; i >= -2; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const key = d.toISOString().slice(0, 10);
      const isWatched = (stats.streakWatchedDays || []).includes(key);
      const isToday = key === todayKey;
      const isYesterday = key === yesterdayKey;
      const isFuture = i < 0;

      days.push({
        dateKey: key,
        dayNumber: d.getUTCDate(),
        dayName: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        monthName: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        isWatched,
        isToday,
        isYesterday,
        isFuture,
      });
    }

    return days;
  }, [stats.streakWatchedDays, todayKey, yesterdayKey]);

  return (
    <div className="space-y-6">
      {/* Streak Hero Card */}
      <div className="kuro-glass relative overflow-hidden rounded-3xl p-5 sm:p-6 border border-white/[0.12]">
        <div className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full bg-orange-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-violet-600/20 blur-3xl" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-orange-500/40 bg-gradient-to-b from-orange-500/30 to-amber-600/20 shadow-xl shadow-orange-950/40">
              <Flame className="h-9 w-9 text-orange-400 animate-pulse" />
              {isWatchedToday && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] shadow">
                  ✓
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>{currentStreak} Day</span>
                  <span className="text-orange-400">Streak</span>
                </h2>
                {isWatchedToday ? (
                  <span className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                    Active Today
                  </span>
                ) : (
                  <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                    Watch today to keep streak!
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-300">
                {isWatchedToday
                  ? "Great job! You've logged your daily anime session today."
                  : 'Watch at least 1 episode today to advance your daily watch streak.'}
              </p>
            </div>
          </div>

          {/* Records & Anti-Cheat Summary */}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e18]/85 p-3 px-4 text-center">
              <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Longest Streak
              </span>
              <span className="text-lg font-black text-amber-300 tabular-nums">
                {longestStreak} <span className="text-xs font-semibold text-slate-400">Days</span>
              </span>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e18]/85 p-3 px-4 text-center">
              <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Total Days Logged
              </span>
              <span className="text-lg font-black text-violet-400 tabular-nums">
                {(stats.streakWatchedDays || []).length}{' '}
                <span className="text-xs font-semibold text-slate-400">Days</span>
              </span>
            </div>
          </div>
        </div>

        {/* Protection Note */}
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-2 text-[11px] text-slate-400">
          <Info className="h-3.5 w-3.5 shrink-0 text-violet-400" />
          <span>
            Streak verification runs with server timestamp synchronization. Page refreshes do not advance streak count.
          </span>
        </div>
      </div>

      {/* Visual Calendar Grid */}
      <div className="kuro-glass rounded-3xl p-5 sm:p-6 border border-white/[0.12] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-orange-400" />
            <h3 className="text-base font-bold text-white">Daily Watch Activity Calendar</h3>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-3 w-3 rounded-full border border-orange-400 bg-orange-500/80 shadow-[0_0_8px_rgba(251,146,60,0.6)]" />
              <span>Watched Day</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="h-3 w-3 rounded-full border border-white/20 bg-white/5" />
              <span>Rest Day</span>
            </span>
          </div>
        </div>

        {/* Rolling 30 Day Bubbles */}
        <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2 sm:gap-2.5 pt-2">
          {calendarDays.map((d) => (
            <div
              key={d.dateKey}
              className={`relative flex flex-col items-center justify-center rounded-2xl p-2.5 text-center transition-all duration-200 ${
                d.isWatched
                  ? 'border border-orange-500/50 bg-gradient-to-b from-orange-500/20 to-amber-950/30 text-white shadow-md shadow-orange-950/20'
                  : d.isToday
                    ? 'border-2 border-violet-400/80 bg-violet-600/10 text-white'
                    : d.isFuture
                      ? 'border border-dashed border-white/10 bg-transparent opacity-40 text-slate-500'
                      : 'border border-white/[0.08] bg-[#0c0e18]/60 text-slate-400 hover:border-white/20'
              }`}
            >
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tighter">
                {d.dayName}
              </span>
              <span className="text-sm font-bold my-0.5 tabular-nums">
                {d.dayNumber}
              </span>

              {d.isWatched ? (
                <Flame className="h-3.5 w-3.5 text-orange-400" />
              ) : d.isToday ? (
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-ping" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
              )}

              {d.isToday && (
                <span className="absolute -bottom-1 rounded bg-violet-500 px-1 text-[8px] font-bold text-white uppercase">
                  Today
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Streak Milestones Roadmap */}
      <div className="kuro-glass rounded-3xl p-5 sm:p-6 border border-white/[0.12] space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h3 className="text-base font-bold text-white">Milestone Rewards Roadmap</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {milestones.map((m) => {
            const daysLeft = Math.max(0, m.days - currentStreak);
            return (
              <div
                key={m.days}
                className={`flex flex-col justify-between rounded-2xl p-4 transition-all ${
                  m.unlocked
                    ? 'border border-amber-500/40 bg-amber-500/10 shadow-lg shadow-amber-950/20'
                    : 'border border-white/[0.08] bg-[#0c0e18]/70 opacity-80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-orange-400 tabular-nums">
                      {m.days} Days
                    </span>
                    {m.unlocked ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <CheckCircle2 className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                        {daysLeft} left
                      </span>
                    )}
                  </div>
                  <h4 className="mt-2 text-sm font-bold text-white">{m.title}</h4>
                  <p className="text-[11px] text-slate-300 font-medium">{m.rewardBadge}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-white/[0.08]">
                  <span
                    className={`inline-block text-[10px] font-semibold ${
                      m.unlocked ? 'text-emerald-400 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {m.unlocked ? 'Milestone Achieved' : `Reach day ${m.days}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
