import React, { useEffect } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ExternalLink, ShieldCheck, Sparkles, X } from 'lucide-react';
import { isNativeCapacitorRuntime } from '@/src/config/env';

export const ONE_DOT_ONE_VPN_URL = 'https://one.one.one.one/';

interface LoginVpnNoticeModalProps {
  open: boolean;
  onDismiss: () => void;
}

export const LoginVpnNoticeModal: React.FC<LoginVpnNoticeModalProps> = ({ open, onDismiss }) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onDismiss]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <motion.div
            key="login-vpn-notice-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismiss}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md"
          >
            <motion.div
              key="login-vpn-notice-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="kurostream-vpn-notice-title"
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-violet-400/40 bg-[#0b0d18]/95 p-5 sm:p-7 shadow-[0_28px_90px_-14px_rgba(139,92,246,0.68),0_0_40px_-10px_rgba(168,85,247,0.35)] backdrop-blur-2xl"
            >
              {/* Top neon hairline glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/90 to-transparent"
              />
              {/* Ambient purple neon aura */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-violet-600/25 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-fuchsia-600/20 blur-3xl"
              />

              {/* Dismiss button */}
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Close notice"
                className="kuro-btn-glass absolute right-3.5 top-3.5 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-slate-300 hover:text-white"
              >
                <X className="h-4.5 w-4.5" />
              </button>

              <div className="relative z-10 space-y-5">
                {/* Header */}
                <div className="flex items-center gap-3.5 pr-10">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/45 bg-gradient-to-br from-violet-600/35 to-fuchsia-600/25 text-violet-200 shadow-[0_0_24px_-4px_rgba(139,92,246,0.75)]">
                    <ShieldCheck className="h-6 w-6 text-violet-200" />
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-400 text-[#090b14] shadow">
                      <Sparkles className="h-2.5 w-2.5" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="kurostream-vpn-notice-title"
                      className="text-base sm:text-lg font-extrabold tracking-tight text-white leading-snug"
                    >
                      📢 KuroStream Important Notice
                    </h2>
                    <p className="mt-0.5 text-[11px] font-medium text-violet-300/90">
                      Streaming &amp; Connectivity Guide
                    </p>
                  </div>
                </div>

                {/* Notice Body */}
                <div className="rounded-2xl border border-violet-400/20 bg-white/[0.035] p-4 sm:p-4.5 text-[13.5px] sm:text-sm leading-relaxed text-slate-100 space-y-3 shadow-inner">
                  <p className="font-semibold text-violet-100">প্রিয় KuroStream User ❤️</p>
                  <p className="text-slate-200">
                    আমাদের অ্যাপে কোনো ভিডিও বা কনটেন্ট লোড হতে সমস্যা হলে{' '}
                    <span className="font-bold text-sky-300">1.1.1.1 VPN</span> ব্যবহার করুন।
                  </p>
                  <p className="text-slate-200">
                    <span className="font-semibold text-violet-300">KuroStream Global</span> আমাদের Primary Streaming Server। এখানে ভিডিও না চললে{' '}
                    <span className="font-semibold text-amber-300">AnimeWorld India Server</span> ব্যবহার করে দেখুন।
                  </p>
                  <p className="font-medium text-violet-100">
                    ধন্যবাদ KuroStream-এর সাথে থাকার জন্য। ❤️
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 pt-0.5">
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="kuro-btn-primary inline-flex min-h-[46px] flex-1 items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-950/60 whitespace-nowrap"
                  >
                    ঠিক আছে
                  </button>

                  <a
                    href={ONE_DOT_ONE_VPN_URL}
                    target={isNativeCapacitorRuntime() ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    className="kuro-btn-glass inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-2xl border-sky-400/35 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-200 hover:border-sky-400/60 hover:text-white whitespace-nowrap"
                  >
                    <span>Download 1.1.1.1 VPN</span>
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
};
