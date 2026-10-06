import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { createProgram } from './createProgram';
import { setActiveProgram } from './setActiveProgram';

describe('setActiveProgram', () => {
  it('activates exactly one program, deactivating any others', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    const a = { ...createProgram('Cut', null), is_active: true };
    const b = createProgram('Strength Block', null);
    await storage.programs.putMany([a, b]);

    await setActiveProgram(storage, b.id);

    const all = await storage.programs.getAll();
    const activeIds = all.filter((p) => p.is_active).map((p) => p.id);
    expect(activeIds).toEqual([b.id]);
  });

  it('stamps when a program became the active one, and leaves the one it replaced alone', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    const a = { ...createProgram('Cut', null), is_active: true };
    const b = createProgram('Strength Block', null);
    await storage.programs.putMany([a, b]);

    const before = new Date().toISOString();
    await setActiveProgram(storage, b.id);

    const all = await storage.programs.getAll();
    const activated = all.find((p) => p.id === b.id)!;
    expect(activated.activated_at! >= before).toBe(true);
    expect(all.find((p) => p.id === a.id)!.activated_at).toBeUndefined();
  });
});
