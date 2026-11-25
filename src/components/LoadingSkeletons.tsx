import React from 'react';

export const AnimeGridSkeleton: React.FC<{ count?: number }> = ({ count = 12 }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#10121c]">
        <div className="aspect-[2/3] w-full animate-pulse bg-white/[0.05]" />
        <div className="space-y-2 p-3">
          <div className="h-3.5 w-4/5 animate-pulse rounded bg-white/[0.08]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.05]" />
        </div>
      </div>
    ))}
  </div>
);

export const CharacterGridSkeleton: React.FC<{ count?: number }> = ({ count = 12 }) => (
  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#10121c]">
        <div className="aspect-[3/4] w-full animate-pulse bg-white/[0.05]" />
        <div className="space-y-2 p-3">
          <div className="h-4 w-5/6 animate-pulse rounded bg-white/[0.08]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.05]" />
        </div>
      </div>
    ))}
  </div>
);

export const CharacterDetailSkeleton: React.FC = () => (
  <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
    <div className="relative h-[320px] sm:h-[420px] w-full animate-pulse rounded-3xl bg-[#10121c] border border-white/[0.08]" />
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="space-y-4">
        <div className="h-64 w-full animate-pulse rounded-3xl bg-[#10121c]" />
      </div>
      <div className="lg:col-span-2 space-y-6">
        <div className="space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded-xl bg-white/[0.08]" />
          <div className="h-4 w-1/3 animate-pulse rounded-lg bg-white/[0.05]" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-white/[0.06]" />
          <div className="h-4 w-full animate-pulse rounded bg-white/[0.06]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.06]" />
        </div>
      </div>
    </div>
  </div>
);
