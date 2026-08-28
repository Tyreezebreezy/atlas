import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { ensureExercisesSeeded } from '@atlas/exercise-library';
import { BUILT_IN_MILESTONES } from './builtInMilestones';
import { ensureBuiltInMilestonesSeeded } from './ensureBuiltInMilestonesSeeded';

describe('ensureBuiltInMilestonesSeeded', () => {
  it('seeds a built-in milestone per spec whose exercise name resolves in the library', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    await ensureBuiltInMilestonesSeeded(storage);

    const milestones = await storage.milestones.getAll();
    expect(milestones.length).toBe(BUILT_IN_MILESTONES.length);
    expect(milestones.every((m) => m.is_builtin)).toBe(true);
    expect(milestones.every((m) => m.exercise_id != null && m.exercise_id.length > 0)).toBe(true);
    expect(milestones.find((m) => m.title === '225 lb Bench Press')?.target_weight).toBe(225);
  });

  it('is a no-op once built-in milestones already exist', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    await ensureBuiltInMilestonesSeeded(storage);
    await ensureBuiltInMilestonesSeeded(storage);

    const milestones = await storage.milestones.getAll();
    expect(milestones.length).toBe(BUILT_IN_MILESTONES.length);
  });

  it('seeds real exercise ids even when the caller never seeded the exercise library first', async () => {
    // Regression test: a real runtime run hit exactly this order (Progress
    // tab visited before Program/Library ever seeded exercises). This
    // function must guarantee its own dependency rather than silently
    // producing zero milestones and hoping a later call retries -- see the
    // sibling bug this exact scenario caused in ensureBenchmarksSeeded.
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureBuiltInMilestonesSeeded(storage);

    const milestones = await storage.milestones.getAll();
    expect(milestones.length).toBe(BUILT_IN_MILESTONES.length);
    expect(milestones.every((m) => m.exercise_id != null && m.exercise_id.length > 0)).toBe(true);
  });

  it('does not double-seed when called concurrently for the same storage instance (React StrictMode double-mount)', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    // Both calls start before either has finished its own getAll() check --
    // the exact race StrictMode's mount/unmount/remount reproduces.
    await Promise.all([
      ensureBuiltInMilestonesSeeded(storage),
      ensureBuiltInMilestonesSeeded(storage),
    ]);

    const milestones = await storage.milestones.getAll();
    expect(milestones.length).toBe(BUILT_IN_MILESTONES.length);
  });
});
