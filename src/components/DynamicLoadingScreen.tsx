import React from 'react';
import { Loader2 } from 'lucide-react';
import { ASSETS } from '@/src/config/env';
import { useLoadingTheme } from '@/src/context/LoadingThemeContext';
import { LOADING_STYLE_DEFINITIONS } from '@/src/services/dynamicLoadingService';
import type { DynamicLoadingStyleId } from '@/src/types/anime';

interface DynamicLoadingScreenProps {
  mode?: 'fullscreen' | 'overlay' | 'embedded';
  backgroundImage?: string | null;
  message?: string;
  subMessage?: string;
  progress?: number | null;
  styleOverride?: DynamicLoadingStyleId;
  forceAnimated?: boolean;
}

const DEFAULT_MESSAGES = [
  'Preparing your anime...',
  'Loading characters...',
  'Connecting to streaming server...',
  'Preparing your episode...',
];

export const DynamicLoadingScreen: React.FC<DynamicLoadingScreenProps> = ({
  mode = 'overlay',
  backgroundImage,
  message,
  subMessage,
  progress,
  styleOverride,
  forceAnimated = false,
}) => {
  const { effectiveStyle, animationsEnabled, lightweightMode } = useLoadingTheme();
  const activeStyle = styleOverride || effectiveStyle;
  const showAnimation = (animationsEnabled || forceAnimated) && !lightweightMode;

  const displayMessage = message || DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];

  const styleMeta = LOADING_STYLE_DEFINITIONS.find((s) => s.id === activeStyle) || LOADING_STYLE_DEFINITIONS[0];

  const containerClasses =
    mode === 'fullscreen'
      ? 'fixed inset-0 z-[9999] flex h-screen w-screen flex-col items-center justify-center overflow-hidden'
      : mode === 'embedded'
        ? 'absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden z-20'
        : 'absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden z-30 bg-black/85 backdrop-blur-xl';

  return (
    <div className={containerClasses}>
      {/* Background artwork or default theme gradient */}
      {backgroundImage ? (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={backgroundImage}
            alt="Loading background"
            className="h-full w-full object-cover object-center filter blur-2xl scale-110 opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07080d] via-[#07080d]/80 to-[#07080d]/50" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#090b13] via-[#0e0b1a] to-[#07080d]" />
      )}

      {/* Theme specific background effects */}
      {showAnimation && activeStyle === 'purple-galaxy' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-600/30 blur-3xl animate-pulse" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-fuchsia-600/25 blur-3xl animate-pulse" />
        </div>
      )}

      {showAnimation && activeStyle === 'anime-aura' && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="h-[340px] w-[340px] rounded-full border border-violet-500/30 bg-violet-500/10 animate-ping opacity-30" />
          <div className="absolute h-[240px] w-[240px] rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 animate-pulse" />
        </div>
      )}

      {showAnimation && activeStyle === 'neon-particles' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_#38bdf8] animate-bounce" />
          <div className="absolute top-3/4 right-1/3 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_12px_#c084fc] animate-ping" />
        </div>
      )}

      {showAnimation && activeStyle === 'sakura-petals' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-10 left-1/5 h-3 w-3 rounded-full bg-pink-400/60 blur-[1px] animate-pulse" />
          <div className="absolute top-1/3 right-1/4 h-2.5 w-2.5 rounded-full bg-rose-300/70 blur-[1px] animate-bounce" />
        </div>
      )}

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center max-w-sm">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-spin rounded-[24px] border-2 border-violet-500/30 border-t-violet-400 border-r-fuchsia-400 shadow-[0_0_24px_rgba(168,85,247,0.45)]"
          />
          <div className="relative h-15 w-15 overflow-hidden rounded-2xl border border-violet-400/50 bg-[#120e1e] shadow-[0_0_28px_rgba(168,85,247,0.55),0_0_16px_rgba(236,72,153,0.35)]">
            <img
              src={ASSETS.officialLogo}
              alt="KuroStream Logo"
              className="h-full w-full object-cover object-center"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="font-display text-base font-bold text-white tracking-tight">
            {displayMessage}
          </h3>
          <p className="text-xs text-slate-300/90 font-medium">
            {subMessage || styleMeta.name}
          </p>
        </div>

        {typeof progress === 'number' && Number.isFinite(progress) && (
          <div className="w-full max-w-[200px] space-y-1 pt-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.1]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
                style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 tabular-nums">{Math.round(progress)}%</p>
          </div>
        )}
      </div>
    </div>
  );
};
