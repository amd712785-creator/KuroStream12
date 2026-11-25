import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type StreamingServerId = 'animeworld-india' | 'kurostream-global';

const SERVER_STORAGE_KEY = 'kurostream_active_server_v2';
const LEGACY_SERVER_SESSION_KEY = 'kurostream_active_server_v1';

interface ServerContextValue {
  activeServer: StreamingServerId;
  setActiveServer: (server: StreamingServerId) => void;
  isAnimeWorld: boolean;
  isKuroStreamGlobal: boolean;
}

const ServerContext = createContext<ServerContextValue | undefined>(undefined);

function readInitialServer(): StreamingServerId {
  try {
    const stored = localStorage.getItem(SERVER_STORAGE_KEY);
    if (stored === 'kurostream-global' || stored === 'animeworld-india') {
      return stored;
    }
  } catch {
    // ignore storage access issues
  }
  return 'kurostream-global';
}

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeServer, setActiveServerState] = useState<StreamingServerId>(readInitialServer);

  const setActiveServer = useCallback((server: StreamingServerId) => {
    setActiveServerState(server);
    try {
      localStorage.setItem(SERVER_STORAGE_KEY, server);
      sessionStorage.removeItem(LEGACY_SERVER_SESSION_KEY);
    } catch {
      // ignore storage access issues
    }
  }, []);

  const value = useMemo<ServerContextValue>(
    () => ({
      activeServer,
      setActiveServer,
      isAnimeWorld: activeServer === 'animeworld-india',
      isKuroStreamGlobal: activeServer === 'kurostream-global',
    }),
    [activeServer, setActiveServer]
  );

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
};

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return ctx;
}
