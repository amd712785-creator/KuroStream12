import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
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
import { ASSETS, resolveApiUrl } from '@/src/config/env';
import {
  auth,
  db,
  firebaseDiagnostics,
  firebaseOAuthClientId,
  googleProvider,
  handleFirestoreError,
  isFirebaseConfigured,
  logFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '@/src/lib/firebase';
import { getDisplayTitle } from '@/src/services/anilistApi';
import { SESSION_EXPIRED_EVENT } from '@/src/services/authorizedFetch';
import {
  ACHIEVEMENT_BADGES,
  DEFAULT_WATCH_STATS,
  getBadgeProgress,
  getStoredWatchStats,
  getTodayDateKey,
  MAX_EQUIPPED_BADGES,
  normalizeAchievementList,
  normalizeEquippedBadges,
  recordWatchPlaybackLocally,
  saveStoredWatchStats,
  type PlaybackRecordInput,
} from '@/src/services/achievementService';
import { applyTheme, getStoredTheme } from '@/src/services/themeService';
import type {
  AchievementId,
  AnimeSummary,
  EquipBadgeResult,
  LibraryAnimeItem,
  ThemeId,
  UserPreferences,
  UserWatchStats,
  WatchHistoryItem,
} from '@/src/types/anime';

const DEFAULT_SIGNED_OUT_PREFERENCES: UserPreferences = {
  displayName: 'KuroStream',
  photoURL: ASSETS.defaultAvatar,
  preferredAudio: 'sub',
  autoNext: true,
  theme: getStoredTheme() || 'midnight-purple',
};

function toMillis(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val === 'object' && 'seconds' in val) {
    return Number((val as { seconds: number }).seconds) * 1000;
  }
  return Date.now();
}

const ACTIVE_PING_STORAGE_KEY = 'kurostream_user_active_ping_v1';

function getTodayUtcKey(): string {
  return getTodayDateKey();
}

let socialLoginInitPromise: Promise<void> | null = null;

async function ensureNativeSocialLoginInitialized(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!firebaseOAuthClientId) {
    throw new Error('Google Web Client ID is missing in Firebase configuration.');
  }
  if (!socialLoginInitPromise) {
    socialLoginInitPromise = SocialLogin.initialize({
      google: {
        webClientId: firebaseOAuthClientId,
        mode: 'online',
        skipAuthOnlyAuthorizationAfterSignIn: true,
      },
    }).catch((err) => {
      socialLoginInitPromise = null;
      throw err;
    });
  }
  await socialLoginInitPromise;
}

