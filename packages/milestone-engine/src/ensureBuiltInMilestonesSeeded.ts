import { ensureExercisesSeeded } from '@atlas/exercise-library';
import type { AtlasStorage } from '@atlas/storage';
import { BUILT_IN_MILESTONES } from './builtInMilestones';
import { createMilestone } from './createMilestone';

/**
 * Mirrors exercise-library's ensureExercisesSeeded: bulk-inserts on first
 * run (any existing built-in milestone means "already seeded," no-op),
 * name-matched against whatever's currently in the exercise library. A
 * spec whose exercise name isn't found is silently skipped rather than
 * thrown on -- same resilience reasoning as curatedEnrichment's substitute
 * resolution.
 *
 * Calls `ensureExercisesSeeded` itself first rather than trusting the
 * caller to have done so -- a real runtime test caught the ordering bug
 * this prevents: `ensureBenchmarksSeeded` (same shape, see that file)
 * called before the exercise library existed would seed every row with an
 * unresolved `exercise_id` and then never retry, because its no-op guard
 * only checks "did seeding run," not "did it actually resolve." This
 * function's own no-op guard (`some(is_builtin)`) happens to self-heal from
 * that same premature-call scenario -- an empty exercise library means
 * every spec fails to resolve, `toCreate` stays empty, nothing gets
 * written, so the guard doesn't trip and a later call retries -- but
 * that's a lucky consequence of the empty-array shortcut, not a reason to
 * skip guaranteeing the real dependency explicitly.
 *
 * Concurrent calls for the SAME storage instance share one in-flight
 * promise (keyed by object identity) instead of each racing their own
 * check-then-act. Without this, React StrictMode's intentional
 * double-effect-mount (or any two screens genuinely mounting around the
 * same time) lets two calls both see zero existing built-ins and both
 * insert a full, freshly-`newId()`-ed set -- real duplicate rows.
 */
const inFlight = new WeakMap<AtlasStorage, Promise<void>>();

export function ensureBuiltInMilestonesSeeded(storage: AtlasStorage): Promise<void> {
  let promise = inFlight.get(storage);
  if (!promise) {
    promise = seed(storage);
    inFlight.set(storage, promise);
  }
  return promise;
}

async function seed(storage: AtlasStorage): Promise<void> {
  await ensureExercisesSeeded(storage);
  const [existingMilestones, exercises] = await Promise.all([
    storage.milestones.getAll(),
    storage.exercises.getAll(),
  ]);
  if (existingMilestones.some((m) => m.is_builtin)) return;

  const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e]));

  const toCreate = BUILT_IN_MILESTONES.map((spec) => {
    const exercise = byName.get(spec.exerciseName.toLowerCase());
    if (!exercise) return null;
    return createMilestone({
      title: spec.title,
      exerciseId: exercise.id,
      dimension: spec.dimension,
      targetWeight: spec.targetWeight ?? null,
      targetReps: spec.targetReps ?? null,
      targetDurationSeconds: spec.targetDurationSeconds ?? null,
      isBuiltin: true,
      // v0.2.3: built-ins seed as catalog entries, not automatic goals --
      // the owner opts in from the catalog (see MilestoneCatalog.tsx).
      // Pre-existing installs get a one-time correction, not this default:
      // see migrateBuiltInMilestonesToCatalog.ts.
      active: false,
    });
  }).filter((m): m is NonNullable<typeof m> => m != null);

  if (toCreate.length > 0) await storage.milestones.putMany(toCreate);
}
