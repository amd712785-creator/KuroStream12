import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { updateActiveWatchSession, clearActiveWatchSession } from '@/src/services/watchAnalyticsService';

interface WatchHeartbeatParams {
  animeId: number;
  animeTitle: string;
  episodeNumber: number;
  episodeTitle?: string;
  serverName: string;
}

export function useWatchSessionHeartbeat(params: WatchHeartbeatParams) {
  const { user } = useAuth();
  const lastHeartbeatMsRef = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const handleHeartbeat = useCallback(
    (curTime: number, durTime: number, isPlaying: boolean) => {
      if (!user || !user.emailVerified) return;
      const now = Date.now();

      if (!isPlaying) {
        lastHeartbeatMsRef.current = 0;
        void clearActiveWatchSession(user.uid);
        return;
      }

      // Throttle heartbeat writes to once every 14 seconds unless initial send
      if (lastHeartbeatMsRef.current > 0 && now - lastHeartbeatMsRef.current < 14000) {
        return;
      }
      lastHeartbeatMsRef.current = now;

      void updateActiveWatchSession({
        id: user.uid,
        userId: user.uid,
        userName: user.displayName || 'Anime Fan',
        userEmail: user.email || '',
        userAvatar: user.photoURL || '',
        animeId: paramsRef.current.animeId,
        animeTitle: paramsRef.current.animeTitle,
        episodeNumber: paramsRef.current.episodeNumber,
        episodeTitle: paramsRef.current.episodeTitle,
        serverName: paramsRef.current.serverName,
        progressSeconds: Math.round(curTime),
        durationSeconds: Math.round(durTime),
      });
    },
    [user]
  );

  useEffect(() => {
    const handleUnload = () => {
      if (user) {
        void clearActiveWatchSession(user.uid);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      if (user) {
        void clearActiveWatchSession(user.uid);
      }
    };
  }, [user]);

  return { handleHeartbeat };
}
