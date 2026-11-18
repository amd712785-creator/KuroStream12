import React from 'react';
import {
  Award,
  CheckCircle2,
  Crown,
  Flame,
  Heart,
  Lock,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  ACHIEVEMENT_BADGES,
  getBadgeProgress,
} from '@/src/services/achievementService';
import type { AchievementBadge, BadgeTier, UserWatchStats } from '@/src/types/anime';

interface AchievementsSectionProps {
  stats: UserWatchStats;
}

const BADGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Award,
  Heart,
  Crown,
  Zap,
  Trophy,
};

const TIER_COLORS: Record<
  BadgeTier,
  {
    border: string;
    bg: string;
    text: string;
    glow: string;
    badgeBg: string;
  }
> = {
  bronze: {
    border: 'border-amber-600/50',
    bg: 'bg-amber-950/20',
    text: 'text-amber-400',
    glow: 'rgba(217, 119, 6, 0.25)',
    badgeBg: 'bg-amber-600/20 text-amber-300 border-amber-600/40',
  },
  silver: {
    border: 'border-slate-300/50',
    bg: 'bg-slate-800/30',
    text: 'text-slate-200',
    glow: 'rgba(226, 232, 240, 0.25)',
    badgeBg: 'bg-slate-500/20 text-slate-200 border-slate-400/40',
  },
  gold: {
    border: 'border-yellow-400/60',
    bg: 'bg-yellow-950/25',
    text: 'text-yellow-300',
    glow: 'rgba(250, 204, 21, 0.35)',
    badgeBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
  },
  diamond: {
    border: 'border-cyan-400/60',
    bg: 'bg-cyan-950/25',
    text: 'text-cyan-300',
    glow: 'rgba(34, 211, 238, 0.35)',
    badgeBg: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
  },
  purple: {
    border: 'border-violet-400/60',
    bg: 'bg-violet-950/30',
    text: 'text-violet-300',
    glow: 'rgba(167, 139, 250, 0.35)',
    badgeBg: 'bg-violet-500/20 text-violet-200 border-violet-400/40',
  },
};

export const AchievementsSection: React.FC<AchievementsSectionProps> = ({ stats }) => {
  const unlockedCount = (stats.unlockedAchievements || []).length;
  const totalCount = ACHIEVEMENT_BADGES.length;
  const completionPercentage = Math.round((unlockedCount / totalCount) * 100);

  return (
    <div className="space-y-6">
      {/* Header Banner & Summary */}
      <div className="kuro-glass rounded-3xl p-5 sm:p-6 relative overflow-hidden border border-white/[0.12]">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-violet-600/20 blur-3xl" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-400/35 text-amber-300 shadow-md">
                <Trophy className="h-5 w-5" />
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                Anime Achievement System
              </h2>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-xl">
              Earn permanent collector badges based on real episodes watched. Unlock achievements as you stream anime on KuroStream.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#0c0e18]/90 p-3 sm:px-4">
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Progress
              </span>
              <span className="text-lg font-black text-white tabular-nums">
                {unlockedCount} <span className="text-xs font-semibold text-slate-400">/ {totalCount}</span>
              </span>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Total Watched
              </span>
              <span className="text-lg font-black text-violet-400 tabular-nums">
                {stats.totalEpisodesCompleted || 0}{' '}
                <span className="text-xs font-semibold text-slate-400">Eps</span>
              </span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="mt-5 space-y-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-300">Completion Mastery</span>
            <span className="text-violet-400 tabular-nums">{completionPercentage}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-black/50 overflow-hidden border border-white/[0.08] p-0.5">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${completionPercentage}%`,
                background: 'linear-gradient(90deg, #8b5cf6 0%, #d946ef 100%)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ACHIEVEMENT_BADGES.map((badge) => {
          const progress = getBadgeProgress(badge, stats);
          const tierStyle = TIER_COLORS[badge.tier];
          const IconComponent = BADGE_ICONS[badge.iconName] || Award;

          return (
            <div
              key={badge.id}
              className={`relative flex flex-col justify-between rounded-2xl p-4 sm:p-5 transition-all duration-200 overflow-hidden ${
                progress.unlocked
                  ? `border ${tierStyle.border} ${tierStyle.bg} shadow-lg`
                  : 'kuro-glass border border-white/[0.08] opacity-85'
              }`}
              style={{
                boxShadow: progress.unlocked ? `0 10px 28px -10px ${tierStyle.glow}` : undefined,
              }}
            >
              {/* Top Row: Icon + Tier Pill */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border transition-transform duration-200 ${
                      progress.unlocked
                        ? `${tierStyle.border} bg-[#0c0e18] shadow-md`
                        : 'border-white/10 bg-[#0a0c14] text-slate-500'
                    }`}
                  >
                    <IconComponent
                      className={`h-6 w-6 ${
                        progress.unlocked ? tierStyle.text : 'text-slate-500'
                      }`}
                    />
                    {progress.unlocked && (
                      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                        <CheckCircle2 className="h-3 w-3" />
                      </span>
                    )}
                  </div>

                  <div>
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        progress.unlocked
                          ? tierStyle.badgeBg
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      {badge.tier}
                    </span>
                    <h3 className="text-base font-bold text-white mt-1">
                      {badge.title}
                    </h3>
                  </div>
                </div>

                {!progress.unlocked && (
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.05] text-slate-500">
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="mt-3 text-xs leading-relaxed text-slate-300">
                {badge.description}
              </p>

              {/* Progress Bar & Status */}
              <div className="mt-4 pt-3 border-t border-white/[0.08] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className={progress.unlocked ? 'text-emerald-400 font-semibold flex items-center gap-1' : 'text-slate-400'}>
                    {progress.unlocked ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Unlocked</span>
                      </>
                    ) : (
                      <span>Progress</span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                    {progress.current} / {progress.target} Eps
                  </span>
                </div>

                <div className="h-2 w-full rounded-full bg-black/40 overflow-hidden border border-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      progress.unlocked
                        ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                        : 'bg-gradient-to-r from-violet-500 to-purple-600'
                    }`}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
