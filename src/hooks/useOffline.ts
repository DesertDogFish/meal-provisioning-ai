import { useState, useEffect } from 'react';
import { networkMonitor } from '../sync/NetworkMonitor';
import { isOfflineMode } from '../repositories/RepositoryFactory';

export function useOffline() {
  const [online, setOnline] = useState(networkMonitor.isOnline());
  const [offlineMode, setOfflineMode] = useState(isOfflineMode());

  useEffect(() => {
    const unsub = networkMonitor.subscribe((o) => {
      setOnline(o);
      setOfflineMode(isOfflineMode());
    });
    return unsub;
  }, []);

  return { online, offlineMode };
}