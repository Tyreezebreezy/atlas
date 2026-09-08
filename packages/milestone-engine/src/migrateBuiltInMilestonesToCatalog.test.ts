import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetOnceFlagsForTesting } from '@atlas/core';
import { IndexedDbAdapter } from '@atlas/storage';
import { ensureExercisesSeeded } from '@atlas/exercise-library';
import { createMilestone } from './createMilestone';
import { migrateBuiltInMilestonesToCatalog } from './migrateBuiltInMilestonesToCatalog';

// The migration's "already ran" flag lives under a fixed key (see
// onceFlags.ts) -- it persists across tests in this file the same way it
// persists across app launches, so each test needs a clean slate.
beforeEach(() => {
  __resetOnceFlagsForTesting();
});

/** Simulates a v0.2.2 install: built-ins seeded under the OLD `active: true`
 * default, before v0.2.3's ensureBuiltInMilestonesSeeded change. */
function legacyActiveBuiltin(overrides: Parameters<typeof createMilestone>[0]) {
  return createMilestone({ ...overrides, isBuiltin: true, active: true });
}

describe('migrateBuiltInMilestonesToCatalog', () => {
  it('demotes an unachieved built-in seeded under the old active-by-default regime', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    const exercise = (await storage.exercises.getAll())[0]!;
    await storage.milestones.put(
      legacyActiveBuiltin({
        title: '225 lb Bench Press',
        exerciseId: exercise.id,
        dimension: 'weight',
        targetWeight: 225,
      }),
    );

    await migrateBuiltInMilestonesToCatalog(storage);

    const [migrated] = await storage.milestones.getAll();
    expect(migrated!.active).toBe(false);
  });

  it('never touches an already-achieved built-in', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    const exercise = (await storage.exercises.getAll())[0]!;
    const achieved = {
      ...legacyActiveBuiltin({
        title: '135 lb Bench Press',
        exerciseId: exercise.id,
        dimension: 'weight',
        targetWeight: 135,
      }),
      achieved_at: '2026-01-01T00:00:00.000Z',
    };
    await storage.milestones.put(achieved);

    await migrateBuiltInMilestonesToCatalog(storage);

    const [migrated] = await storage.milestones.getAll();
    expect(migrated!.active).toBe(true);
    expect(migrated!.achieved_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('never touches a custom (non-built-in) milestone', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    const exercise = (await storage.exercises.getAll())[0]!;
    await storage.milestones.put(
      createMilestone({
        title: 'My own goal',
        exerciseId: exercise.id,
        dimension: 'weight',
        targetWeight: 300,
      }),
    );

    await migrateBuiltInMilestonesToCatalog(storage);

    const [migrated] = await storage.milestones.getAll();
    expect(migrated!.active).toBe(true);
  });

  it('is a true one-time migration -- a later manual re-activation survives a second run', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    const exercise = (await storage.exercises.getAll())[0]!;
    await storage.milestones.put(
      legacyActiveBuiltin({
        title: '225 lb Bench Press',
        exerciseId: exercise.id,
        dimension: 'weight',
        targetWeight: 225,
      }),
    );

    await migrateBuiltInMilestonesToCatalog(storage);
    const [demoted] = await storage.milestones.getAll();
    expect(demoted!.active).toBe(false);

    // Owner re-adds it from the catalog, exactly like MilestoneCatalog.tsx would.
    await storage.milestones.put({ ...demoted!, active: true });

    // A later app boot calls this again -- must not fight the owner's choice.
    await migrateBuiltInMilestonesToCatalog(storage);
    const [afterSecondRun] = await storage.milestones.getAll();
    expect(afterSecondRun!.active).toBe(true);
  });

  it('does nothing on a fresh install with no milestones yet', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await expect(migrateBuiltInMilestonesToCatalog(storage)).resolves.toBeUndefined();
    expect(await storage.milestones.getAll()).toEqual([]);
  });
});
