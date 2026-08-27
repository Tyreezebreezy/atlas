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
});
