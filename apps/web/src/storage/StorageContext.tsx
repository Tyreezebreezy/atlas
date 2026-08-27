import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createStorage, type AtlasStorage } from '@atlas/storage';

const StorageContext = createContext<AtlasStorage | null>(null);

export function StorageProvider({ children }: { children: ReactNode }) {
  const [storage, setStorage] = useState<AtlasStorage | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createStorage().then((instance) => {
      if (!cancelled) setStorage(instance);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <StorageContext.Provider value={storage}>{children}</StorageContext.Provider>;
}

/** Null until the platform-appropriate adapter finishes connecting. */
export function useStorage(): AtlasStorage | null {
  return useContext(StorageContext);
}
