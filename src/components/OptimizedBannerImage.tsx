import React, { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { getOptimizedUrls, isImageCached, markImageCached } from '@/src/services/imageCacheService';

interface OptimizedBannerImageProps {
  src: string;
  thumbnailUrl?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export const OptimizedBannerImage: React.FC<OptimizedBannerImageProps> = ({
  src,
  thumbnailUrl,
  alt,
  className = '',
  priority = false,
  onLoad,
  onError,
}) => {
  const { highRes, thumbnail } = getOptimizedUrls(src, thumbnailUrl);

  const alreadyCached = isImageCached(highRes);
  const [isHighResLoaded, setIsHighResLoaded] = useState<boolean>(alreadyCached);
  const [isThumbLoaded, setIsThumbLoaded] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (!highRes) {
      setHasError(true);
      return;
    }

    if (isImageCached(highRes)) {
      setIsHighResLoaded(true);
      if (onLoad) onLoad();
      return;
    }

    setHasError(false);
    setIsHighResLoaded(false);

    let isSubscribed = true;
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (!isSubscribed) return;
      markImageCached(highRes);
      setIsHighResLoaded(true);
      if (onLoad) onLoad();
    };

    img.onerror = () => {
      if (!isSubscribed) return;
      // Retry once without crossOrigin if CORS was the issue
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        if (!isSubscribed) return;
        markImageCached(highRes);
        setIsHighResLoaded(true);
        if (onLoad) onLoad();
      };
      fallbackImg.onerror = () => {
        if (!isSubscribed) return;
        setHasError(true);
        if (onError) onError();
      };
      fallbackImg.src = highRes;
    };

    img.src = highRes;

    return () => {
      isSubscribed = false;
    };
  }, [highRes, onLoad, onError]);

  if (hasError) {
    return (
      <div className={`relative flex items-center justify-center bg-gradient-to-br from-[#121424] via-[#10121d] to-[#0a0c16] text-slate-500 overflow-hidden ${className}`}>
        <div className="absolute inset-0 bg-violet-950/20" />
        <div className="relative z-10 flex flex-col items-center gap-1.5 p-3 text-center">
          <ImageIcon className="h-6 w-6 text-violet-400/50" />
          <span className="text-[11px] font-medium text-slate-400 line-clamp-1">{alt || 'Anime Banner'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#0c0e18] ${className}`}>
      {/* 1. Shimmer Skeleton Placeholder while loading */}
      {!isHighResLoaded && (
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-white/[0.02] via-white/[0.07] to-white/[0.02] animate-pulse">
          <div className="h-full w-full bg-violet-900/10" />
        </div>
      )}

      {/* 2. Low-Resolution WebP Thumbnail (Blur-up technique) */}
      {!isHighResLoaded && thumbnail && (
        <img
          src={thumbnail}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setIsThumbLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover filter blur-xs scale-105 transition-opacity duration-300 ${
            isThumbLoaded ? 'opacity-80' : 'opacity-0'
          }`}
        />
      )}

      {/* 3. Full-Resolution Landscape Banner */}
      <img
        src={highRes}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        className={`h-full w-full object-cover transform-gpu transition-opacity duration-300 ${
          isHighResLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
export default OptimizedBannerImage;
