import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const INTRO_SESSION_KEY = 'kurostream_startup_intro_seen_v1';
const LOGO_SRC = '/assets/aistudio/file_000000004ebc8211a223cbd3b7d37859_6ea9f159.png';

interface ParticleSpec {
  id: number;
  left: string;
  bottom: string;
  size: number;
  delay: string;
  duration: string;
  color: 'purple' | 'violet' | 'crimson';
}

const PARTICLES: ParticleSpec[] = [
  { id: 1, left: '12%', bottom: '14%', size: 4, delay: '0.05s', duration: '2.6s', color: 'purple' },
  { id: 2, left: '21%', bottom: '28%', size: 3, delay: '0.25s', duration: '2.4s', color: 'crimson' },
  { id: 3, left: '28%', bottom: '10%', size: 5, delay: '0.15s', duration: '2.8s', color: 'violet' },
  { id: 4, left: '36%', bottom: '22%', size: 3, delay: '0.45s', duration: '2.3s', color: 'purple' },
  { id: 5, left: '44%', bottom: '12%', size: 4, delay: '0.1s', duration: '2.7s', color: 'crimson' },
  { id: 6, left: '53%', bottom: '18%', size: 3, delay: '0.35s', duration: '2.5s', color: 'violet' },
  { id: 7, left: '61%', bottom: '8%', size: 5, delay: '0.2s', duration: '2.9s', color: 'purple' },
  { id: 8, left: '69%', bottom: '24%', size: 3, delay: '0.5s', duration: '2.4s', color: 'crimson' },
  { id: 9, left: '77%', bottom: '14%', size: 4, delay: '0.12s', duration: '2.6s', color: 'violet' },
  { id: 10, left: '86%', bottom: '26%', size: 4, delay: '0.32s', duration: '2.5s', color: 'purple' },
  { id: 11, left: '18%', bottom: '62%', size: 3, delay: '0.4s', duration: '2.4s', color: 'violet' },
  { id: 12, left: '82%', bottom: '66%', size: 3, delay: '0.28s', duration: '2.5s', color: 'crimson' },
];

let hasPlayedInCurrentProcess = false;

function shouldShowIntroOnLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  if (hasPlayedInCurrentProcess) return false;

  if (Capacitor.isNativePlatform()) {
    return true;
  }

  try {
    if (window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1') {
      return false;
    }
  } catch {
    // ignore storage errors
  }

  return true;
}

