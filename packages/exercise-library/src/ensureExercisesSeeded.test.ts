import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import type { Exercise } from '@atlas/data-model';
import { ensureExercisesSeeded, seedExercises } from './ensureExercisesSeeded';

describe('ensureExercisesSeeded', () => {
  it('seeds the full library into an empty store', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    expect(await storage.exercises.getAll()).toHaveLength(seedExercises.length);
  });

  it('does not bulk-reseed once the store already has data', async () => {
    const [firstSeed] = seedExercises;
    if (!firstSeed) throw new Error('seed data is empty');

    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await storage.exercises.put(firstSeed);
    await ensureExercisesSeeded(storage);
    expect(await storage.exercises.getAll()).toHaveLength(1);
  });

  it('backfills media for a pre-existing exercise that predates any media provider', async () => {
    const benchPress = seedExercises.find((e) => e.name.toLowerCase() === 'barbell bench press');
    if (!benchPress) throw new Error('expected "barbell bench press" in seed data');

    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await storage.exercises.put({ ...benchPress, media: undefined });
    await ensureExercisesSeeded(storage);

    const [result] = await storage.exercises.getAll();
    expect(result?.media?.provider).toBe('workout-guide');
  });

  it('leaves already-resolved media (including pre-provider-field Workout Guide matches) untouched', async () => {
    const benchPress = seedExercises.find((e) => e.name.toLowerCase() === 'barbell bench press');
    if (!benchPress) throw new Error('expected "barbell bench press" in seed data');
    const legacyMedia = {
      kind: 'frame-sequence' as const,
      url: '/exercise-media/bench-press/frame-1.png',
      frames: ['/exercise-media/bench-press/frame-1.png'],
      thumbnail_url: null,
      attribution: 'Bryl Lim (Workout Guide, CC BY-SA 4.0)',
      // No `provider`/`provider_source_id` -- the pre-v0.1.5 shape.
    };

    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await storage.exercises.put({ ...benchPress, media: legacyMedia });
    await ensureExercisesSeeded(storage);

    const [result] = await storage.exercises.getAll();
    expect(result?.media).toEqual(legacyMedia);
  });

  it('marks a genuinely unmatched exercise as null (not left undefined) so it is never re-matched', async () => {
    const unmatchable: Exercise = {
      ...seedExercises[0]!,
      id: 'no-provider-will-ever-match-this-name',
      name: 'Zzz Totally Fictional Exercise Nobody Made',
      aliases: [],
      media: undefined,
    };

    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await storage.exercises.put(unmatchable);
    await ensureExercisesSeeded(storage);

    const [result] = await storage.exercises.getAll();
    expect(result?.media).toBeNull();
  });

  it('does not touch custom exercises even when unresolved', async () => {
    const custom: Exercise = {
      ...seedExercises[0]!,
      id: 'custom-1',
      name: 'My Custom Thing',
      is_custom: true,
      media: undefined,
    };

    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await storage.exercises.put(custom);
    await ensureExercisesSeeded(storage);

    const [result] = await storage.exercises.getAll();
    expect(result?.media).toBeUndefined();
  });

  it('is idempotent once every exercise is already resolved (no drift, no re-matching)', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    const before = await storage.exercises.getAll();
    expect(before.every((e) => e.media !== undefined)).toBe(true);

    await ensureExercisesSeeded(storage);
    const after = await storage.exercises.getAll();

    const byId = (list: Exercise[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(after)).toEqual(byId(before));
  });

  describe('the "sled 45° leg press" row that once shipped as "45в°"', () => {
    const LEG_PRESS_ID = 'edf4d45f-163a-43f5-9d5b-5f427d5fe6c5';
    const libraryRow = () => {
      const row = seedExercises.find((e) => e.id === LEG_PRESS_ID);
      if (!row) throw new Error('expected the sled 45° leg press row in the seed data');
      return row;
    };

    it('seeds a fresh device with the degree sign', async () => {
      const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
      await ensureExercisesSeeded(storage);
      const all = await storage.exercises.getAll();
      expect(all.find((e) => e.id === LEG_PRESS_ID)?.name).toBe('sled 45° leg press');
    });

    it('repairs the stored name on a device that seeded the garbled one -- same id, nothing else lost', async () => {
      const garbled: Exercise = {
        ...libraryRow(),
        name: 'sled 45в° leg press',
        media: null,
        user_notes: 'seat 4, feet high',
        is_favorite: true,
      };
      const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
      await storage.exercises.put(garbled);

      await ensureExercisesSeeded(storage);

      const [repaired] = await storage.exercises.getAll();
      expect(repaired).toMatchObject({
        id: LEG_PRESS_ID,
        name: 'sled 45° leg press',
        user_notes: 'seat 4, feet high',
        is_favorite: true,
        media: null,
        version: garbled.version + 1,
      });
    });

    it("does not rewrite a custom exercise's own name", async () => {
      const custom: Exercise = {
        ...libraryRow(),
        id: 'custom-45',
        name: 'my 45в° thing',
        is_custom: true,
        media: null,
      };
      const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
      await storage.exercises.put(custom);

      await ensureExercisesSeeded(storage);

      const [result] = await storage.exercises.getAll();
      expect(result).toMatchObject({ name: 'my 45в° thing', version: custom.version });
    });
  });

  it('applies curated enrichment to seeded exercises that have it', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    const all = await storage.exercises.getAll();
    const benchPress = all.find((e) => e.name.toLowerCase() === 'barbell bench press');
    expect(benchPress?.enrichment).not.toBeNull();
    expect(benchPress?.movement_pattern).toBe('horizontal_push');
  });
});
