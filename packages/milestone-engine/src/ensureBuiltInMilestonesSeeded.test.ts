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

  it('seeds every built-in as catalog-only, not an active goal (v0.2.3)', async () => {
    // The owner explicitly does not want every seeded target treated as an
    // active personal goal -- a fresh seed is a browsable catalog, and the
    // owner opts individual goals into "My Milestones" from there (see
    // MilestoneCatalog.tsx). evaluateMilestone already skips `!active`
    // milestones entirely, so this also means a fresh install never
    // evaluates a goal the owner hasn't chosen.
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    await ensureBuiltInMilestonesSeeded(storage);

    const milestones = await storage.milestones.getAll();
    expect(milestones.length).toBeGreaterThan(0);
    expect(milestones.every((m) => m.active === false)).toBe(true);
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

  it('maps each movement to the intended exercise (v0.2.2 mapping audit)', async () => {
    // Audited per the v0.2.2 UX-cleanup handoff's explicit concern that
    // "60-Second Plank -> weighted front plank" might be a mismatch.
    // Confirmed correct, not a bug: the raw Free Exercise DB dataset has no
    // plain "plank"/"front plank" entry at all (verified directly against
    // the seed dataset), and "weighted front plank" was deliberately chosen
    // in curatedEnrichment.ts (v0.0.7) as the closest real entry, with its
    // measurement_type corrected to 'time' specifically so it behaves as a
    // plain timed plank (no weight field shown) -- "weighted" in its name
    // is a dataset-naming artifact, not a real prerequisite. This test
    // pins that intended mapping (and the other three movements) so a
    // future change can't silently drift it back to something wrong.
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    await ensureBuiltInMilestonesSeeded(storage);
    const [milestones, exercises] = await Promise.all([
      storage.milestones.getAll(),
      storage.exercises.getAll(),
    ]);
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));

    function exerciseNameFor(title: string): string | undefined {
      const milestone = milestones.find((m) => m.title === title);
      return milestone?.exercise_id ? exerciseById.get(milestone.exercise_id)?.name : undefined;
    }

    expect(exerciseNameFor('225 lb Bench Press')).toBe('barbell bench press');
    expect(exerciseNameFor('50 Push-Ups')).toBe('push-up');
    expect(exerciseNameFor('5 Pull-Ups')).toBe('pull-up');
    expect(exerciseNameFor('60-Second Plank')).toBe('weighted front plank');

    const plankExercise = exercises.find((e) => e.name === 'weighted front plank');
    expect(plankExercise?.measurement_type).toBe('time'); // no weight field despite the name
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
