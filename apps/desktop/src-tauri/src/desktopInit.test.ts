import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// The script the desktop shell injects before any page script (lib.rs). It is plain browser JS, so the test runs it against a stubbed
// `navigator` / `caches` / `sessionStorage` / `location`.
const source = readFileSync(new URL('./desktop_init.js', import.meta.url), 'utf8');

function environment(opts: {
  registrations?: number;
  evictedBefore?: boolean;
  supported?: boolean;
  failLookup?: boolean;
}) {
  const unregister = vi.fn(() => Promise.resolve(true));
  const registrations = Array.from({ length: opts.registrations ?? 0 }, () => ({ unregister }));
  const deleted: string[] = [];
  const store = new Map<string, string>(opts.evictedBefore ? [['atlas-sw-evicted', '1']] : []);
  const originalRegister = vi.fn();
  const serviceWorker = {
    register: originalRegister,
    getRegistrations: () =>
      opts.failLookup ? Promise.reject(new Error('boom')) : Promise.resolve(registrations),
  };
  const navigator = opts.supported === false ? {} : { serviceWorker };
  const caches = {
    keys: () =>
      Promise.resolve(['workbox-precache-v2-http://tauri.localhost/', 'atlas-exercise-media']),
    delete: (key: string) => {
      deleted.push(key);
      return Promise.resolve(true);
    },
  };
  const sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  const location = { reload: vi.fn() };
  new Function('navigator', 'caches', 'sessionStorage', 'location', source)(
    navigator,
    caches,
    sessionStorage,
    location,
  );
  return { serviceWorker, originalRegister, unregister, deleted, location, store };
}

describe('desktop shell init script', () => {
  it('removes an installed service worker and its caches, then reloads once', async () => {
    const env = environment({ registrations: 2 });
    await vi.waitFor(() => expect(env.location.reload).toHaveBeenCalledTimes(1));
    expect(env.unregister).toHaveBeenCalledTimes(2);
    expect(env.deleted).toEqual([
      'workbox-precache-v2-http://tauri.localhost/',
      'atlas-exercise-media',
    ]);
    expect(env.store.get('atlas-sw-evicted')).toBe('1');
  });

  it('never reloads twice in one session, even if a registration comes back', async () => {
    const env = environment({ registrations: 1, evictedBefore: true });
    await vi.waitFor(() => expect(env.deleted.length).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(env.location.reload).not.toHaveBeenCalled();
  });

  it('leaves a clean profile alone: nothing unregistered, nothing deleted, no reload', async () => {
    const env = environment({ registrations: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(env.unregister).not.toHaveBeenCalled();
    expect(env.deleted).toEqual([]);
    expect(env.location.reload).not.toHaveBeenCalled();
  });

  it('stops the web bundle registering a new worker: register() returns a promise that never settles', async () => {
    const env = environment({ registrations: 0 });
    const outcome = await Promise.race([
      env.serviceWorker.register('/sw.js').then(
        () => 'settled',
        () => 'settled',
      ),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 30)),
    ]);
    expect(outcome).toBe('pending');
    expect(env.originalRegister).not.toHaveBeenCalled();
  });

  it('does nothing where service workers are not supported, and swallows a failed lookup', async () => {
    expect(() => environment({ supported: false })).not.toThrow();
    const env = environment({ failLookup: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(env.location.reload).not.toHaveBeenCalled();
  });
});
