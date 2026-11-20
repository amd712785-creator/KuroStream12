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
  color: 'purple' | 'magenta';
}

interface OrbitalParticleSpec {
  id: number;
  left: string;
  top: string;
  size: number;
  delay: string;
  tx: string;
  ty: string;
  color: 'purple' | 'magenta';
}

// Phase 1 (0.0-0.7s+): Subtle floating purple and magenta ambient particles
const AMBIENT_PARTICLES: ParticleSpec[] = [
  { id: 1, left: '10%', bottom: '14%', size: 4, delay: '0.00s', duration: '3.2s', color: 'purple' },
  { id: 2, left: '19%', bottom: '28%', size: 3, delay: '0.12s', duration: '3.0s', color: 'magenta' },
  { id: 3, left: '27%', bottom: '10%', size: 5, delay: '0.08s', duration: '3.4s', color: 'purple' },
  { id: 4, left: '36%', bottom: '22%', size: 3, delay: '0.25s', duration: '2.9s', color: 'magenta' },
  { id: 5, left: '45%', bottom: '12%', size: 4, delay: '0.05s', duration: '3.3s', color: 'purple' },
  { id: 6, left: '54%', bottom: '18%', size: 3, delay: '0.18s', duration: '3.1s', color: 'magenta' },
  { id: 7, left: '63%', bottom: '9%', size: 5, delay: '0.10s', duration: '3.4s', color: 'purple' },
  { id: 8, left: '72%', bottom: '24%', size: 3, delay: '0.28s', duration: '3.0s', color: 'magenta' },
  { id: 9, left: '81%', bottom: '15%', size: 4, delay: '0.07s', duration: '3.2s', color: 'purple' },
  { id: 10, left: '89%', bottom: '26%', size: 4, delay: '0.20s', duration: '3.1s', color: 'magenta' },
  { id: 11, left: '16%', bottom: '62%', size: 3, delay: '0.32s', duration: '2.8s', color: 'purple' },
  { id: 12, left: '84%', bottom: '66%', size: 3, delay: '0.22s', duration: '2.9s', color: 'magenta' },
];

