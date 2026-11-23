import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Film,
  Filter,
  Flame,
  Globe,
  Headphones,
  Layers,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Tv,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  fetchGlobalWatchAnalytics,
  subscribeActiveSessions,
  exportAnalyticsCsv,
  type ActiveSession,
  type GlobalWatchAnalytics,
  type UserAnalyticsSummary,
  type UserWatchHistoryEntry,
} from '@/src/services/watchAnalyticsService';

interface AdminWatchAnalyticsSectionProps {
  onRefreshParent?: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 min';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins} min`;
}

function formatClock(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp(val: any): string {
  if (!val) return 'N/A';
  try {
    let ms = 0;
    if (typeof val === 'number') ms = val;
    else if (typeof val.toMillis === 'function') ms = val.toMillis();
    else if (val.seconds) ms = val.seconds * 1000;
    else if (typeof val === 'string') ms = new Date(val).getTime();

    if (!ms || isNaN(ms)) return 'N/A';
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

function formatRelativeTime(val: any): string {
  if (!val) return 'Inactive';
  try {
    let ms = 0;
    if (typeof val === 'number') ms = val;
    else if (typeof val.toMillis === 'function') ms = val.toMillis();
    else if (val.seconds) ms = val.seconds * 1000;
    else if (typeof val === 'string') ms = new Date(val).getTime();

    if (!ms || isNaN(ms)) return 'Inactive';
    const diffSec = Math.floor((Date.now() - ms) / 1000);
    if (diffSec < 15) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  } catch {
    return 'Inactive';
  }
}

export const AdminWatchAnalyticsSection: React.FC<AdminWatchAnalyticsSectionProps> = ({
  onRefreshParent,
}) => {
  const [analytics, setAnalytics] = useState<GlobalWatchAnalytics | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Search & Filter state for User Watch History Table
  const [searchQuery, setSearchQuery] = useState('');
  const [serverFilter, setServerFilter] = useState('All');
  const [animeFilter, setAnimeFilter] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'watchTime' | 'episodes' | 'name'>('recent');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Individual User Details Modal
  const [selectedUser, setSelectedUser] = useState<UserAnalyticsSummary | null>(null);

  // Load static/aggregated analytics
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGlobalWatchAnalytics();
      setAnalytics(data);
      setLastRefreshedAt(new Date());
      if (onRefreshParent) onRefreshParent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user watch analytics.');
    } finally {
      setLoading(false);
    }
  }, [onRefreshParent]);

  useEffect(() => {
    void loadData();
    // Auto-refresh aggregated analytics every 60 seconds
    const interval = window.setInterval(() => {
      void loadData();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  // Real-time listener for Currently Watching Active Sessions
  useEffect(() => {
    const unsub = subscribeActiveSessions((sessions) => {
      setActiveSessions(sessions);
    });
    return () => unsub();
  }, []);

  // Filter and sort user list
  const filteredUsers = useMemo(() => {
    if (!analytics?.users) return [];
    let list = [...analytics.users];

    // Search query filter (name or email)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          u.uid.toLowerCase().includes(q)
      );
    }

    // Anime title filter
    if (animeFilter.trim()) {
      const af = animeFilter.toLowerCase().trim();
      list = list.filter((u) =>
        u.history.some((h) => h.title.toLowerCase().includes(af))
      );
    }

    // Streaming server filter
    if (serverFilter !== 'All') {
      list = list.filter((u) =>
        u.history.some((h) => {
          const s = h.serverName || (h.audioMode === 'hindi' ? 'AnimeWorld India' : 'KuroStream Global');
          return s.toLowerCase().includes(serverFilter.toLowerCase());
        })
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'recent') {
        const aTime = a.history[0]?.updatedAt ? new Date(formatTimestamp(a.history[0].updatedAt)).getTime() : 0;
        const bTime = b.history[0]?.updatedAt ? new Date(formatTimestamp(b.history[0].updatedAt)).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === 'watchTime') {
        return b.totalWatchSeconds - a.totalWatchSeconds;
      }
      if (sortBy === 'episodes') {
        return b.totalEpisodesCompleted - a.totalEpisodesCompleted;
      }
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      return 0;
    });

    return list;
  }, [analytics?.users, searchQuery, animeFilter, serverFilter, sortBy]);

  // Paginated slice
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Calculate live session distinction
  const now = Date.now();
  const liveActiveNowCount = activeSessions.filter((s) => {
    const ms = s.updatedAt?.toMillis ? s.updatedAt.toMillis() : s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
    return ms > 0 && now - ms <= 45000;
  }).length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="kuro-glass rounded-3xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
              <Film className="h-3.5 w-3.5" />
              <span>User Watch Telemetry</span>
            </div>
            <h2 className="mt-2 text-lg sm:text-xl font-bold text-white tracking-tight">
              User Watch Analytics &amp; Live Presence
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
              Complete playback watch history, real-time currently watching sessions, and consumption statistics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[11px] text-slate-400 tabular-nums">
              Refreshed {lastRefreshedAt.toLocaleTimeString()}
            </span>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="kuro-btn-glass inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => analytics?.users && exportAnalyticsCsv(analytics.users)}
              disabled={!analytics?.users || analytics.users.length === 0}
              className="kuro-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs sm:text-sm text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* 4 Primary Top KPI Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          <div className="rounded-2xl border border-white/[0.08] bg-[#090b14]/90 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Total User Watch Time</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
                <Clock className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-white tabular-nums">
              {formatDuration(analytics?.totalWatchTimeSeconds || 0)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Aggregated across all registered users
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#090b14]/90 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Episodes &amp; Videos Watched</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-500/20 text-fuchsia-300">
                <Tv className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-white tabular-nums">
              {analytics?.totalEpisodesWatched || 0}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Completed or in-progress streams
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#090b14]/90 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Currently Watching</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <Radio className="h-4 w-4 animate-pulse" />
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl font-extrabold text-white tabular-nums">
                {activeSessions.length}
              </span>
              {liveActiveNowCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {liveActiveNowCount} active now
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Live heartbeat telemetry
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#090b14]/90 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Tracked Registered Users</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-white tabular-nums">
              {analytics?.users.length || 0}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              With Firestore profile &amp; activity
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================
          SECTION 2: CURRENTLY WATCHING (LIVE SESSIONS)
          ======================================================== */}
      <section className="kuro-glass rounded-3xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Live Watching Activity ({activeSessions.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Real playback heartbeat updates
          </span>
        </div>

        {activeSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed border-white/[0.1] bg-[#080a12]/60 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-400">
              <Radio className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-300">No active watching sessions</p>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              When authenticated users stream anime in KuroStream, their live playback position, current episode, and server will appear here instantly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {activeSessions.map((session) => {
              const sessionMs = session.updatedAt?.toMillis ? session.updatedAt.toMillis() : session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
              const isStreamingNow = sessionMs > 0 && now - sessionMs <= 45000;
              const progressSec = session.progressSeconds || 0;
              const durationSec = session.durationSeconds || 0;
              const pct = durationSec > 0 ? Math.min(100, Math.round((progressSec / durationSec) * 100)) : 0;

              return (
                <div
                  key={session.id || session.userId}
                  className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090b14]/95 p-4 space-y-3 transition-all hover:border-violet-500/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-violet-600/20 border border-violet-500/30">
                        {session.userAvatar ? (
                          <img
                            src={session.userAvatar}
                            alt={session.userName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-violet-300 font-bold text-sm">
                            {session.userName?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                        {isStreamingNow && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#090b14]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {session.userName}
                          </span>
                        </div>
                        {session.userEmail && (
                          <span className="text-[11px] text-slate-400 truncate block">
                            {session.userEmail}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isStreamingNow
                          ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                          : 'border border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {isStreamingNow ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                          <span>Streaming Now</span>
                        </>
                      ) : (
                        <span>Idle / Paused</span>
                      )}
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 space-y-1.5">
                    <div className="text-xs font-semibold text-violet-200 truncate">
                      {session.animeTitle}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        Episode {session.episodeNumber}
                        {session.episodeTitle ? ` · ${session.episodeTitle}` : ''}
                      </span>
                      <span className="rounded bg-violet-950/60 border border-violet-500/30 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                        {session.serverName || 'KuroStream'}
                      </span>
                    </div>

                    {durationSec > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
                          <span>
                            {formatClock(progressSec)} / {formatClock(durationSec)}
                          </span>
                          <span>{pct}% watched</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>Heartbeat: {formatRelativeTime(session.updatedAt)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const target = analytics?.users.find((u) => u.uid === session.userId);
                        if (target) setSelectedUser(target);
                      }}
                      className="text-violet-400 hover:text-violet-300 font-semibold"
                    >
                      View Profile &rarr;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ========================================================
          SECTION 3: ANALYTICS DASHBOARD BREAKDOWNS
          ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Most Watched Anime */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#090b14]/90 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white">Most Watched Anime</h3>
          </div>
          {analytics?.mostWatchedAnime && analytics.mostWatchedAnime.length > 0 ? (
            <div className="space-y-2">
              {analytics.mostWatchedAnime.slice(0, 5).map((anime, idx) => (
                <div
                  key={anime.title}
                  className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] p-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${
                        idx === 0
                          ? 'bg-amber-500 text-black shadow-md'
                          : idx === 1
                            ? 'bg-slate-300 text-black'
                            : idx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-white/[0.05] text-slate-400'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {anime.title}
                    </span>
                  </div>
                  <span className="rounded-lg bg-violet-500/10 px-2 py-0.5 text-xs font-bold text-violet-300 tabular-nums shrink-0 ml-2">
                    {anime.count} views
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No watch records yet.</p>
          )}
        </div>

        {/* Popular Streaming Servers */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#090b14]/90 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Streaming Server Distribution</h3>
          </div>
          {analytics?.popularServers && analytics.popularServers.length > 0 ? (
            <div className="space-y-3 pt-1">
              {analytics.popularServers.map((server) => {
                const totalServerHits = analytics.popularServers.reduce((acc, s) => acc + s.count, 0) || 1;
                const pct = Math.round((server.count / totalServerHits) * 100);
                return (
                  <div key={server.serverName} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{server.serverName}</span>
                      <span className="font-bold text-white tabular-nums">
                        {server.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No server records yet.</p>
          )}
        </div>

        {/* Most Active Watchers */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#090b14]/90 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Top Active Watchers</h3>
          </div>
          {analytics?.mostActiveUsers && analytics.mostActiveUsers.length > 0 ? (
            <div className="space-y-2">
              {analytics.mostActiveUsers.slice(0, 5).map((user, idx) => (
                <div
                  key={user.uid}
                  onClick={() => setSelectedUser(user)}
                  className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] p-2.5 cursor-pointer hover:border-violet-500/40 transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-bold text-slate-400 w-4">#{idx + 1}</span>
                    <div className="h-7 w-7 rounded-lg overflow-hidden bg-violet-600/20 shrink-0">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-violet-300">
                          {user.displayName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-white truncate block">
                        {user.displayName}
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {user.totalEpisodesCompleted} eps completed
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-amber-300 tabular-nums ml-2">
                    {formatDuration(user.totalWatchSeconds)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No user records yet.</p>
          )}
        </div>
      </div>

      {/* ========================================================
          SECTION 4: USER WATCH HISTORY TABLE & CONTROLS
          ======================================================== */}
      <section className="kuro-glass rounded-3xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Registered Users &amp; Watch History
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Showing {filteredUsers.length} registered accounts. Click any user to inspect their full activity history.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-xl border border-white/[0.08] bg-[#090b14] px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search user name or email..."
              className="w-full rounded-xl border border-white/[0.08] bg-[#070912] pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="relative">
            <Film className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={animeFilter}
              onChange={(e) => {
                setAnimeFilter(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter by anime title..."
              className="w-full rounded-xl border border-white/[0.08] bg-[#070912] pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="relative">
            <select
              value={serverFilter}
              onChange={(e) => {
                setServerFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-white/[0.08] bg-[#070912] px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="All">All Streaming Servers</option>
              <option value="AnimeWorld India">AnimeWorld India</option>
              <option value="KuroStream Global">KuroStream Global</option>
            </select>
          </div>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-white/[0.08] bg-[#070912] px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="recent">Sort by Most Recent</option>
              <option value="watchTime">Sort by Total Watch Time</option>
              <option value="episodes">Sort by Episodes Watched</option>
              <option value="name">Sort by Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* User Watch History Table */}
        <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.03] text-slate-400 font-semibold">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Last Watched Anime</th>
                <th className="py-3 px-4">Server</th>
                <th className="py-3 px-4">Last Watch Time</th>
                <th className="py-3 px-4">Total Time</th>
                <th className="py-3 px-4">Episodes</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => {
                  const lastHistory = user.history[0];
                  const server = lastHistory?.serverName || (lastHistory?.audioMode === 'hindi' ? 'AnimeWorld India' : lastHistory ? 'KuroStream Global' : '—');

                  return (
                    <tr
                      key={user.uid}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => setSelectedUser(user)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-xl overflow-hidden bg-violet-600/20 border border-violet-500/20 shrink-0">
                            {user.photoURL ? (
                              <img src={user.photoURL} alt={user.displayName} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-violet-300">
                                {user.displayName.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 max-w-[150px] sm:max-w-[200px]">
                            <span className="font-bold text-white truncate block">
                              {user.displayName}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate block">
                              {user.email || 'No email registered'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {lastHistory ? (
                          <div className="min-w-0 max-w-[180px] sm:max-w-[240px]">
                            <span className="font-semibold text-slate-200 truncate block">
                              {lastHistory.title}
                            </span>
                            <span className="text-[11px] text-violet-300 truncate block">
                              Episode {lastHistory.episodeNumber}
                              {lastHistory.episodeTitle ? ` · ${lastHistory.episodeTitle}` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">No history yet</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-flex items-center rounded-lg bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-slate-300">
                          {server}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-300 tabular-nums">
                        {lastHistory ? formatTimestamp(lastHistory.updatedAt) : 'Never'}
                      </td>

                      <td className="py-3 px-4 font-bold text-white tabular-nums">
                        {formatDuration(user.totalWatchSeconds)}
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-200 tabular-nums">
                        {user.totalEpisodesCompleted}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(user);
                          }}
                          className="kuro-btn-glass rounded-xl px-2.5 py-1 text-xs font-semibold text-violet-300 hover:text-white"
                        >
                          Details &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              Page {currentPage} of {totalPages} ({filteredUsers.length} users total)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="kuro-btn-glass flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 w-8 rounded-xl text-xs font-bold transition-all ${
                      currentPage === pageNum
                        ? 'bg-violet-600 text-white shadow-md'
                        : 'kuro-btn-glass text-slate-300 hover:text-white'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="kuro-btn-glass flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================
          MODAL: INDIVIDUAL USER WATCH ACTIVITY DETAILS
          ======================================================== */}
      {selectedUser && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-5 backdrop-blur-md animate-fade-in"
        >
          <div className="kuro-glass relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-violet-500/40 bg-[#0d101d] p-5 sm:p-7 shadow-[0_25px_80px_-15px_rgba(139,92,246,0.65)] space-y-6">
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="kuro-btn-glass absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            {/* User Profile Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-white/[0.08] pb-5 pr-10">
              <div className="h-16 w-16 rounded-2xl overflow-hidden bg-violet-600/30 border border-violet-500/40 shrink-0">
                {selectedUser.photoURL ? (
                  <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl font-bold text-violet-300">
                    {selectedUser.displayName.charAt(0)}
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-black text-white">{selectedUser.displayName}</h3>
                  <span className="rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-300 font-mono">
                    UID: {selectedUser.uid.slice(0, 8)}...
                  </span>
                </div>
                <p className="text-xs text-slate-400">{selectedUser.email || 'No email associated'}</p>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                  <span>Joined: {formatTimestamp(selectedUser.createdAt)}</span>
                  <span>•</span>
                  <span>Last Active: {formatRelativeTime(selectedUser.lastActiveAt)}</span>
                </div>
              </div>
            </div>

            {/* 4 User Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Total Watch Time</span>
                <span className="text-lg font-black text-white tabular-nums block mt-1">
                  {formatDuration(selectedUser.totalWatchSeconds)}
                </span>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Episodes Watched</span>
                <span className="text-lg font-black text-violet-300 tabular-nums block mt-1">
                  {selectedUser.totalEpisodesCompleted}
                </span>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Current Streak</span>
                <span className="text-lg font-black text-amber-400 tabular-nums block mt-1">
                  🔥 {selectedUser.streakCurrent} days
                </span>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Longest Streak</span>
                <span className="text-lg font-black text-fuchsia-400 tabular-nums block mt-1">
                  👑 {selectedUser.streakLongest} days
                </span>
              </div>
            </div>

            {/* Daily Watch Time breakdown */}
            {selectedUser.dailyActivity && Object.keys(selectedUser.dailyActivity).length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#070912] p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">Daily Watch Activity Log</span>
                  <span className="text-slate-500">
                    {Object.keys(selectedUser.dailyActivity).length} active days recorded
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pt-1">
                  {Object.entries(selectedUser.dailyActivity)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([date, secs]) => (
                      <span
                        key={date}
                        className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200 tabular-nums"
                      >
                        <strong>{date}</strong>: {formatDuration(secs)}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Complete Chronological Watch History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">
                  Chronological Watch History ({selectedUser.history.length})
                </h4>
              </div>

              {selectedUser.history.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No video watch history recorded for this user yet.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {selectedUser.history.map((item, idx) => {
                    const server = item.serverName || (item.audioMode === 'hindi' ? 'AnimeWorld India' : 'KuroStream Global');
                    const progressSec = item.progressSeconds || 0;
                    const durationSec = item.durationSeconds || 0;
                    const pct = durationSec > 0 ? Math.min(100, Math.round((progressSec / durationSec) * 100)) : 0;

                    return (
                      <div
                        key={`${item.animeId}-${item.episodeId}-${idx}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-[#090b14] p-3 hover:border-violet-500/30 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-12 w-10 rounded-xl overflow-hidden bg-slate-800 shrink-0">
                            {item.coverImage ? (
                              <img src={item.coverImage} alt={item.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                                <Film className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <span className="text-xs font-bold text-white truncate block">
                              {item.title}
                            </span>
                            <span className="text-[11px] text-violet-300 block truncate">
                              Episode {item.episodeNumber}
                              {item.episodeTitle ? ` · ${item.episodeTitle}` : ''}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-400">
                                {server}
                              </span>
                              {item.audioMode && (
                                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300 uppercase font-bold">
                                  {item.audioMode}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="sm:text-right shrink-0 space-y-1">
                          <span className="text-[11px] text-slate-400 block tabular-nums">
                            {formatTimestamp(item.updatedAt)}
                          </span>
                          {durationSec > 0 && (
                            <span className="text-[11px] text-slate-300 block font-medium tabular-nums">
                              {formatClock(progressSec)} / {formatClock(durationSec)} ({pct}%)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="kuro-btn-primary rounded-xl px-5 py-2 text-xs font-bold text-white"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
