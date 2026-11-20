import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
import { ASSETS } from '@/src/config/env';
import {
  auth,
  db,
  firebaseOAuthClientId,
  googleProvider,
  handleFirestoreError,
  isFirebaseConfigured,
  logFirestoreError,
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
        ? 'Google Sign-In provider is not enabled in Firebase Authentication Console.'
        : 'Email/Password sign-in is not enabled in Firebase Authentication Console yet.';
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
    (lower.includes('nocredential') ||
      lower.includes('no credentials') ||
      lower.includes('developer_error') ||
      lower.includes('developer error') ||
      lower.includes('10:') ||
      lower.includes('16:'))
  ) {
    return 'Native Google Sign-In could not find a matching Android OAuth credential for com.kurostream.app. Register your APK SHA-1/SHA-256 in Google Cloud / Firebase Console, or sign in with Email/Password or Guest Mode.';
  }

  return rawMessage || 'Unable to sign in.';
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
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

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
      (error) => {
        logFirestoreError(error, OperationType.GET, userPath);
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

  const clearAuthMessages = useCallback(() => {
    setAuthError(null);
    setAuthNotice(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      setAuthError('Firebase is not configured. Using local Guest Mode.');
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
      setAuthError('Firebase is not configured. Using local Guest Mode.');
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
    try {
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      await cred.user.reload().catch(() => {});
      if (cred.user.emailVerified) {
        setIsAuthModalOpen(false);
      } else {
        setAuthNotice(
          'Signed in! Please verify your email address via the link sent to your inbox to enable Firestore cloud sync.'
        );
      }
    } catch (err) {
      const msg = formatFirebaseAuthError(err, 'email');
      if (msg) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const registerWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!auth) {
        setAuthError('Firebase is not configured. Using local Guest Mode.');
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
      try {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        if (trimmedName) {
          await updateProfile(cred.user, {
            displayName: trimmedName.slice(0, 80),
          }).catch(() => {});
        }
        await sendEmailVerification(cred.user).catch(() => {});
        setAuthNotice(
          'Account created! A verification link has been sent to your email. Verify your email to activate Firestore cloud sync.'
        );
      } catch (err) {
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

      if (user && user.emailVerified && db) {
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

      if (user && user.emailVerified && db) {
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

      if (user && user.emailVerified && db) {
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
          logFirestoreError(err, OperationType.WRITE, path);
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
      if (user && user.emailVerified && db) {
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
    if (user && user.emailVerified && db) {
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
      const activeStats = user && user.emailVerified ? cloudWatchStats : guestState.watchStats;
      const res = recordEpisodeCompletionLocally(animeId, episodeNumber, activeStats);

      if (user && user.emailVerified && db) {
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
          logFirestoreError(err, OperationType.UPDATE, path);
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

  const hasVerifiedCloudSession = Boolean(user && user.emailVerified);
  const activePreferences = hasVerifiedCloudSession ? cloudPrefs : guestState.preferences;
  const activeWatchlist = hasVerifiedCloudSession ? cloudWatchlist : guestState.watchlist;
  const activeFavorites = hasVerifiedCloudSession ? cloudFavorites : guestState.favorites;
  const activeHistory = hasVerifiedCloudSession ? cloudHistory : guestState.history;
  const activeWatchStats = hasVerifiedCloudSession ? cloudWatchStats : guestState.watchStats;

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isGuest,
        isAdmin,
        firebaseEnabled: isFirebaseConfigured,
        getIdToken,
        preferences: activePreferences,
        watchStats: activeWatchStats,
        watchlist: activeWatchlist,
        favorites: activeFavorites,
        history: activeHistory,
        isAuthModalOpen,
        authError,
        authNotice,
        authLoading,
        clearAuthMessages,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
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
