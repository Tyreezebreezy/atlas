/** Same localStorage-backed, try/catch-guarded shape as deviceId.ts,
 * generalized by key -- a durable "has this one-time thing already
 * happened" marker for shared-package code (e.g. a data migration) that
 * has no other durable place to record "already ran" once, ever.
 *
 * Like deviceId.ts, an in-memory fallback covers SSR/test environments
 * (this repo's vitest config runs in plain `node`, with no real
 * `localStorage` at all) -- real browser/Tauri webviews always have it, so
 * this only affects non-UI contexts, where "ran once per process" is an
 * accepted substitute for "ran once ever." */
const memoryFallback = new Set<string>();

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
    // unavailable -- memoryFallback covers this call site
  }
}

export function hasRunOnce(key: string): boolean {
  return memoryFallback.has(key) || readStorage(`atlas:once:${key}`) === 'true';
}

export function markRunOnce(key: string): void {
  memoryFallback.add(key);
  writeStorage(`atlas:once:${key}`, 'true');
}

/** Test-only: clears every in-memory flag so a fixed, hardcoded key (e.g.
 * a migration's own constant) can be exercised fresh across test cases
 * instead of leaking "already ran" state between them. */
export function __resetOnceFlagsForTesting(): void {
  memoryFallback.clear();
}
