import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { ensureExercisesSeeded, seedExercises } from './ensureExercisesSeeded';

describe('ensureExercisesSeeded', () => {
  it('seeds the full library into an empty store', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    expect(await storage.exercises.getAll()).toHaveLength(seedExercises.length);
  });

  it('is a no-op once the store already has data', async () => {
    const [firstSeed] = seedExercises;
    if (!firstSeed) throw new Error('seed data is empty');

    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await storage.exercises.put(firstSeed);
    await ensureExercisesSeeded(storage);
    expect(await storage.exercises.getAll()).toHaveLength(1);
  });
});
