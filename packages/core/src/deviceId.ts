import { newId } from './id';

const DEVICE_ID_KEY = 'atlas:device_id';

// ponytail: in-memory fallback when localStorage is unavailable (SSR/test) means
// the id won't survive a process restart there; real browser/Tauri webviews
// always have localStorage, so this only affects non-UI contexts.
let memoryFallback: string | null = null;

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // unavailable — memoryFallback covers this call site
  }
}

/** Stable per-installation identity, stamped on every entity's SyncMeta.device_id. */
export function getOrCreateDeviceId(): string {
  const existing = readStorage(DEVICE_ID_KEY) ?? memoryFallback;
  if (existing) return existing;
  const created = newId();
  writeStorage(DEVICE_ID_KEY, created);
  memoryFallback = created;
  return created;
}
