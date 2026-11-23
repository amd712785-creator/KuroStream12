import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type StreamingServerId = 'animeworld-india' | 'kurostream-global';

const SERVER_SESSION_STORAGE_KEY = 'kurostream_active_server_v1';

interface ServerContextValue {
  activeServer: StreamingServerId;
  setActiveServer: (server: StreamingServerId) => void;
  isAnimeWorld: boolean;
  isKuroStreamGlobal: boolean;
}

const ServerContext = createContext<ServerContextValue | undefined>(undefined);

function readInitialServer(): StreamingServerId {
  try {
    const stored = sessionStorage.getItem(SERVER_SESSION_STORAGE_KEY);
    if (stored === 'kurostream-global' || stored === 'animeworld-india') {
      return stored;
    }
  } catch {
    // ignore storage access issues
  }
  return 'animeworld-india';
}

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeServer, setActiveServerState] = useState<StreamingServerId>(readInitialServer);

  const setActiveServer = useCallback((server: StreamingServerId) => {
    setActiveServerState(server);
    try {
      sessionStorage.setItem(SERVER_SESSION_STORAGE_KEY, server);
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
