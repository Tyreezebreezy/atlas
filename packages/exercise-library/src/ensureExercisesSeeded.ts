import type { AtlasStorage } from '@atlas/storage';
import type { Exercise } from '@atlas/data-model';
import seedData from './data/atlas-exercises.json';
import workoutGuideManifest from './data/workoutGuideManifest.json';
import freeExerciseDbManifest from './data/freeExerciseDbManifest.json';
import { applyCuratedEnrichment } from './curatedEnrichment';
import { applyWorkoutGuideMedia } from './applyWorkoutGuideMedia';
import type { WorkoutGuideEntry } from './matchWorkoutGuideMedia';
import { applyFreeExerciseDbMedia } from './applyFreeExerciseDbMedia';
import type { FreeExerciseDbEntry } from './matchFreeExerciseDbMedia';

export const seedExercises = seedData as Exercise[];

/** Media providers apply in priority order -- Workout Guide first (more
 * complete three-frame motion, already the preferred provider), Free
 * Exercise DB second and only into whatever gap Workout Guide left (see
 * `applyFreeExerciseDbMedia`'s own doc comment) -- never the reverse. */
function resolveMedia(exercises: Exercise[]): Exercise[] {
  const withWorkoutGuideMedia = applyWorkoutGuideMedia(
    exercises,
    workoutGuideManifest as WorkoutGuideEntry[],
  );
  return applyFreeExerciseDbMedia(
    withWorkoutGuideMedia,
    freeExerciseDbManifest as FreeExerciseDbEntry[],
  );
}

/**
 * Bulk-seeds the library on first run. On every later run it doesn't just
 * no-op -- it backfills media for whatever's still unresolved, because a
 * media provider added after a device's first seed (Free Exercise DB,
 * v0.1.5) would otherwise be permanently invisible to every
 * already-onboarded install, the owner's real device included: nothing
 * else ever re-runs this matching pass.
 *
 * `media: undefined` means "never run through a matcher"; `media: null`
 * means "ran, no match found." That distinction (not just truthiness) is
 * what lets an already-resolved device skip both matchers entirely on
 * every normal boot after its one backfill pass, instead of re-matching
 * 1,324 exercises against ~1,200 source entries every single time --
 * `null` was already part of the type for this exact kind of use (see
 * `ExerciseMedia`'s doc comment) and nothing previously set it.
 *
 * Custom exercises are excluded from matching entirely, backfill included
 * -- they were never part of either provider's source data, and matching
 * by name could otherwise misfire if a user's own exercise happens to
 * share a name with a real one.
 */
export async function ensureExercisesSeeded(storage: AtlasStorage): Promise<void> {
  const existing = await storage.exercises.getAll();

  if (existing.length === 0) {
    const enriched = applyCuratedEnrichment(seedExercises);
    const resolved = resolveMedia(enriched).map((e) => ({ ...e, media: e.media ?? null }));
    await storage.exercises.putMany(resolved);
    return;
  }

  const unresolved = existing.filter((e) => !e.is_custom && e.media === undefined);
  if (unresolved.length === 0) return;

  const seedable = existing.filter((e) => !e.is_custom);
  const resultById = new Map(resolveMedia(seedable).map((e) => [e.id, e]));
  const changed = unresolved.map((e) => ({ ...e, media: resultById.get(e.id)?.media ?? null }));
  await storage.exercises.putMany(changed);
}