// Phase 3 (1.5-2.5s): Subtle light particles moving around the centered logo
const ORBITAL_PARTICLES: OrbitalParticleSpec[] = [
  { id: 1, left: '8%', top: '18%', size: 4, delay: '1.50s', tx: '-18px', ty: '-22px', color: 'purple' },
  { id: 2, left: '92%', top: '20%', size: 4, delay: '1.58s', tx: '20px', ty: '-18px', color: 'magenta' },
  { id: 3, left: '6%', top: '76%', size: 3, delay: '1.65s', tx: '-22px', ty: '16px', color: 'magenta' },
  { id: 4, left: '94%', top: '74%', size: 4, delay: '1.70s', tx: '22px', ty: '14px', color: 'purple' },
  { id: 5, left: '28%', top: '6%', size: 3, delay: '1.62s', tx: '-10px', ty: '-24px', color: 'magenta' },
  { id: 6, left: '72%', top: '7%', size: 4, delay: '1.75s', tx: '12px', ty: '-22px', color: 'purple' },
  { id: 7, left: '24%', top: '94%', size: 3, delay: '1.80s', tx: '-14px', ty: '18px', color: 'purple' },
  { id: 8, left: '76%', top: '93%', size: 3, delay: '1.86s', tx: '14px', ty: '18px', color: 'magenta' },
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

    // Exact 4.0-second total timeline: 3.4s hold/sequence + 0.6s smooth exit = 4.0s
    const exitStartMs = 3400;
    const unmountMs = 4000;

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
      {/* Subtle purple and magenta atmospheric neon depth on pure black */}
      <div
        className={`pointer-events-none absolute -left-24 -top-24 h-[62vmax] w-[62vmax] rounded-full ${
          reducedMotion ? 'opacity-25' : 'kuro-splash-atmosphere'
        }`}
        style={{
          background:
            'radial-gradient(circle, rgba(147, 51, 234, 0.28) 0%, rgba(126, 34, 206, 0.1) 42%, rgba(0, 0, 0, 0) 72%)',
        }}
      />
      <div
        className={`pointer-events-none absolute -bottom-24 -right-24 h-[62vmax] w-[62vmax] rounded-full ${
          reducedMotion ? 'opacity-20' : 'kuro-splash-atmosphere'
        }`}
        style={{
          background:
            'radial-gradient(circle, rgba(217, 70, 239, 0.24) 0%, rgba(190, 24, 93, 0.1) 42%, rgba(0, 0, 0, 0) 72%)',
        }}
      />

      {/* Phase 1 (0.0-0.7s+): Purple & magenta glowing particles across black stage */}
      {!reducedMotion && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {AMBIENT_PARTICLES.map((p) => {
            const bg =
              p.color === 'magenta' ? 'rgba(232, 121, 249, 0.9)' : 'rgba(168, 85, 247, 0.9)';
            const shadow =
              p.color === 'magenta'
                ? '0 0 12px 2px rgba(217, 70, 239, 0.7)'
                : '0 0 12px 2px rgba(147, 51, 234, 0.75)';
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

      {/* Phase 2 (0.7-1.5s): Purple neon light sweeping cleanly across screen */}
      {!reducedMotion && (
        <div className="kuro-splash-sweep pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
          <div
            className="h-[140vh] w-32 sm:w-44 -rotate-12"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(147, 51, 234, 0.18) 30%, rgba(217, 70, 239, 0.42) 48%, rgba(255, 255, 255, 0.55) 50%, rgba(168, 85, 247, 0.4) 54%, transparent 100%)',
              mixBlendMode: 'screen',
            }}
          />
        </div>
      )}

      {/* Center Stage: Official KuroStream Logo + Glow + Play Pulse + Tagline */}
      <div className="relative z-10 flex flex-col items-center px-6">
        <div className="relative aspect-square w-56 sm:w-64">
          {/* Phase 3 (1.5-2.5s): Premium purple/magenta outer neon halo */}
          <div
            className={`pointer-events-none absolute -inset-8 rounded-full ${
              reducedMotion ? 'opacity-30' : 'kuro-splash-halo'
            }`}
            style={{
              background:
                'radial-gradient(circle, rgba(168, 85, 247, 0.45) 0%, rgba(217, 70, 239, 0.25) 45%, rgba(0, 0, 0, 0) 74%)',
            }}
          />

          {/* Phase 3 (1.5-2.5s): Subtle light particles orbiting the centered logo */}
          {!reducedMotion && (
            <div className="pointer-events-none absolute -inset-6">
              {ORBITAL_PARTICLES.map((p) => {
                const bg =
                  p.color === 'magenta' ? 'rgba(240, 171, 252, 0.95)' : 'rgba(192, 132, 252, 0.95)';
                const shadow =
                  p.color === 'magenta'
                    ? '0 0 10px 2px rgba(217, 70, 239, 0.75)'
                    : '0 0 10px 2px rgba(168, 85, 247, 0.8)';
                return (
                  <span
                    key={p.id}
                    className="kuro-splash-ring-particle absolute rounded-full"
                    style={
                      {
                        left: p.left,
                        top: p.top,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        backgroundColor: bg,
                        boxShadow: shadow,
                        animationDelay: p.delay,
                        '--tx': p.tx,
                        '--ty': p.ty,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </div>
          )}

          {/* Phase 2 (0.7-1.5s): Exact uncropped official KuroStream logo zooms smoothly to center */}
          <div
            className={`relative h-full w-full ${
              reducedMotion ? 'kuro-splash-logo-reduced' : 'kuro-splash-logo-reveal'
            }`}
          >
            <img
              src={LOGO_SRC}
              alt="KuroStream"
              loading="eager"
              decoding="sync"
              draggable={false}
              className="h-full w-full object-contain drop-shadow-[0_0_28px_rgba(168,85,247,0.38)]"
            />

            {/* Phase 3 (1.5-2.5s): Play button luminous pulse aligned on the official emblem */}
            {!reducedMotion && (
              <div
                className="kuro-splash-play-pulse pointer-events-none absolute rounded-full"
                style={{
                  left: '65%',
                  top: '34.5%',
                  width: '20%',
                  height: '20%',
                  background:
                    'radial-gradient(circle, rgba(255, 255, 255, 0.65) 0%, rgba(192, 132, 252, 0.55) 45%, rgba(217, 70, 239, 0.28) 72%, rgba(0, 0, 0, 0) 100%)',
                  mixBlendMode: 'screen',
                }}
              />
            )}
          </div>
        </div>

        {/* Phase 4 (2.5-3.4s): Smooth tagline fade-in */}
        <div
          className={`mt-6 flex items-center gap-3.5 ${
            reducedMotion ? 'kuro-splash-tagline-reduced' : 'kuro-splash-tagline'
          }`}
        >
          <span
            className="h-px w-8 sm:w-12"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.9))',
            }}
          />
          <p className="font-display text-sm sm:text-base font-semibold tracking-[0.2em] text-white whitespace-nowrap">
            Watch <span className="text-purple-400">•</span> Stream{' '}
            <span className="text-fuchsia-400">•</span> Enjoy
          </p>
          <span
            className="h-px w-8 sm:w-12"
            style={{
              background: 'linear-gradient(90deg, rgba(217, 70, 239, 0.9), transparent)',
            }}
          />
        </div>
      </div>
    </div>
  );
};

