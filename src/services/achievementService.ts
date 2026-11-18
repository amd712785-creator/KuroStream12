import type {
  AchievementBadge,
  AchievementId,
  StreakMilestone,
  UserWatchStats,
} from '@/src/types/anime';

export const ACHIEVEMENT_BADGES: AchievementBadge[] = [
  {
    id: 'first_episode',
    title: 'First Episode',
    description: 'Watch your first anime episode on KuroStream.',
    targetCount: 1,
    tier: 'bronze',
    iconName: 'Sparkles',
    badgeLabel: '1 Ep',
  },
  {
    id: 'beginner',
    title: 'Anime Beginner',
    description: 'Complete 10 anime episodes across any series.',
    targetCount: 10,
    tier: 'bronze',
    iconName: 'Award',
    badgeLabel: '10 Eps',
  },
  {
    id: 'lover',
    title: 'Anime Lover',
    description: 'Complete 50 anime episodes with true dedication.',
    targetCount: 50,
    tier: 'silver',
    iconName: 'Heart',
    badgeLabel: '50 Eps',
  },
  {
    id: 'master',
    title: 'Anime Master',
    description: 'Complete 100 anime episodes on KuroStream.',
    targetCount: 100,
    tier: 'gold',
    iconName: 'Crown',
    badgeLabel: '100 Eps',
  },
  {
    id: 'binge_watcher',
    title: 'Binge Watcher',
    description: 'Complete 10 anime episodes in a single calendar day.',
    targetCount: 10,
    tier: 'purple',
    iconName: 'Zap',
    badgeLabel: '10 In 1 Day',
  },
  {
    id: 'legendary',
    title: 'Legendary Viewer',
    description: 'Complete 500 anime episodes. Ascend to anime legend.',
    targetCount: 500,
    tier: 'diamond',
    iconName: 'Trophy',
    badgeLabel: '500 Eps',
  },
];

export const STREAK_MILESTONES_CONFIG: Array<{ days: number; title: string; rewardBadge: string }> = [
  { days: 3, title: '3-Day Streak', rewardBadge: 'Spark of Habit' },
  { days: 7, title: '7-Day Streak', rewardBadge: 'One-Week Otaku' },
  { days: 15, title: '15-Day Streak', rewardBadge: 'Half-Month Fire' },
  { days: 30, title: '30-Day Streak', rewardBadge: 'Monthly Devotee' },
  { days: 100, title: '100-Day Streak', rewardBadge: 'Centurion Legend' },
];

export const WATCH_STATS_STORAGE_KEY = 'kurostream_watch_stats_v2';
export const COMPLETED_EPS_STORAGE_KEY = 'kurostream_completed_episodes_v2';

export const DEFAULT_WATCH_STATS: UserWatchStats = {
  streakCurrent: 0,
  streakLongest: 0,
  streakWatchedDays: [],
  totalEpisodesCompleted: 0,
  todayEpisodesCompleted: 0,
  unlockedAchievements: [],
};

export function getTodayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getYesterdayUtcKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getStoredWatchStats(): UserWatchStats {
  if (typeof window === 'undefined') return DEFAULT_WATCH_STATS;
  try {
    const raw = localStorage.getItem(WATCH_STATS_STORAGE_KEY);
    if (!raw) return DEFAULT_WATCH_STATS;
    const parsed = JSON.parse(raw) as Partial<UserWatchStats>;
    const today = getTodayUtcKey();
    const isToday = parsed.todayCompletedDate === today;

    return {
      theme: parsed.theme,
      streakCurrent: typeof parsed.streakCurrent === 'number' && parsed.streakCurrent >= 0 ? parsed.streakCurrent : 0,
      streakLongest: typeof parsed.streakLongest === 'number' && parsed.streakLongest >= 0 ? parsed.streakLongest : 0,
      streakLastWatchedDate: parsed.streakLastWatchedDate,
      streakWatchedDays: Array.isArray(parsed.streakWatchedDays) ? parsed.streakWatchedDays : [],
      totalEpisodesCompleted:
        typeof parsed.totalEpisodesCompleted === 'number' && parsed.totalEpisodesCompleted >= 0
          ? parsed.totalEpisodesCompleted
          : 0,
      todayEpisodesCompleted: isToday && typeof parsed.todayEpisodesCompleted === 'number' ? parsed.todayEpisodesCompleted : 0,
      todayCompletedDate: isToday ? today : today,
      unlockedAchievements: Array.isArray(parsed.unlockedAchievements) ? parsed.unlockedAchievements : [],
    };
  } catch {
    return DEFAULT_WATCH_STATS;
  }
}

