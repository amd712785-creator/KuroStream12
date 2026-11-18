import React, { useEffect, useState } from 'react';
import { ASSETS } from '@/src/config/env';

interface AnimeImageProps {
  src?: string | null;
  alt: string;
  variant?: 'poster' | 'banner' | 'avatar';
  className?: string;
  priority?: boolean;
}

export const AnimeImage: React.FC<AnimeImageProps> = ({
  src,
  alt,
  variant = 'poster',
  className = '',
  priority = false,
}) => {
  const fallback =
    variant === 'banner'
      ? ASSETS.heroFallback
      : variant === 'avatar'
        ? ASSETS.defaultAvatar
        : ASSETS.posterFallback;

  const resolvedInitial = src && src.trim() ? src.trim() : fallback;
  const [imgSrc, setImgSrc] = useState<string>(resolvedInitial);
  const [loaded, setLoaded] = useState(false);
  const [failedAll, setFailedAll] = useState(false);

  useEffect(() => {
    const nextSrc = src && src.trim() ? src.trim() : fallback;
    setImgSrc(nextSrc);
    setLoaded(false);
    setFailedAll(false);
  }, [src, fallback]);

  if (failedAll) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#131526] via-[#1a1330] to-[#110f1b] p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <span className="text-xs font-semibold text-slate-300 line-clamp-2">{alt}</span>
      </div>
    );
  }

  const objectFitClass = className.includes('object-contain') ? 'object-contain' : 'object-cover';
  const objectPosClass = className.includes('object-top') ? 'object-top' : 'object-center';

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-[#111322] via-[#161329] to-[#0c0e18] ${className}`}
    >
      {!loaded && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-violet-950/25 via-[#161829] to-[#0d0f1a]"
        />
      )}
      <img
        src={imgSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (imgSrc !== fallback) {
            setImgSrc(fallback);
            setLoaded(false);
          } else {
            setFailedAll(true);
          }
        }}
        className={`h-full w-full ${objectFitClass} ${objectPosClass} transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
