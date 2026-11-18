import React, { useState } from 'react';
import { CheckCircle2, Cloud, LogIn, User, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    signInWithGoogle,
    firebaseEnabled,
    authError,
    preferences,
    updatePreferences,
  } = useAuth();

  const [guestName, setGuestName] = useState(preferences.displayName);
  const [guestSaved, setGuestSaved] = useState(false);

  if (!isAuthModalOpen) return null;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="kuro-glass-elevated relative w-full max-w-md rounded-3xl p-6">
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

        {firebaseEnabled && (
          <div className="mt-6">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="kuro-btn-primary flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              <LogIn className="h-4 w-4" />
              <span>Continue with Google</span>
            </button>
            <div className="mt-2.5 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Cloud className="h-3.5 w-3.5 text-violet-400" />
              <span>Cloud sync enabled with Firebase Authentication &amp; Firestore</span>
            </div>
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