export function saveStoredWatchStats(stats: UserWatchStats): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WATCH_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore local storage errors
  }
}

function getStoredCompletedEpisodeKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(COMPLETED_EPS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveCompletedEpisodeKeys(keys: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(keys).slice(-400);
    localStorage.setItem(COMPLETED_EPS_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export interface RecordCompletionResult {
  stats: UserWatchStats;
  newlyUnlocked: AchievementBadge[];
  alreadyCounted: boolean;
}

export function recordEpisodeCompletionLocally(
  animeId: number,
  episodeNumber: number,
  currentStats?: UserWatchStats
): RecordCompletionResult {
  const stats = currentStats ? { ...currentStats } : { ...getStoredWatchStats() };
  const today = getTodayUtcKey();
  const yesterday = getYesterdayUtcKey();
  const epKey = `${animeId}:${episodeNumber}:${today}`;

  const completedKeys = getStoredCompletedEpisodeKeys();
  const alreadyCompletedToday = completedKeys.has(epKey);

  if (alreadyCompletedToday) {
    return { stats, newlyUnlocked: [], alreadyCounted: true };
  }

  completedKeys.add(epKey);
  saveCompletedEpisodeKeys(completedKeys);

  // Update episode counts
  stats.totalEpisodesCompleted = (stats.totalEpisodesCompleted || 0) + 1;
  if (stats.todayCompletedDate === today) {
    stats.todayEpisodesCompleted = (stats.todayEpisodesCompleted || 0) + 1;
  } else {
    stats.todayCompletedDate = today;
    stats.todayEpisodesCompleted = 1;
  }

  // Update Daily Streak accurately
  if (stats.streakLastWatchedDate === today) {
    // Already continued today, keep current streak
  } else if (stats.streakLastWatchedDate === yesterday) {
    // Watched yesterday -> increment streak!
    stats.streakCurrent = (stats.streakCurrent || 0) + 1;
  } else {
    // Missed yesterday or first time -> streak starts at 1
    stats.streakCurrent = 1;
  }
  stats.streakLongest = Math.max(stats.streakLongest || 0, stats.streakCurrent);
  stats.streakLastWatchedDate = today;

  // Add today to watched days array for visual calendar
  const watchedDaysSet = new Set(stats.streakWatchedDays || []);
  watchedDaysSet.add(today);
  // Keep last 60 days sorted
  stats.streakWatchedDays = Array.from(watchedDaysSet).sort().slice(-60);

  // Evaluate badges
  const currentlyUnlocked = new Set(stats.unlockedAchievements || []);
  const newlyUnlocked: AchievementBadge[] = [];

  for (const badge of ACHIEVEMENT_BADGES) {
    if (currentlyUnlocked.has(badge.id)) continue;

    let unlocked = false;
    if (badge.id === 'binge_watcher') {
      unlocked = stats.todayEpisodesCompleted >= badge.targetCount;
    } else {
      unlocked = stats.totalEpisodesCompleted >= badge.targetCount;
    }

    if (unlocked) {
      currentlyUnlocked.add(badge.id);
      newlyUnlocked.push(badge);
    }
  }

  stats.unlockedAchievements = Array.from(currentlyUnlocked);
  saveStoredWatchStats(stats);

  return { stats, newlyUnlocked, alreadyCounted: false };
}

export function computeStreakMilestones(currentStreak: number): StreakMilestone[] {
  return STREAK_MILESTONES_CONFIG.map((m) => ({
    days: m.days,
    title: m.title,
    rewardBadge: m.rewardBadge,
    unlocked: currentStreak >= m.days,
  }));
}

export function getBadgeProgress(badge: AchievementBadge, stats: UserWatchStats): {
  current: number;
  target: number;
  percent: number;
  unlocked: boolean;
} {
  const isUnlocked = (stats.unlockedAchievements || []).includes(badge.id);
  const current =
    badge.id === 'binge_watcher'
      ? stats.todayEpisodesCompleted || 0
      : stats.totalEpisodesCompleted || 0;
  const target = badge.targetCount;
  const percent = Math.min(100, Math.round((current / target) * 100));

  return {
    current: Math.min(current, target),
    target,
    percent: isUnlocked ? 100 : percent,
    unlocked: isUnlocked,
  };
}
