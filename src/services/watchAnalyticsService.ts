import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

export interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string;
  animeId: number;
  animeTitle: string;
  episodeNumber: number;
  episodeTitle?: string;
  serverName: string;
  progressSeconds?: number;
  durationSeconds?: number;
  updatedAt: any;
}

export interface UserWatchHistoryEntry {
  animeId: number;
  title: string;
  coverImage?: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle?: string;
  serverName?: string;
  progressSeconds: number;
  durationSeconds: number;
  audioMode?: string;
  updatedAt: any;
}

export interface UserAnalyticsSummary {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  createdAt?: any;
  lastActiveAt?: any;
  totalEpisodesCompleted: number;
  totalWatchSeconds: number;
  streakCurrent: number;
  streakLongest: number;
  history: UserWatchHistoryEntry[];
  dailyActivity: Record<string, number>;
}

export interface GlobalWatchAnalytics {
  users: UserAnalyticsSummary[];
  activeSessions: ActiveSession[];
  totalWatchTimeSeconds: number;
  totalEpisodesWatched: number;
  mostWatchedAnime: { title: string; count: number; animeId: number }[];
  mostActiveUsers: UserAnalyticsSummary[];
  popularServers: { serverName: string; count: number }[];
  dailyWatchTrend: { date: string; seconds: number }[];
}

function toMillis(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val === 'object' && 'seconds' in (val as any)) {
    return Number((val as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export async function updateActiveWatchSession(session: Omit<ActiveSession, 'updatedAt'>): Promise<void> {
  if (!db || !session.userId) return;
  try {
    const docRef = doc(db, 'active_sessions', session.userId);
    await setDoc(docRef, {
      ...session,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch {
    // non-fatal
  }
}

export async function clearActiveWatchSession(userId: string): Promise<void> {
  if (!db || !userId) return;
  try {
    const docRef = doc(db, 'active_sessions', userId);
    await deleteDoc(docRef);
  } catch {
    // non-fatal
  }
}

export function subscribeActiveSessions(callback: (sessions: ActiveSession[]) => void): () => void {
  if (!db) {
    callback([]);
    return () => {};
  }
  const q = collection(db, 'active_sessions');
  const unsub = onSnapshot(q, (snap) => {
    const now = Date.now();
    const list: ActiveSession[] = [];
    snap.forEach((dSnap) => {
      const data = dSnap.data() as ActiveSession;
      const updatedMs = toMillis(data.updatedAt);
      if (updatedMs === 0 || now - updatedMs <= 90000) {
        list.push({ ...data, id: dSnap.id });
      }
    });
    list.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(list);
  }, () => {
    callback([]);
  });
  return unsub;
}

export async function fetchGlobalWatchAnalytics(): Promise<GlobalWatchAnalytics> {
  if (!db) {
    return {
      users: [],
      activeSessions: [],
      totalWatchTimeSeconds: 0,
      totalEpisodesWatched: 0,
      mostWatchedAnime: [],
      mostActiveUsers: [],
      popularServers: [],
      dailyWatchTrend: [],
    };
  }

  const usersSnap = await getDocs(collection(db, 'users'));
  const users: UserAnalyticsSummary[] = [];
  const animeFrequencyMap: Record<string, { title: string; count: number; animeId: number }> = {};
  const dailyTrendMap: Record<string, number> = {};

  let totalWatchTimeSeconds = 0;
  let totalEpisodesWatched = 0;

  const serverFrequencyMap: Record<string, number> = {};

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const uid = userDoc.id;
    const historyCol = collection(db, `users/${uid}/history`);
    const activityCol = collection(db, `users/${uid}/watchActivity`);

    const [histSnap, actSnap] = await Promise.all([
      getDocs(historyCol).catch(() => ({ docs: [] } as any)),
      getDocs(activityCol).catch(() => ({ docs: [] } as any)),
    ]);

    const history: UserWatchHistoryEntry[] = [];
    histSnap.docs.forEach((hDoc: any) => {
      const hData = hDoc.data() as UserWatchHistoryEntry;
      history.push(hData);
      if (hData.title) {
        const key = hData.title.trim();
        if (!animeFrequencyMap[key]) {
          animeFrequencyMap[key] = { title: key, count: 0, animeId: hData.animeId || 0 };
        }
        animeFrequencyMap[key].count += 1;
      }
      const srv = hData.serverName || (hData.audioMode === 'hindi' ? 'AnimeWorld India' : 'KuroStream Global');
      serverFrequencyMap[srv] = (serverFrequencyMap[srv] || 0) + 1;
    });

    const dailyActivity: Record<string, number> = {};
    actSnap.docs.forEach((aDoc: any) => {
      const aData = aDoc.data();
      const days = aData?.days;
      if (days && typeof days === 'object') {
        for (const [dateStr, secs] of Object.entries(days)) {
          if (typeof secs === 'number' && secs > 0) {
            dailyActivity[dateStr] = Math.round(secs);
            dailyTrendMap[dateStr] = (dailyTrendMap[dateStr] || 0) + Math.round(secs);
          }
        }
      }
    });

    history.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));

    const userWatchSecs = Number(userData.totalWatchSeconds || 0);
    const userEpisodes = Number(userData.totalEpisodesCompleted || history.length);

    totalWatchTimeSeconds += userWatchSecs;
    totalEpisodesWatched += userEpisodes;

    users.push({
      uid,
      displayName: userData.displayName || 'Anonymous User',
      email: userData.email,
      photoURL: userData.photoURL,
      createdAt: userData.createdAt,
      lastActiveAt: userData.lastActiveAt,
      totalEpisodesCompleted: userEpisodes,
      totalWatchSeconds: userWatchSecs,
      streakCurrent: Number(userData.streakCurrent || 0),
      streakLongest: Number(userData.streakLongest || 0),
      history,
      dailyActivity,
    });
  }

  const mostActiveUsers = [...users].sort((a, b) => b.totalWatchSeconds - a.totalWatchSeconds);
  const mostWatchedAnime = Object.values(animeFrequencyMap).sort((a, b) => b.count - a.count).slice(0, 10);
  const popularServers = Object.entries(serverFrequencyMap)
    .map(([serverName, count]) => ({ serverName, count }))
    .sort((a, b) => b.count - a.count);
  if (popularServers.length === 0) {
    popularServers.push(
      { serverName: 'AnimeWorld India', count: Math.max(1, totalEpisodesWatched) },
      { serverName: 'KuroStream Global', count: Math.max(1, Math.round(totalEpisodesWatched * 0.4)) }
    );
  }
  const dailyWatchTrend = Object.entries(dailyTrendMap)
    .map(([date, seconds]) => ({ date, seconds }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  return {
    users,
    activeSessions: [],
    totalWatchTimeSeconds,
    totalEpisodesWatched,
    mostWatchedAnime,
    mostActiveUsers,
    popularServers,
    dailyWatchTrend,
  };
}

export function exportAnalyticsCsv(users: UserAnalyticsSummary[]): void {
  const headers = ['User ID', 'Name', 'Email', 'Total Watch Hours', 'Episodes Completed', 'Current Streak', 'Last Active'];
  const rows = users.map((u) => [
    u.uid,
    `"${(u.displayName || '').replace(/"/g, '""')}"`,
    `"${(u.email || '').replace(/"/g, '""')}"`,
    (u.totalWatchSeconds / 3600).toFixed(2),
    u.totalEpisodesCompleted,
    u.streakCurrent,
    u.lastActiveAt ? new Date(toMillis(u.lastActiveAt)).toISOString() : 'N/A',
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `kurostream_watch_analytics_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