export const StartupSplashIntro: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(() => shouldShowIntroOnLaunch());
  const [exiting, setExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (!visible) return;

    hasPlayedInCurrentProcess = true;
    try {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
    } catch {
      // ignore storage errors
    }

    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const prefersReduced = Boolean(mediaQuery?.matches);
    setReducedMotion(prefersReduced);

    const exitStartMs = prefersReduced ? 850 : 2350;
    const unmountMs = prefersReduced ? 1200 : 2820;

    const exitTimer = window.setTimeout(() => {
      setExiting(true);
    }, exitStartMs);

    const doneTimer = window.setTimeout(() => {
      setVisible(false);
    }, unmountMs);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#000000] select-none ${
        exiting ? 'pointer-events-none kuro-splash-exit' : ''
      }`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Step 2: Ambient purple and red neon background glows */}
      <div
        className={`pointer-events-none absolute -left-24 -top-24 h-[65vmax] w-[65vmax] rounded-full ${
          reducedMotion ? 'opacity-30' : 'kuro-splash-glow-purple'
        }`}
        style={{
          background:
            'radial-gradient(circle, rgba(168, 85, 247, 0.34) 0%, rgba(124, 58, 237, 0.14) 38%, rgba(0, 0, 0, 0) 70%)',
        }}
      />
      <div
        className={`pointer-events-none absolute -bottom-24 -right-24 h-[65vmax] w-[65vmax] rounded-full ${
          reducedMotion ? 'opacity-25' : 'kuro-splash-glow-red'
        }`}
        style={{
          background:
            'radial-gradient(circle, rgba(239, 68, 68, 0.28) 0%, rgba(190, 18, 60, 0.12) 40%, rgba(0, 0, 0, 0) 70%)',
        }}
      />

      {/* Cinematic horizontal anamorphic light streak behind logo */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 ${
          reducedMotion ? 'opacity-20' : 'kuro-splash-horizon'
        }`}
        style={{
          background:
            'linear-gradient(90deg, transparent 5%, rgba(168, 85, 247, 0.55) 35%, rgba(255, 255, 255, 0.7) 50%, rgba(239, 68, 68, 0.55) 65%, transparent 95%)',
        }}
      />

      {/* Step 7: Floating purple & crimson bokeh particles */}
      {!reducedMotion && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {PARTICLES.map((p) => {
            const bg =
              p.color === 'crimson'
                ? 'rgba(244, 63, 94, 0.85)'
                : p.color === 'violet'
                  ? 'rgba(192, 132, 252, 0.9)'
                  : 'rgba(168, 85, 247, 0.85)';
            const shadow =
              p.color === 'crimson'
                ? '0 0 12px 2px rgba(244, 63, 94, 0.65)'
                : '0 0 12px 2px rgba(168, 85, 247, 0.7)';
            return (
              <span
                key={p.id}
                className="kuro-splash-particle absolute rounded-full"
                style={{
                  left: p.left,
                  bottom: p.bottom,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  backgroundColor: bg,
                  boxShadow: shadow,
                  animationDelay: p.delay,
                  animationDuration: p.duration,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Center Logo Stage */}
      <div className="relative z-10 flex flex-col items-center px-6">
        <div
          className={`relative h-56 w-56 sm:h-64 sm:w-64 ${
            reducedMotion ? 'kuro-splash-logo-reduced' : 'kuro-splash-logo-reveal'
          }`}
        >
          {/* Ambient halo behind logo frame */}
          <div
            className={`pointer-events-none absolute -inset-6 rounded-[48px] ${
              reducedMotion ? 'opacity-35' : 'kuro-splash-halo'
            }`}
            style={{
              background:
                'radial-gradient(circle, rgba(168, 85, 247, 0.38) 0%, rgba(225, 29, 72, 0.22) 55%, rgba(0, 0, 0, 0) 76%)',
            }}
          />

          {/* Existing KuroStream Logo preserved intact */}
          <div className="relative h-full w-full overflow-hidden rounded-[22%] bg-[#000000] shadow-[0_0_48px_-8px_rgba(168,85,247,0.45)]">
            <img
              src={LOGO_SRC}
              alt="KuroStream"
              className="h-full w-full object-cover"
              draggable={false}
            />

            {/* Step 6: Subtle glowing pulse anchored to the play button emblem */}
            {!reducedMotion && (
              <div
                className="kuro-splash-play-pulse pointer-events-none absolute rounded-full"
                style={{
                  right: '11.5%',
                  top: '39.5%',
                  width: '21%',
                  height: '21%',
                  background:
                    'radial-gradient(circle, rgba(255, 255, 255, 0.48) 0%, rgba(168, 85, 247, 0.5) 45%, rgba(239, 68, 68, 0.28) 72%, rgba(0, 0, 0, 0) 100%)',
                  mixBlendMode: 'screen',
                }}
              />
            )}

            {/* Step 5: Specular light sweep across the KuroStream text band */}
            {!reducedMotion && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-[13%] h-[21%] overflow-hidden"
                style={{ mixBlendMode: 'screen' }}
              >
                <div
                  className="kuro-splash-text-sweep h-full w-2/3"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent 10%, rgba(192, 132, 252, 0.35) 38%, rgba(255, 255, 255, 0.85) 50%, rgba(244, 63, 94, 0.38) 62%, transparent 90%)',
                  }}
                />
              </div>
            )}
          </div>

          {/* Step 4: Animated purple and red neon outline tracing the logo perimeter */}
          <svg
            viewBox="0 0 240 240"
            className="pointer-events-none absolute -inset-[3px] h-[calc(100%+6px)] w-[calc(100%+6px)]"
            fill="none"
          >
            <defs>
              <linearGradient id="kuroNeonStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="50%" stopColor="#ec4899" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <rect
              x="4"
              y="4"
              width="232"
              height="232"
              rx="51"
              ry="51"
              stroke="url(#kuroNeonStroke)"
              strokeWidth="2.5"
              strokeLinecap="round"
              className={reducedMotion ? 'opacity-75' : 'kuro-splash-neon-outline'}
            />
          </svg>
        </div>

        {/* Step 8: Tagline reveal */}
        <div
          className={`mt-7 flex items-center gap-3 ${
            reducedMotion ? 'kuro-splash-tagline-reduced' : 'kuro-splash-tagline'
          }`}
        >
          <span
            className="h-px w-8 sm:w-10"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.85))',
            }}
          />
          <p className="font-display text-xs sm:text-sm font-semibold tracking-[0.28em] text-slate-100 whitespace-nowrap">
            WATCH <span className="text-purple-400">•</span> STREAM{' '}
            <span className="text-rose-500">•</span> ENJOY
          </p>
          <span
            className="h-px w-8 sm:w-10"
            style={{
              background: 'linear-gradient(90deg, rgba(244, 63, 94, 0.85), transparent)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
