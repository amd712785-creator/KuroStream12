import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ASSETS } from '@/src/config/env';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
  testFirestoreConnection,
} from '@/src/lib/firebase';
import { getDisplayTitle } from '@/src/services/anilistApi';
import {
  DEFAULT_WATCH_STATS,
  getStoredWatchStats,
  recordEpisodeCompletionLocally,
  saveStoredWatchStats,
} from '@/src/services/achievementService';
import { applyTheme, getStoredTheme } from '@/src/services/themeService';
import type {
  AnimeSummary,
  LibraryAnimeItem,
  ThemeId,
  UserPreferences,
  UserWatchStats,
  WatchHistoryItem,
} from '@/src/types/anime';

const GUEST_STORAGE_KEY = 'kurostream_guest_state_v1';

interface GuestState {
  preferences: UserPreferences;
  watchlist: LibraryAnimeItem[];
  favorites: LibraryAnimeItem[];
  history: WatchHistoryItem[];
  watchStats: UserWatchStats;
}

const DEFAULT_GUEST_STATE: GuestState = {
  preferences: {
    displayName: 'Guest Viewer',
    photoURL: ASSETS.defaultAvatar,
    preferredAudio: 'sub',
    autoNext: true,
    theme: 'midnight-purple',
  },
  watchlist: [],
  favorites: [],
  history: [],
  watchStats: DEFAULT_WATCH_STATS,
};

function readGuestState(): GuestState {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GUEST_STATE, watchStats: getStoredWatchStats() };
    const parsed = JSON.parse(raw) as Partial<GuestState>;
    return {
      preferences: { ...DEFAULT_GUEST_STATE.preferences, ...(parsed.preferences || {}) },
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      watchStats: parsed.watchStats || getStoredWatchStats(),
    };
  } catch {
    return { ...DEFAULT_GUEST_STATE, watchStats: getStoredWatchStats() };
  }
}

function writeGuestState(state: GuestState): void {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function toMillis(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val === 'object' && 'seconds' in val) {
    return Number((val as { seconds: number }).seconds) * 1000;
  }
  return Date.now();
}

const AUTHORIZED_ADMIN_EMAIL = 'amd712785@gmail.com';
const ACTIVE_PING_STORAGE_KEY = 'kurostream_user_active_ping_v1';

function getTodayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  firebaseEnabled: boolean;
  getIdToken: () => Promise<string | null>;
  preferences: UserPreferences;
  watchStats: UserWatchStats;
  watchlist: LibraryAnimeItem[];
  favorites: LibraryAnimeItem[];
  history: WatchHistoryItem[];
  isAuthModalOpen: boolean;
  authError: string | null;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isInWatchlist: (animeId: number) => boolean;
  isFavorite: (animeId: number) => boolean;
  getHistoryForAnime: (animeId: number) => WatchHistoryItem | undefined;
  toggleWatchlist: (anime: AnimeSummary) => Promise<void>;
  toggleFavorite: (anime: AnimeSummary) => Promise<void>;
  saveWatchProgress: (item: Omit<WatchHistoryItem, 'updatedAt'>) => Promise<void>;
  recordWatchCompletion: (animeId: number, episodeNumber: number) => Promise<void>;
  removeHistoryItem: (animeId: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [isAdmin, setIsAdmin] = useState(false);
  const [guestState, setGuestState] = useState<GuestState>(() => readGuestState());

  const [cloudPrefs, setCloudPrefs] = useState<UserPreferences>(DEFAULT_GUEST_STATE.preferences);
  const [cloudWatchStats, setCloudWatchStats] = useState<UserWatchStats>(() => getStoredWatchStats());
  const [cloudWatchlist, setCloudWatchlist] = useState<LibraryAnimeItem[]>([]);
  const [cloudFavorites, setCloudFavorites] = useState<LibraryAnimeItem[]>([]);
  const [cloudHistory, setCloudHistory] = useState<WatchHistoryItem[]>([]);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isFirebaseConfigured) {
      testFirestoreConnection();
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthReady(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (!firebaseUser) {
        setIsAdmin(false);
        return;
      }

      // Check verified admin status: STRICTLY authorized email amd712785@gmail.com with emailVerified == true
      if (firebaseUser.emailVerified && firebaseUser.email) {
        const isAuthorizedEmail =
          firebaseUser.email.toLowerCase() === AUTHORIZED_ADMIN_EMAIL.toLowerCase();

        // Also check custom claims if provisioned by server
        let hasAdminClaim = false;
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          hasAdminClaim = Boolean(tokenResult?.claims?.admin);
        } catch {
          // ignore token result lookup errors
        }

        if (isAuthorizedEmail) {
          setIsAdmin(true);
        } else {
          // Other registered users must NEVER receive admin permissions
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }

      if (db && firebaseUser.emailVerified) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const todayKey = getTodayUtcKey();
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            const safeName = (firebaseUser.displayName?.trim() || 'Anime Fan').slice(0, 80);
            const payload: Record<string, unknown> = {
              uid: firebaseUser.uid,
              displayName: safeName,
              preferredAudio: 'sub',
              autoNext: true,
              lastActiveDay: todayKey,
              lastActiveAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            if (firebaseUser.photoURL) {
              payload.photoURL = firebaseUser.photoURL.slice(0, 500);
            }
            await setDoc(userRef, payload);
          } else {
            // Update activity timestamp at most once per 5 minutes per browser session
            let shouldPing = true;
            try {
              const lastPingRaw = sessionStorage.getItem(ACTIVE_PING_STORAGE_KEY);
              if (lastPingRaw) {
                const parsed = JSON.parse(lastPingRaw) as { uid?: string; ts?: number; day?: string };
                if (
                  parsed.uid === firebaseUser.uid &&
                  parsed.day === todayKey &&
                  typeof parsed.ts === 'number' &&
                  Date.now() - parsed.ts < 5 * 60 * 1000
                ) {
                  shouldPing = false;
                }
              }
            } catch {
              // ignore sessionStorage access errors
            }

            if (shouldPing) {
              await updateDoc(userRef, {
                lastActiveDay: todayKey,
                lastActiveAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              try {
                sessionStorage.setItem(
                  ACTIVE_PING_STORAGE_KEY,
                  JSON.stringify({ uid: firebaseUser.uid, day: todayKey, ts: Date.now() })
                );
              } catch {
                // ignore storage errors
              }
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
        }
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user || !db) return;

    const uid = user.uid;
    const userPath = `users/${uid}`;
    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const userTheme = typeof d.theme === 'string' ? (d.theme as ThemeId) : undefined;
          if (userTheme) {
            applyTheme(userTheme);
          }
          setCloudPrefs({
            displayName: typeof d.displayName === 'string' ? d.displayName : user.displayName || 'Viewer',
            photoURL:
              typeof d.photoURL === 'string' && d.photoURL.trim()
                ? d.photoURL.trim()
                : user.photoURL || ASSETS.defaultAvatar,
            preferredAudio:
              d.preferredAudio === 'dub'
                ? 'dub'
                : d.preferredAudio === 'hindi'
                  ? 'hindi'
                  : 'sub',
            autoNext: typeof d.autoNext === 'boolean' ? d.autoNext : true,
            theme: userTheme,
          });

          const loadedStats: UserWatchStats = {
            theme: userTheme,
            streakCurrent: typeof d.streakCurrent === 'number' ? d.streakCurrent : 0,
            streakLongest: typeof d.streakLongest === 'number' ? d.streakLongest : 0,
            streakLastWatchedDate: typeof d.streakLastWatchedDate === 'string' ? d.streakLastWatchedDate : undefined,
            streakWatchedDays: Array.isArray(d.streakWatchedDays) ? d.streakWatchedDays : [],
            totalEpisodesCompleted: typeof d.totalEpisodesCompleted === 'number' ? d.totalEpisodesCompleted : 0,
            todayEpisodesCompleted: typeof d.todayEpisodesCompleted === 'number' ? d.todayEpisodesCompleted : 0,
            todayCompletedDate: typeof d.todayCompletedDate === 'string' ? d.todayCompletedDate : undefined,
            unlockedAchievements: Array.isArray(d.unlockedAchievements) ? d.unlockedAchievements : [],
          };
          setCloudWatchStats(loadedStats);
          saveStoredWatchStats(loadedStats);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, userPath)
    );

    const wlPath = `users/${uid}/watchlist`;
    const unsubWl = onSnapshot(
      query(collection(db, wlPath), where('ownerId', '==', uid)),
      (snap) => {
        setCloudWatchlist(
          snap.docs
            .map((docSnap): LibraryAnimeItem => {
              const d = docSnap.data();
              return {
                animeId: Number(d.animeId),
                title: String(d.title),
                coverImage: String(d.coverImage || ''),
                format: typeof d.format === 'string' ? d.format : undefined,
                episodes: typeof d.episodes === 'number' ? d.episodes : undefined,
                averageScore: typeof d.averageScore === 'number' ? d.averageScore : undefined,
                addedAt: toMillis(d.addedAt),
              };
            })
            .sort((a, b) => b.addedAt - a.addedAt)
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, wlPath)
    );

    const favPath = `users/${uid}/favorites`;
    const unsubFav = onSnapshot(
      query(collection(db, favPath), where('ownerId', '==', uid)),
      (snap) => {
        setCloudFavorites(
          snap.docs
            .map((docSnap): LibraryAnimeItem => {
              const d = docSnap.data();
              return {
                animeId: Number(d.animeId),
                title: String(d.title),
                coverImage: String(d.coverImage || ''),
                format: typeof d.format === 'string' ? d.format : undefined,
                episodes: typeof d.episodes === 'number' ? d.episodes : undefined,
                averageScore: typeof d.averageScore === 'number' ? d.averageScore : undefined,
                addedAt: toMillis(d.addedAt),
              };
            })
            .sort((a, b) => b.addedAt - a.addedAt)
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, favPath)
    );

    const histPath = `users/${uid}/history`;
    const unsubHist = onSnapshot(
      query(collection(db, histPath), where('ownerId', '==', uid)),
      (snap) => {
        setCloudHistory(
          snap.docs
            .map((docSnap): WatchHistoryItem => {
              const d = docSnap.data();
              return {
                animeId: Number(d.animeId),
                title: String(d.title),
                coverImage: String(d.coverImage || ''),
                episodeId: String(d.episodeId),
                episodeNumber: Number(d.episodeNumber),
                episodeTitle: typeof d.episodeTitle === 'string' ? d.episodeTitle : undefined,
                progressSeconds: Number(d.progressSeconds || 0),
                durationSeconds: Number(d.durationSeconds || 0),
                audioMode:
                  d.audioMode === 'dub'
                    ? 'dub'
                    : d.audioMode === 'hindi'
                      ? 'hindi'
                      : 'sub',
                updatedAt: toMillis(d.updatedAt),
              };
            })
            .sort((a, b) => b.updatedAt - a.updatedAt)
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, histPath)
    );

    return () => {
      unsubUser();
      unsubWl();
      unsubFav();
      unsubHist();
    };
  }, [authReady, user]);

  const isGuest = !user;
  const preferences = user ? cloudPrefs : guestState.preferences;
  const watchlist = user ? cloudWatchlist : guestState.watchlist;
  const favorites = user ? cloudFavorites : guestState.favorites;
  const history = user ? cloudHistory : guestState.history;

  const updateGuest = useCallback((updater: (prev: GuestState) => GuestState) => {
    setGuestState((prev) => {
      const next = updater(prev);
      writeGuestState(next);
      return next;
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      setAuthError('Firebase is not configured. Using local Guest Mode.');
      return;
    }
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setIsAuthModalOpen(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
    }
  }, []);

  const signOut = useCallback(async () => {
    if (auth && user) {
      await firebaseSignOut(auth);
      setIsAdmin(false);
    }
  }, [user]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  const isInWatchlist = useCallback(
    (animeId: number) => watchlist.some((item) => item.animeId === animeId),
    [watchlist]
  );

  const isFavorite = useCallback(
    (animeId: number) => favorites.some((item) => item.animeId === animeId),
    [favorites]
  );

  const getHistoryForAnime = useCallback(
    (animeId: number) => history.find((item) => item.animeId === animeId),
    [history]
  );

  const toggleWatchlist = useCallback(
    async (anime: AnimeSummary) => {
      const title = (getDisplayTitle(anime.title).trim() || 'Untitled').slice(0, 240);
      const coverImage = (anime.coverImage?.large || anime.coverImage?.extraLarge || '').slice(0, 500);
      const exists = watchlist.some((w) => w.animeId === anime.id);

      if (user && db) {
        const path = `users/${user.uid}/watchlist/${anime.id}`;
        try {
          if (exists) {
            await deleteDoc(doc(db, path));
          } else {
            const payload: Record<string, unknown> = {
              ownerId: user.uid,
              animeId: anime.id,
              title,
              coverImage,
              addedAt: serverTimestamp(),
            };
            if (anime.format) payload.format = String(anime.format).slice(0, 40);
            if (typeof anime.episodes === 'number' && anime.episodes >= 0) {
              payload.episodes = anime.episodes;
            }
            if (
              typeof anime.averageScore === 'number' &&
              anime.averageScore >= 0 &&
              anime.averageScore <= 100
            ) {
              payload.averageScore = anime.averageScore;
            }
            await setDoc(doc(db, path), payload);
          }
        } catch (err) {
          handleFirestoreError(err, exists ? OperationType.DELETE : OperationType.CREATE, path);
        }
        return;
      }

      updateGuest((prev) => ({
        ...prev,
        watchlist: exists
          ? prev.watchlist.filter((w) => w.animeId !== anime.id)
          : [
              {
                animeId: anime.id,
                title,
                coverImage,
                format: anime.format || undefined,
                episodes: anime.episodes || undefined,
                averageScore: anime.averageScore || undefined,
                addedAt: Date.now(),
              },
              ...prev.watchlist,
            ],
      }));
    },
    [user, watchlist, updateGuest]
  );

  const toggleFavorite = useCallback(
    async (anime: AnimeSummary) => {
      const title = (getDisplayTitle(anime.title).trim() || 'Untitled').slice(0, 240);
      const coverImage = (anime.coverImage?.large || anime.coverImage?.extraLarge || '').slice(0, 500);
      const exists = favorites.some((f) => f.animeId === anime.id);

      if (user && db) {
        const path = `users/${user.uid}/favorites/${anime.id}`;
        try {
          if (exists) {
            await deleteDoc(doc(db, path));
          } else {
            const payload: Record<string, unknown> = {
              ownerId: user.uid,
              animeId: anime.id,
              title,
              coverImage,
              addedAt: serverTimestamp(),
            };
            if (anime.format) payload.format = String(anime.format).slice(0, 40);
            if (typeof anime.episodes === 'number' && anime.episodes >= 0) {
              payload.episodes = anime.episodes;
            }
            if (
              typeof anime.averageScore === 'number' &&
              anime.averageScore >= 0 &&
              anime.averageScore <= 100
            ) {
              payload.averageScore = anime.averageScore;
            }
            await setDoc(doc(db, path), payload);
          }
        } catch (err) {
          handleFirestoreError(err, exists ? OperationType.DELETE : OperationType.CREATE, path);
        }
        return;
      }

      updateGuest((prev) => ({
        ...prev,
        favorites: exists
          ? prev.favorites.filter((f) => f.animeId !== anime.id)
          : [
              {
                animeId: anime.id,
                title,
                coverImage,
                format: anime.format || undefined,
                episodes: anime.episodes || undefined,
                averageScore: anime.averageScore || undefined,
                addedAt: Date.now(),
              },
              ...prev.favorites,
            ],
      }));
    },
    [user, favorites, updateGuest]
  );

  const saveWatchProgress = useCallback(
    async (item: Omit<WatchHistoryItem, 'updatedAt'>) => {
      const safeTitle = (item.title?.trim() || 'Untitled').slice(0, 240);
      const safeCover = (item.coverImage || '').slice(0, 500);
      const safeEpId = (item.episodeId?.trim() || 'ep-1').slice(0, 200);
      const safeEpTitle = item.episodeTitle ? item.episodeTitle.slice(0, 240) : undefined;
      const safeEpNumber = Math.max(0, Number(item.episodeNumber) || 0);
      const safeProgress = Math.max(0, Math.floor(item.progressSeconds || 0));
      const safeDuration = Math.max(0, Math.floor(item.durationSeconds || 0));

      if (user && db) {
        const path = `users/${user.uid}/history/${item.animeId}`;
        try {
          const payload: Record<string, unknown> = {
            ownerId: user.uid,
            animeId: item.animeId,
            title: safeTitle,
            coverImage: safeCover,
            episodeId: safeEpId,
            episodeNumber: safeEpNumber,
            progressSeconds: safeProgress,
            durationSeconds: safeDuration,
            audioMode:
              item.audioMode === 'dub'
                ? 'dub'
                : item.audioMode === 'hindi'
                  ? 'hindi'
                  : 'sub',
            updatedAt: serverTimestamp(),
          };
          if (safeEpTitle) payload.episodeTitle = safeEpTitle;
          await setDoc(doc(db, path), payload);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
        return;
      }

      updateGuest((prev) => {
        const filtered = prev.history.filter((h) => h.animeId !== item.animeId);
        return {
          ...prev,
          history: [
            {
              ...item,
              title: safeTitle,
              coverImage: safeCover,
              episodeId: safeEpId,
              episodeTitle: safeEpTitle,
              progressSeconds: safeProgress,
              durationSeconds: safeDuration,
              updatedAt: Date.now(),
            },
            ...filtered,
          ].slice(0, 60),
        };
      });
    },
    [user, updateGuest]
  );

  const removeHistoryItem = useCallback(
    async (animeId: number) => {
      if (user && db) {
        const path = `users/${user.uid}/history/${animeId}`;
        try {
          await deleteDoc(doc(db, path));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, path);
        }
        return;
      }

      updateGuest((prev) => ({
        ...prev,
        history: prev.history.filter((h) => h.animeId !== animeId),
      }));
    },
    [user, updateGuest]
  );

  const clearHistory = useCallback(async () => {
    if (user && db) {
      if (cloudHistory.length === 0) return;
      const path = `users/${user.uid}/history`;
      try {
        const batch = writeBatch(db);
        cloudHistory.slice(0, 500).forEach((h) => {
          batch.delete(doc(db!, path, String(h.animeId)));
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
      return;
    }

    updateGuest((prev) => ({ ...prev, history: [] }));
  }, [user, cloudHistory, updateGuest]);

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (patch.theme) {
        applyTheme(patch.theme);
      }

      if (user && db) {
        const path = `users/${user.uid}`;
        try {
          const updatePayload: Record<string, unknown> = {
            updatedAt: serverTimestamp(),
          };
          if (typeof patch.displayName === 'string' && patch.displayName.trim()) {
            updatePayload.displayName = patch.displayName.trim().slice(0, 80);
          }
          if (typeof patch.photoURL === 'string' && patch.photoURL.trim()) {
            updatePayload.photoURL = patch.photoURL.trim().slice(0, 500);
          }
          if (patch.preferredAudio) updatePayload.preferredAudio = patch.preferredAudio;
          if (typeof patch.autoNext === 'boolean') updatePayload.autoNext = patch.autoNext;
          if (patch.theme) updatePayload.theme = patch.theme;
          await updateDoc(doc(db, path), updatePayload);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
        return;
      }

      updateGuest((prev) => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          ...patch,
          displayName:
            typeof patch.displayName === 'string' && patch.displayName.trim()
              ? patch.displayName.trim().slice(0, 80)
              : prev.preferences.displayName,
        },
      }));
    },
    [user, updateGuest]
  );

  const recordWatchCompletion = useCallback(
    async (animeId: number, episodeNumber: number) => {
      const activeStats = user ? cloudWatchStats : guestState.watchStats;
      const res = recordEpisodeCompletionLocally(animeId, episodeNumber, activeStats);

      if (user && db) {
        setCloudWatchStats(res.stats);
        const path = `users/${user.uid}`;
        try {
          const updatePayload: Record<string, unknown> = {
            streakCurrent: res.stats.streakCurrent,
            streakLongest: res.stats.streakLongest,
            streakWatchedDays: res.stats.streakWatchedDays,
            totalEpisodesCompleted: res.stats.totalEpisodesCompleted,
            todayEpisodesCompleted: res.stats.todayEpisodesCompleted,
            todayCompletedDate: res.stats.todayCompletedDate,
            unlockedAchievements: res.stats.unlockedAchievements,
            updatedAt: serverTimestamp(),
          };
          if (res.stats.streakLastWatchedDate) {
            updatePayload.streakLastWatchedDate = res.stats.streakLastWatchedDate;
          }
          await updateDoc(doc(db, path), updatePayload);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      } else {
        updateGuest((prev) => ({
          ...prev,
          watchStats: res.stats,
        }));
      }
    },
    [user, cloudWatchStats, guestState.watchStats, updateGuest]
  );

  const activeWatchStats = user ? cloudWatchStats : guestState.watchStats;

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isGuest,
        isAdmin,
        firebaseEnabled: isFirebaseConfigured,
        getIdToken,
        preferences,
        watchStats: activeWatchStats,
        watchlist,
        favorites,
        history,
        isAuthModalOpen,
        authError,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        signInWithGoogle,
        signOut,
        isInWatchlist,
        isFavorite,
        getHistoryForAnime,
        toggleWatchlist,
        toggleFavorite,
        saveWatchProgress,
        recordWatchCompletion,
        removeHistoryItem,
        clearHistory,
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