function formatFirebaseAuthError(err: unknown, context: 'google' | 'email'): string {
  const code = (err as { code?: string } | null)?.code || '';
  const rawMessage = err instanceof Error ? err.message : String(err || 'Authentication failed.');
  const activeProject = auth?.app?.options?.projectId || firebaseDiagnostics.projectId || 'unknown';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return context === 'google'
        ? 'Google credential could not be verified by Firebase. Verify that your Web Client ID and Android OAuth SHA-1/SHA-256 match your Firebase project.'
        : 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to Sign In or reset your password.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    case 'auth/operation-not-allowed':
      return context === 'google'
        ? `Firebase project "${activeProject}" returned auth/operation-not-allowed for Google Sign-In.`
        : `Firebase project "${activeProject}" returned auth/operation-not-allowed for Email/Password sign-in.`;
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase Authentication. Check your internet connection and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/popup-closed-by-user':
      return '';
    default:
      break;
  }

  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('user_cancelled') ||
    lower.includes('canceled') ||
    lower.includes('cancelled') ||
    lower.includes('getcredentialcancellationexception')
  ) {
    return '';
  }

  if (
    Capacitor.isNativePlatform() &&
    (lower.includes('[16]') || lower.includes('account reauth failed'))
  ) {
    return 'Google Sign-In failed: [16] Account reauth failed. Ensure com.kurostream.app + APK SHA-1/SHA-256 and Web Client ID belong to the same Google Cloud/Firebase project, or sign in with Email/Password.';
  }

  if (
    Capacitor.isNativePlatform() &&
    (lower.includes('nocredential') ||
      lower.includes('no credentials') ||
      lower.includes('developer_error') ||
      lower.includes('developer error') ||
      lower.includes('28404') ||
      lower.includes('28444') ||
      lower.includes('10:') ||
      lower.includes('16:'))
  ) {
    return 'Native Google Sign-In failed (' + rawMessage + '). Verify com.kurostream.app + APK SHA-1/SHA-256 and Web Client ID match your Firebase/Google Cloud project, or sign in with Email/Password.';
  }

  return rawMessage || 'Unable to sign in.';
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  firebaseEnabled: boolean;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  preferences: UserPreferences;
  watchStats: UserWatchStats;
  equippedBadges: AchievementId[];
  equippingBadgeId: AchievementId | null;
  watchlist: LibraryAnimeItem[];
  favorites: LibraryAnimeItem[];
  history: WatchHistoryItem[];
  isAuthModalOpen: boolean;
  authError: string | null;
  authNotice: string | null;
  authLoading: boolean;
  clearAuthMessages: () => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  isInWatchlist: (animeId: number) => boolean;
  isFavorite: (animeId: number) => boolean;
  getHistoryForAnime: (animeId: number) => WatchHistoryItem | undefined;
  toggleWatchlist: (anime: AnimeSummary) => Promise<void>;
  toggleFavorite: (anime: AnimeSummary) => Promise<void>;
  saveWatchProgress: (item: Omit<WatchHistoryItem, 'updatedAt'>) => Promise<void>;
  recordWatchPlayback: (input: PlaybackRecordInput) => Promise<void>;
  recordWatchCompletion: (animeId: number, episodeNumber: number) => Promise<void>;
  removeHistoryItem: (animeId: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  equipBadge: (badgeId: AchievementId) => Promise<EquipBadgeResult>;
  unequipBadge: (badgeId: AchievementId) => Promise<EquipBadgeResult>;
  toggleEquipBadge: (badgeId: AchievementId) => Promise<EquipBadgeResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionPrefs, setSessionPrefs] = useState<UserPreferences>(DEFAULT_SIGNED_OUT_PREFERENCES);

  const [cloudPrefs, setCloudPrefs] = useState<UserPreferences>(DEFAULT_SIGNED_OUT_PREFERENCES);
  const [cloudWatchStats, setCloudWatchStats] = useState<UserWatchStats>(() => getStoredWatchStats());
  const [cloudEquippedBadges, setCloudEquippedBadges] = useState<AchievementId[]>([]);
  const [equippingBadgeId, setEquippingBadgeId] = useState<AchievementId | null>(null);
  const [cloudDailyActivity, setCloudDailyActivity] = useState<Record<string, number>>({});
  const [cloudWatchlist, setCloudWatchlist] = useState<LibraryAnimeItem[]>([]);
  const [cloudFavorites, setCloudFavorites] = useState<LibraryAnimeItem[]>([]);
  const [cloudHistory, setCloudHistory] = useState<WatchHistoryItem[]>([]);

  const cloudWatchStatsRef = useRef<UserWatchStats>(cloudWatchStats);
  cloudWatchStatsRef.current = cloudWatchStats;
  const cloudEquippedBadgesRef = useRef<AchievementId[]>(cloudEquippedBadges);
  cloudEquippedBadgesRef.current = cloudEquippedBadges;
  const cloudDailyActivityRef = useRef<Record<string, number>>(cloudDailyActivity);
  cloudDailyActivityRef.current = cloudDailyActivity;

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const lastSavedProgressRef = useRef<
    Map<
      number,
      {
        episodeId: string;
        episodeNumber: number;
        audioMode: string;
        progressSeconds: number;
        writtenAt: number;
      }
    >
  >(new Map());
  const lastSyncedArraysRef = useRef<{
    uid: string;
    streakDaysLen: number;
    watchedAnimeLen: number;
    achievementsLen: number;
  } | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const timer = window.setTimeout(() => {
      testFirestoreConnection();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleSessionExpired = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      const msg = detail?.message || 'Your session has expired. Please sign in again.';
      setAuthError(msg);
      if (auth && auth.currentUser) {
        firebaseSignOut(auth).catch(() => {});
      }
      setIsAdmin(false);
      setIsAuthModalOpen(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthReady(true);
      return;
    }

    if (Capacitor.isNativePlatform()) {
      ensureNativeSocialLoginInitialized().catch(() => {
        // Retry and surface errors during explicit user sign-in
      });
    } else {
      getRedirectResult(auth)
        .then((result) => {
          if (result?.user) {
            setIsAuthModalOpen(false);
          }
        })
        .catch((err) => {
          const msg = formatFirebaseAuthError(err, 'google');
          if (msg) setAuthError(msg);
        });
    }

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      console.info('[KuroStream Auth State]', {
        projectId: auth?.app?.options?.projectId || firebaseDiagnostics.projectId,
        authInitStatus: firebaseDiagnostics.authInitStatus,
        signedIn: Boolean(firebaseUser),
        emailVerified: Boolean(firebaseUser?.emailVerified),
        providers: firebaseUser?.providerData?.map((p) => p.providerId) || [],
      });
      setUser(firebaseUser);
      setAuthReady(true);

      if (!firebaseUser) {
        setIsAdmin(false);
        setCloudEquippedBadges([]);
        return;
      }

      // Verify Admin privileges strictly via Firebase Admin authorization (custom claims + backend verification)
      if (firebaseUser.emailVerified) {
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          if (auth?.currentUser?.uid !== firebaseUser.uid) return;

          if (tokenResult?.claims?.admin === true) {
            setIsAdmin(true);
          } else {
            const adminRes = await fetch(resolveApiUrl('/api/auth/admin-status'), {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${tokenResult.token}`,
              },
            });
            if (auth?.currentUser?.uid !== firebaseUser.uid) return;

            if (adminRes.ok) {
              const adminJson = (await adminRes.json()) as {
                isAdmin?: boolean;
                claimSynced?: boolean;
              };
              const authorized = adminJson.isAdmin === true;
              setIsAdmin(authorized);
              if (authorized && adminJson.claimSynced) {
                await firebaseUser.getIdTokenResult(true).catch(() => {});
              }
            } else {
              setIsAdmin(false);
            }
          }
        } catch {
          if (auth?.currentUser?.uid === firebaseUser.uid) {
            setIsAdmin(false);
          }
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
              equippedBadges: [],
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
          logFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
        }
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !db) return;

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
            bannerURL:
              typeof d.bannerURL === 'string' && d.bannerURL.trim()
                ? d.bannerURL.trim()
                : undefined,
            preferredAudio:
              d.preferredAudio === 'dub'
                ? 'dub'
                : d.preferredAudio === 'hindi'
                  ? 'hindi'
                  : 'sub',
            autoNext: typeof d.autoNext === 'boolean' ? d.autoNext : true,
            theme: userTheme,
          });

          const { unlockedAchievements, achievementUnlockDates } = normalizeAchievementList(
            d.unlockedAchievements,
            d.achievementUnlockDates
          );
          const todayKey = getTodayDateKey();
          const mergedDaily = {
            ...(cloudDailyActivityRef.current || {}),
          };
          const loadedStats: UserWatchStats = {
            theme: userTheme,
            streakCurrent: typeof d.streakCurrent === 'number' ? d.streakCurrent : 0,
            streakLongest: typeof d.streakLongest === 'number' ? d.streakLongest : 0,
            streakLastWatchedDate:
              typeof d.streakLastWatchedDate === 'string' ? d.streakLastWatchedDate : undefined,
            streakWatchedDays: Array.isArray(d.streakWatchedDays) ? d.streakWatchedDays : [],
            totalEpisodesCompleted:
              typeof d.totalEpisodesCompleted === 'number' ? d.totalEpisodesCompleted : 0,
            todayEpisodesCompleted:
              d.todayCompletedDate === todayKey && typeof d.todayEpisodesCompleted === 'number'
                ? d.todayEpisodesCompleted
                : 0,
            todayCompletedDate:
              typeof d.todayCompletedDate === 'string' ? d.todayCompletedDate : todayKey,
            totalWatchSeconds:
              typeof d.totalWatchSeconds === 'number' && d.totalWatchSeconds >= 0
                ? d.totalWatchSeconds
                : 0,
            todayWatchSeconds:
              d.todayWatchDate === todayKey && typeof d.todayWatchSeconds === 'number'
                ? d.todayWatchSeconds
                : 0,
            todayWatchDate: typeof d.todayWatchDate === 'string' ? d.todayWatchDate : todayKey,
            watchedAnimeIds: Array.isArray(d.watchedAnimeIds)
              ? d.watchedAnimeIds.filter((id): id is string => typeof id === 'string')
              : [],
            dailyWatchSeconds: mergedDaily,
            unlockedAchievements,
            achievementUnlockDates,
          };
          cloudWatchStatsRef.current = loadedStats;
          setCloudWatchStats(loadedStats);
          saveStoredWatchStats(loadedStats);

          const syncedEquipped = normalizeEquippedBadges(d.equippedBadges);
          cloudEquippedBadgesRef.current = syncedEquipped;
          setCloudEquippedBadges(syncedEquipped);
        }
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, userPath);
      }
    );

    const activityPath = `users/${uid}/watchActivity`;
    const unsubActivity = onSnapshot(
      query(collection(db, activityPath), where('ownerId', '==', uid)),
      (snap) => {
        const nextDaily: Record<string, number> = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const daysMap = data?.days;
          if (daysMap && typeof daysMap === 'object' && !Array.isArray(daysMap)) {
            for (const [dateKey, secs] of Object.entries(daysMap as Record<string, unknown>)) {
              if (
                /^\d{4}-\d{2}-\d{2}$/.test(dateKey) &&
                typeof secs === 'number' &&
                Number.isFinite(secs) &&
                secs >= 0
              ) {
                nextDaily[dateKey] = Math.round(secs);
              }
            }
          }
        });
        cloudDailyActivityRef.current = nextDaily;
        setCloudDailyActivity(nextDaily);
      },
      (error) => {
        logFirestoreError(error, OperationType.LIST, activityPath);
      }
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
      (error) => {
        logFirestoreError(error, OperationType.LIST, wlPath);
      }
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
      (error) => {
        logFirestoreError(error, OperationType.LIST, favPath);
      }
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
                serverName: typeof d.serverName === 'string' ? d.serverName : undefined,
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
      (error) => {
        logFirestoreError(error, OperationType.LIST, histPath);
      }
    );

    return () => {
      unsubUser();
      unsubActivity();
      unsubWl();
      unsubFav();
      unsubHist();
    };
  }, [authReady, user]);

  const clearAuthMessages = useCallback(() => {
    setAuthError(null);
    setAuthNotice(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      setAuthError('Firebase Authentication is not configured.');
      return;
    }
    setAuthError(null);
    setAuthNotice(null);
    setAuthLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        await ensureNativeSocialLoginInitialized();
        const response = await SocialLogin.login({
          provider: 'google',
          options: {
            style: 'standard',
          },
        });
        const idToken =
          response.result.responseType === 'online' ? response.result.idToken : null;
        if (!idToken) {
          throw new Error('Google Sign-In did not return an ID token.');
        }
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        setIsAuthModalOpen(false);
        return;
      }

      await signInWithPopup(auth, googleProvider);
      setIsAuthModalOpen(false);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (
        !Capacitor.isNativePlatform() &&
        (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment')
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          const msg = formatFirebaseAuthError(redirectErr, 'google');
          if (msg) setAuthError(msg);
          return;
        }
      }
      const msg = formatFirebaseAuthError(err, 'google');
      if (msg) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) {
      setAuthError('Firebase Authentication is not configured.');
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setAuthError('Please enter both your email and password.');
      return;
    }
    setAuthError(null);
    setAuthNotice(null);
    setAuthLoading(true);
    const projectId = auth.app.options.projectId || firebaseDiagnostics.projectId;
    console.info('[KuroStream Auth] Attempting Email/Password sign-in', {
      projectId,
      runtime: firebaseDiagnostics.runtime,
      authInitStatus: firebaseDiagnostics.authInitStatus,
    });
    try {
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      await cred.user.reload().catch(() => {});
      console.info('[KuroStream Auth] Email/Password sign-in succeeded', {
        projectId,
        emailVerified: cred.user.emailVerified,
      });
      if (cred.user.emailVerified) {
        setIsAuthModalOpen(false);
      } else {
        setAuthNotice(
          'Signed in! Please verify your email address via the link sent to your inbox to enable Firestore cloud sync.'
        );
      }
    } catch (err) {
      const code = (err as { code?: string } | null)?.code || 'unknown';
      console.warn('[KuroStream Auth] Email/Password sign-in error', {
        projectId,
        code,
      });
      const msg = formatFirebaseAuthError(err, 'email');
      if (msg) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const registerWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!auth) {
        setAuthError('Firebase Authentication is not configured.');
        return;
      }
      const trimmedEmail = email.trim();
      const trimmedName = displayName?.trim() || '';
      if (!trimmedEmail || !password) {
        setAuthError('Please enter an email address and password.');
        return;
      }
      setAuthError(null);
      setAuthNotice(null);
      setAuthLoading(true);
      const projectId = auth.app.options.projectId || firebaseDiagnostics.projectId;
      console.info('[KuroStream Auth] Attempting Email/Password registration', {
        projectId,
        runtime: firebaseDiagnostics.runtime,
      });
      try {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        if (trimmedName) {
          await updateProfile(cred.user, {
            displayName: trimmedName.slice(0, 80),
          }).catch(() => {});
        }
        await sendEmailVerification(cred.user).catch(() => {});
        console.info('[KuroStream Auth] Email/Password registration succeeded', {
          projectId,
          emailVerified: cred.user.emailVerified,
        });
        setAuthNotice(
          'Account created! A verification link has been sent to your email. Verify your email to activate Firestore cloud sync.'
        );
      } catch (err) {
        const code = (err as { code?: string } | null)?.code || 'unknown';
        console.warn('[KuroStream Auth] Email/Password registration error', {
          projectId,
          code,
        });
        const msg = formatFirebaseAuthError(err, 'email');
        if (msg) setAuthError(msg);
      } finally {
        setAuthLoading(false);
      }
    },
    []
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!auth?.currentUser) return;
    setAuthError(null);
    setAuthNotice(null);
    setAuthLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setAuthNotice('Verification email sent. Check your inbox and spam folder.');
    } catch (err) {
      const msg = formatFirebaseAuthError(err, 'email');
      if (msg) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const refreshEmailVerification = useCallback(async () => {
    if (!auth?.currentUser) return;
    setAuthError(null);
    setAuthNotice(null);
    setAuthLoading(true);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      setUser(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        setAuthNotice('Email verified! Cloud sync is now active.');
        setIsAuthModalOpen(false);
      } else {
        setAuthError('Email is not verified yet. Please click the link sent to your email first.');
      }
    } catch (err) {
      const msg = formatFirebaseAuthError(err, 'email');
      if (msg) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!auth) {
      setAuthError('Firebase is not configured.');
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError('Enter your email address first to reset your password.');
      return;
    }
    setAuthError(null);
    setAuthNotice(null);
    setAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setAuthNotice('Password reset email sent. Check your inbox.');
    } catch (err) {
      const msg = formatFirebaseAuthError(err, 'email');
      if (msg) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (auth && user) {
      await firebaseSignOut(auth);
      setIsAdmin(false);
    }
    if (Capacitor.isNativePlatform()) {
      await SocialLogin.logout({ provider: 'google' }).catch(() => {});
    }
  }, [user]);

  const getIdToken = useCallback(
    async (forceRefresh = false): Promise<string | null> => {
      const currentUser = auth?.currentUser || user;
      if (!currentUser) return null;
      try {
        let token = await currentUser.getIdToken(forceRefresh);
        if (typeof token !== 'string' || token.split('.').length !== 3) {
          if (!forceRefresh) {
            token = await currentUser.getIdToken(true);
          }
        }
        return typeof token === 'string' && token.split('.').length === 3 ? token : null;
      } catch (err) {
        const code = (err as { code?: string } | null)?.code || 'unknown';
        console.warn('[KuroStream Auth] Failed to obtain Firebase ID token', {
          projectId: auth?.app?.options?.projectId || firebaseDiagnostics.projectId,
          forceRefresh,
          code,
        });
        if (!forceRefresh) {
          try {
            const retried = await currentUser.getIdToken(true);
            return typeof retried === 'string' && retried.split('.').length === 3 ? retried : null;
          } catch {
            return null;
          }
        }
        return null;
      }
    },
    [user]
  );

  const hasVerifiedCloudSession = Boolean(user && user.emailVerified);
  const watchlist = hasVerifiedCloudSession ? cloudWatchlist : [];
  const favorites = hasVerifiedCloudSession ? cloudFavorites : [];
  const history = hasVerifiedCloudSession ? cloudHistory : [];
  const preferences = hasVerifiedCloudSession ? cloudPrefs : sessionPrefs;
  const watchStats = useMemo<UserWatchStats>(() => {
    if (!hasVerifiedCloudSession) return DEFAULT_WATCH_STATS;
    return {
      ...cloudWatchStats,
      dailyWatchSeconds: {
        ...(cloudWatchStats.dailyWatchSeconds || {}),
        ...cloudDailyActivity,
      },
    };
  }, [hasVerifiedCloudSession, cloudWatchStats, cloudDailyActivity]);
  const equippedBadges = useMemo<AchievementId[]>(() => {
    if (!hasVerifiedCloudSession) return [];
    return normalizeEquippedBadges(cloudEquippedBadges, watchStats, isAdmin);
  }, [hasVerifiedCloudSession, cloudEquippedBadges, watchStats, isAdmin]);

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
      if (!user || !user.emailVerified || !db) {
        setAuthError(null);
        setAuthNotice(
          user && !user.emailVerified
            ? 'Verify your email address to save anime to your watchlist.'
            : 'Sign in with Google or Email to save anime to your watchlist.'
        );
        setIsAuthModalOpen(true);
        return;
      }

      const title = (getDisplayTitle(anime.title).trim() || 'Untitled').slice(0, 240);
      const coverImage = (anime.coverImage?.large || anime.coverImage?.extraLarge || '').slice(0, 500);
      const exists = watchlist.some((w) => w.animeId === anime.id);
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
    },
    [user, watchlist]
  );

  const toggleFavorite = useCallback(
    async (anime: AnimeSummary) => {
      if (!user || !user.emailVerified || !db) {
        setAuthError(null);
        setAuthNotice(
          user && !user.emailVerified
            ? 'Verify your email address to save favorite anime.'
            : 'Sign in with Google or Email to save favorite anime.'
        );
        setIsAuthModalOpen(true);
        return;
      }

      const title = (getDisplayTitle(anime.title).trim() || 'Untitled').slice(0, 240);
      const coverImage = (anime.coverImage?.large || anime.coverImage?.extraLarge || '').slice(0, 500);
      const exists = favorites.some((f) => f.animeId === anime.id);
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
    },
    [user, favorites]
  );

  const saveWatchProgress = useCallback(
    async (item: Omit<WatchHistoryItem, 'updatedAt'>) => {
      if (!user || !user.emailVerified || !db) {
        return;
      }

      const safeTitle = (item.title?.trim() || 'Untitled').slice(0, 240);
      const safeCover = (item.coverImage || '').slice(0, 500);
      const safeEpId = (item.episodeId?.trim() || 'ep-1').slice(0, 200);
      const safeEpTitle = item.episodeTitle ? item.episodeTitle.slice(0, 240) : undefined;
      const safeServerName = item.serverName ? item.serverName.slice(0, 80) : undefined;
      const safeEpNumber = Math.max(0, Number(item.episodeNumber) || 0);
      const safeProgress = Math.max(0, Math.floor(item.progressSeconds || 0));
      const safeDuration = Math.max(0, Math.floor(item.durationSeconds || 0));

      const safeAudio =
        item.audioMode === 'dub'
          ? 'dub'
          : item.audioMode === 'hindi'
            ? 'hindi'
            : 'sub';
      const now = Date.now();
      const prevWrite = lastSavedProgressRef.current.get(item.animeId);
      const isSameTrack =
        prevWrite &&
        prevWrite.episodeId === safeEpId &&
        prevWrite.episodeNumber === safeEpNumber &&
        prevWrite.audioMode === safeAudio;
      const isCompletion = safeDuration > 0 && safeProgress >= safeDuration - 3;
      const deltaSeconds = prevWrite ? Math.abs(safeProgress - prevWrite.progressSeconds) : 999;

      if (
        isSameTrack &&
        !isCompletion &&
        deltaSeconds < 14 &&
        now - prevWrite.writtenAt < 14500
      ) {
        return;
      }

      lastSavedProgressRef.current.set(item.animeId, {
        episodeId: safeEpId,
        episodeNumber: safeEpNumber,
        audioMode: safeAudio,
        progressSeconds: safeProgress,
        writtenAt: now,
      });

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
          audioMode: safeAudio,
          updatedAt: serverTimestamp(),
        };
        if (safeEpTitle) payload.episodeTitle = safeEpTitle;
        if (safeServerName) payload.serverName = safeServerName;
        await setDoc(doc(db, path), payload);
      } catch (err) {
        logFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user]
  );

  const removeHistoryItem = useCallback(
    async (animeId: number) => {
      if (!user || !user.emailVerified || !db) return;
      const path = `users/${user.uid}/history/${animeId}`;
      try {
        await deleteDoc(doc(db, path));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const clearHistory = useCallback(async () => {
    if (!user || !user.emailVerified || !db || cloudHistory.length === 0) return;
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
  }, [user, cloudHistory]);

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (patch.theme) {
        applyTheme(patch.theme);
      }

      if (user && user.emailVerified && db) {
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
          if (typeof patch.bannerURL === 'string' && patch.bannerURL.trim()) {
            updatePayload.bannerURL = patch.bannerURL.trim().slice(0, 500);
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

      if (patch.displayName !== undefined || patch.photoURL !== undefined || patch.bannerURL !== undefined) {
        setAuthError(null);
        setAuthNotice('Sign in to customize and save your profile.');
        setIsAuthModalOpen(true);
        return;
      }

      setSessionPrefs((prev) => ({
        ...prev,
        ...patch,
      }));
    },
    [user]
  );

  const recordWatchPlayback = useCallback(
    async (input: PlaybackRecordInput) => {
      if (!user || !user.emailVerified || !db) return;

      const currentBase: UserWatchStats = {
        ...cloudWatchStatsRef.current,
        dailyWatchSeconds: {
          ...(cloudWatchStatsRef.current.dailyWatchSeconds || {}),
          ...cloudDailyActivityRef.current,
        },
      };
      const res = recordWatchPlaybackLocally(input, currentBase);
      if (!res.changed) return;

      cloudWatchStatsRef.current = res.stats;
      cloudDailyActivityRef.current = {
        ...cloudDailyActivityRef.current,
        [res.todayKey]: res.todayDaySeconds,
      };
      setCloudWatchStats(res.stats);
      setCloudDailyActivity(cloudDailyActivityRef.current);

      const userPath = `users/${user.uid}`;
      const monthPath = `users/${user.uid}/watchActivity/${res.monthKey}`;

      const prevSynced = lastSyncedArraysRef.current;
      const isSameUid = prevSynced?.uid === user.uid;
      const streakDaysChanged =
        !isSameUid || prevSynced.streakDaysLen !== res.stats.streakWatchedDays.length;
      const watchedAnimeChanged =
        !isSameUid || prevSynced.watchedAnimeLen !== res.stats.watchedAnimeIds.length;
      const achievementsChanged =
        !isSameUid || prevSynced.achievementsLen !== res.stats.unlockedAchievements.length;

      try {
        const updatePayload: Record<string, unknown> = {
          streakCurrent: res.stats.streakCurrent,
          streakLongest: res.stats.streakLongest,
          totalEpisodesCompleted: res.stats.totalEpisodesCompleted,
          todayEpisodesCompleted: res.stats.todayEpisodesCompleted,
          todayCompletedDate: res.stats.todayCompletedDate || res.todayKey,
          totalWatchSeconds: res.stats.totalWatchSeconds,
          todayWatchSeconds: res.stats.todayWatchSeconds,
          todayWatchDate: res.stats.todayWatchDate || res.todayKey,
          updatedAt: serverTimestamp(),
        };
        if (streakDaysChanged) {
          updatePayload.streakWatchedDays = res.stats.streakWatchedDays;
        }
        if (watchedAnimeChanged) {
          updatePayload.watchedAnimeIds = res.stats.watchedAnimeIds;
        }
        if (achievementsChanged) {
          updatePayload.unlockedAchievements = res.stats.unlockedAchievements;
          updatePayload.achievementUnlockDates = res.stats.achievementUnlockDates;
        }
        if (res.stats.streakLastWatchedDate) {
          updatePayload.streakLastWatchedDate = res.stats.streakLastWatchedDate;
        }

        lastSyncedArraysRef.current = {
          uid: user.uid,
          streakDaysLen: res.stats.streakWatchedDays.length,
          watchedAnimeLen: res.stats.watchedAnimeIds.length,
          achievementsLen: res.stats.unlockedAchievements.length,
        };

        const monthDays: Record<string, number> = {};
        for (const [dateKey, secs] of Object.entries(res.stats.dailyWatchSeconds || {})) {
          if (
            dateKey.startsWith(`${res.monthKey}-`) &&
            typeof secs === 'number' &&
            Number.isFinite(secs) &&
            secs >= 0
          ) {
            monthDays[dateKey] = Math.round(secs);
          }
        }
        monthDays[res.todayKey] = Math.round(res.todayDaySeconds);

        await Promise.all([
          updateDoc(doc(db, userPath), updatePayload),
          setDoc(
            doc(db, monthPath),
            {
              ownerId: user.uid,
              monthKey: res.monthKey,
              days: monthDays,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ),
        ]);
      } catch (err) {
        logFirestoreError(err, OperationType.UPDATE, userPath);
      }
    },
    [user]
  );

  const recordWatchCompletion = useCallback(
    async (animeId: number, episodeNumber: number) => {
      await recordWatchPlayback({
        animeKey: `anilist:${animeId}`,
        animeId,
        episodeNumber,
        secondsWatched: 0,
        completed: true,
      });
    },
    [recordWatchPlayback]
  );

  const equipBadge = useCallback(
    async (badgeId: AchievementId): Promise<EquipBadgeResult> => {
      if (!user || !user.emailVerified || !db) {
        setAuthError(null);
        setAuthNotice(
          user && !user.emailVerified
            ? 'Verify your email address to equip badges on your profile.'
            : 'Sign in with Google or Email to equip badges on your profile.'
        );
        setIsAuthModalOpen(true);
        return {
          ok: false,
          equipped: false,
          reason: 'auth_required',
          message: 'Please sign in to equip badges on your profile.',
        };
      }

      const targetBadge = ACHIEVEMENT_BADGES.find((b) => b.id === badgeId);
      if (!targetBadge) {
        return {
          ok: false,
          equipped: false,
          reason: 'error',
          message: 'Unknown badge selected.',
        };
      }

      const currentStats: UserWatchStats = {
        ...cloudWatchStatsRef.current,
        dailyWatchSeconds: {
          ...(cloudWatchStatsRef.current.dailyWatchSeconds || {}),
          ...cloudDailyActivityRef.current,
        },
      };
      const progress = getBadgeProgress(targetBadge, currentStats, isAdmin);
      if (!isAdmin && !progress.unlocked) {
        return {
          ok: false,
          equipped: false,
          reason: 'locked',
          message: 'Unlock this badge before adding it to your profile.',
        };
      }

      const currentEquipped = normalizeEquippedBadges(
        cloudEquippedBadgesRef.current,
        currentStats,
        isAdmin
      );

      if (currentEquipped.includes(badgeId)) {
        return {
          ok: true,
          equipped: true,
          message: `${targetBadge.title} is already displayed on your profile.`,
        };
      }

      if (currentEquipped.length >= MAX_EQUIPPED_BADGES) {
        return {
          ok: false,
          equipped: false,
          reason: 'max_limit',
          message: `You can display up to ${MAX_EQUIPPED_BADGES} badges on your profile. Remove one first to add ${targetBadge.title}.`,
        };
      }

      const prevRaw = [...cloudEquippedBadgesRef.current];
      const nextEquipped = [...currentEquipped, badgeId];
      cloudEquippedBadgesRef.current = nextEquipped;
      setCloudEquippedBadges(nextEquipped);
      setEquippingBadgeId(badgeId);

      const userPath = `users/${user.uid}`;
      try {
        const updatePayload: Record<string, unknown> = {
          equippedBadges: nextEquipped,
          updatedAt: serverTimestamp(),
        };

        // Ensure stat-earned badges for non-admins are also reflected in unlockedAchievements
        if (!isAdmin && !currentStats.unlockedAchievements.includes(badgeId)) {
          const nextUnlocked = Array.from(
            new Set([...currentStats.unlockedAchievements, badgeId])
          );
          const nextDates = {
            ...currentStats.achievementUnlockDates,
            [badgeId]:
              currentStats.achievementUnlockDates[badgeId] || new Date().toISOString(),
          };
          updatePayload.unlockedAchievements = nextUnlocked;
          updatePayload.achievementUnlockDates = nextDates;
        }

        await updateDoc(doc(db, userPath), updatePayload);
        return {
          ok: true,
          equipped: true,
          message: `${targetBadge.title} added to My Badges.`,
        };
      } catch (err) {
        cloudEquippedBadgesRef.current = prevRaw;
        setCloudEquippedBadges(prevRaw);
        logFirestoreError(err, OperationType.UPDATE, userPath);
        return {
          ok: false,
          equipped: false,
          reason: 'error',
          message: 'Failed to save badge selection to Firebase. Please try again.',
        };
      } finally {
        setEquippingBadgeId((cur) => (cur === badgeId ? null : cur));
      }
    },
    [user, isAdmin]
  );

  const unequipBadge = useCallback(
    async (badgeId: AchievementId): Promise<EquipBadgeResult> => {
      if (!user || !user.emailVerified || !db) {
        setIsAuthModalOpen(true);
        return {
          ok: false,
          equipped: false,
          reason: 'auth_required',
          message: 'Please sign in to manage your profile badges.',
        };
      }

      const targetBadge = ACHIEVEMENT_BADGES.find((b) => b.id === badgeId);
      const currentStats: UserWatchStats = {
        ...cloudWatchStatsRef.current,
        dailyWatchSeconds: {
          ...(cloudWatchStatsRef.current.dailyWatchSeconds || {}),
          ...cloudDailyActivityRef.current,
        },
      };
      const currentEquipped = normalizeEquippedBadges(
        cloudEquippedBadgesRef.current,
        currentStats,
        isAdmin
      );

      if (!currentEquipped.includes(badgeId)) {
        return {
          ok: true,
          equipped: false,
        };
      }

      const prevRaw = [...cloudEquippedBadgesRef.current];
      const nextEquipped = currentEquipped.filter((id) => id !== badgeId);
      cloudEquippedBadgesRef.current = nextEquipped;
      setCloudEquippedBadges(nextEquipped);
      setEquippingBadgeId(badgeId);

      const userPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, userPath), {
          equippedBadges: nextEquipped,
          updatedAt: serverTimestamp(),
        });
        return {
          ok: true,
          equipped: false,
          message: targetBadge
            ? `${targetBadge.title} removed from My Badges.`
            : 'Badge removed from My Badges.',
        };
      } catch (err) {
        cloudEquippedBadgesRef.current = prevRaw;
        setCloudEquippedBadges(prevRaw);
        logFirestoreError(err, OperationType.UPDATE, userPath);
        return {
          ok: false,
          equipped: true,
          reason: 'error',
          message: 'Failed to remove badge from profile. Please try again.',
        };
      } finally {
        setEquippingBadgeId((cur) => (cur === badgeId ? null : cur));
      }
    },
    [user, isAdmin]
  );

  const toggleEquipBadge = useCallback(
    async (badgeId: AchievementId): Promise<EquipBadgeResult> => {
      const currentStats: UserWatchStats = {
        ...cloudWatchStatsRef.current,
        dailyWatchSeconds: {
          ...(cloudWatchStatsRef.current.dailyWatchSeconds || {}),
          ...cloudDailyActivityRef.current,
        },
      };
      const currentEquipped = normalizeEquippedBadges(
        cloudEquippedBadgesRef.current,
        currentStats,
        isAdmin
      );
      if (currentEquipped.includes(badgeId)) {
        return unequipBadge(badgeId);
      }
      return equipBadge(badgeId);
    },
    [equipBadge, unequipBadge, isAdmin]
  );

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      authReady,
      isAdmin,
      firebaseEnabled: isFirebaseConfigured,
      getIdToken,
      preferences,
      watchStats,
      equippedBadges,
      equippingBadgeId,
      watchlist,
      favorites,
      history,
      isAuthModalOpen,
      authError,
      authNotice,
      authLoading,
      clearAuthMessages,
      openAuthModal,
      closeAuthModal,
      signInWithGoogle,
      signInWithEmail,
      registerWithEmail,
      resendVerificationEmail,
      refreshEmailVerification,
      sendPasswordReset,
      signOut,
      isInWatchlist,
      isFavorite,
      getHistoryForAnime,
      toggleWatchlist,
      toggleFavorite,
      saveWatchProgress,
      recordWatchPlayback,
      recordWatchCompletion,
      removeHistoryItem,
      clearHistory,
      updatePreferences,
      equipBadge,
      unequipBadge,
      toggleEquipBadge,
    }),
    [
      user,
      authReady,
      isAdmin,
      getIdToken,
      preferences,
      watchStats,
      equippedBadges,
      equippingBadgeId,
      watchlist,
      favorites,
      history,
      isAuthModalOpen,
      authError,
      authNotice,
      authLoading,
      clearAuthMessages,
      openAuthModal,
      closeAuthModal,
      signInWithGoogle,
      signInWithEmail,
      registerWithEmail,
      resendVerificationEmail,
      refreshEmailVerification,
      sendPasswordReset,
      signOut,
      isInWatchlist,
      isFavorite,
      getHistoryForAnime,
      toggleWatchlist,
      toggleFavorite,
      saveWatchProgress,
      recordWatchPlayback,
      recordWatchCompletion,
      removeHistoryItem,
      clearHistory,
      updatePreferences,
      equipBadge,
      unequipBadge,
      toggleEquipBadge,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
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
