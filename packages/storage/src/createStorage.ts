import { isTauriRuntime } from '@atlas/core';
import type { AtlasStorage } from './types';
import { IndexedDbAdapter } from './indexeddb/IndexedDbAdapter';

/** Picks the SQLite adapter in the Tauri shell, IndexedDB everywhere else. */
export async function createStorage(): Promise<AtlasStorage> {
  if (isTauriRuntime()) {
    // Dynamic import so @tauri-apps/plugin-sql never enters the web bundle.
    const { SqliteAdapter } = await import('./sqlite/SqliteAdapter');
    return SqliteAdapter.connect();
  }
  return new IndexedDbAdapter();
}
