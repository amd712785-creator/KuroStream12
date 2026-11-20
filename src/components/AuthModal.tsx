import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Loader2,
  Lock,
  LogIn,
  Mail,
  RefreshCw,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';

export const AuthModal: React.FC = () => {
  const {
    user,
    isAuthModalOpen,
    closeAuthModal,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resendVerificationEmail,
    refreshEmailVerification,
    sendPasswordReset,
    signOut,
    firebaseEnabled,
    authError,
    authNotice,
    authLoading,
    clearAuthMessages,
    preferences,
    updatePreferences,
  } = useAuth();

  const [authTab, setAuthTab] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [guestName, setGuestName] = useState(preferences.displayName);
  const [guestSaved, setGuestSaved] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authTab === 'signin') {
      await signInWithEmail(email, password);
    } else {
      await registerWithEmail(email, password, displayName);
    }
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guestName.trim()) {
      await updatePreferences({ displayName: guestName.trim() });
      setGuestSaved(true);
      window.setTimeout(() => {
        setGuestSaved(false);
        closeAuthModal();
      }, 600);
    } else {
      closeAuthModal();
    }
  };

  const isPendingEmailVerification = Boolean(user && !user.emailVerified);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="kuro-glass-elevated relative my-auto max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl p-5 sm:p-6">
        <button
          type="button"
          onClick={closeAuthModal}
          aria-label="Close sign in dialog"
          className="kuro-btn-glass absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 id="auth-modal-title" className="text-xl font-bold text-white">
          Sign In or Create Account
        </h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Sync your watchlist, favorites, and continue-watching progress across devices.
        </p>

        {firebaseEnabled && isPendingEmailVerification && user && (
          <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
            <p className="font-semibold text-amber-200">Verify your email to activate Cloud Sync</p>
            <p className="mt-1 text-amber-100/80">
              Signed in as <span className="font-medium text-white">{user.email}</span>. Click the
              verification link sent to your inbox, then refresh below.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={authLoading}
                onClick={refreshEmailVerification}
                className="kuro-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${authLoading ? 'animate-spin' : ''}`} />
                <span>I&apos;ve Verified — Refresh</span>
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={resendVerificationEmail}
                className="kuro-btn-glass inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                <span>Resend Email</span>
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={signOut}
                className="kuro-btn-glass inline-flex min-h-[38px] items-center rounded-xl px-3 py-1.5 text-xs font-medium text-slate-300"
              >
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {firebaseEnabled && !isPendingEmailVerification && (
          <div className="mt-6 space-y-5">
            <div>
              <button
                type="button"
                disabled={authLoading}
                onClick={signInWithGoogle}
                className="kuro-btn-primary flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
              >
                {authLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                <span>Continue with Google</span>
              </button>
              <div className="mt-2.5 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Cloud className="h-3.5 w-3.5 text-violet-400" />
                <span>Cloud sync enabled with Firebase Authentication &amp; Firestore</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
              <div className="mb-3 flex gap-1.5 rounded-xl bg-[#07080d]/70 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signin');
                    clearAuthMessages();
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                    authTab === 'signin'
                      ? 'bg-violet-600/80 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Email Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    clearAuthMessages();
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                    authTab === 'register'
                      ? 'bg-violet-600/80 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-2.5">
                {authTab === 'register' && (
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      maxLength={80}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display Name (optional)"
                      className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d]/85 pl-9 pr-3 text-sm text-slate-100 focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d]/85 pl-9 pr-3 text-sm text-slate-100 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={authTab === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 characters)"
                    className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d]/85 pl-9 pr-3 text-sm text-slate-100 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {authTab === 'signin' ? (
                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={() => sendPasswordReset(email)}
                      className="text-xs font-medium text-violet-300 hover:text-violet-200"
                    >
                      Forgot password?
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500">Email verification required</span>
                  )}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="kuro-btn-glass inline-flex min-h-[38px] items-center justify-center gap-2 rounded-xl px-4 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    {authLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{authTab === 'signin' ? 'Sign In' : 'Register'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {authNotice && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
            {authNotice}
          </div>
        )}

        {authError && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
            {authError}
          </div>
        )}

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.08]" />
          <span className="text-xs font-medium text-slate-500">or use local guest mode</span>
          <div className="h-px flex-1 bg-white/[0.08]" />
        </div>

        <form onSubmit={handleGuestSubmit} className="space-y-3">
          <label className="block text-xs font-medium text-slate-300" htmlFor="guest-display-name">
            Guest Profile Name
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              id="guest-display-name"
              type="text"
              maxLength={80}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest Viewer"
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#07080d]/85 pl-9 pr-3 text-sm text-slate-100 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="kuro-btn-glass flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
          >
            {guestSaved ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Guest Profile Active</span>
              </>
            ) : (
              <span>Continue in Guest Mode</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

