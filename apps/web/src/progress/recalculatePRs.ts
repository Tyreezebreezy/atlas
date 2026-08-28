import { calculatePRs } from '@atlas/pr-engine';
import type { Exercise } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';

function prKey(kind: string, reps: number | null): string {
  return `${kind}:${reps ?? 'null'}`;
}

/**
 * Recomputes and persists the full current PersonalRecord set for one
 * exercise from all completed history -- a full deterministic recompute,
 * not an incremental update, so it's always correct regardless of what was
 * stored before (backfilled history, corrections, replacements). Reuses
 * existing row ids for keys that still exist (upsert by kind+reps), so
 * unrelated screens don't see a PersonalRecord's id change on every finish.
 */
export async function recalculatePRsForExercise(
  storage: AtlasStorage,
  exercise: Exercise,
): Promise<void> {
  const [allSessions, allPRs] = await Promise.all([
    storage.workoutSessions.getAll(),
    storage.personalRecords.getAll(),
  ]);

  const fresh = calculatePRs(allSessions, exercise);
  const existingForExercise = allPRs.filter((p) => p.exercise_id === exercise.id);
  const existingByKey = new Map(existingForExercise.map((p) => [prKey(p.kind, p.reps), p]));
  const freshKeys = new Set(fresh.map((p) => prKey(p.kind, p.reps)));

  const toSave = fresh.map((computed) => {
    const existing = existingByKey.get(prKey(computed.kind, computed.reps));
    if (!existing) return computed;
    if (
      existing.value === computed.value &&
      existing.source_session_id === computed.source_session_id
    ) {
      return existing;
    }
    return {
      ...computed,
      id: existing.id,
      created_at: existing.created_at,
      version: existing.version + 1,
    };
  });
  const toRemove = existingForExercise.filter((p) => !freshKeys.has(prKey(p.kind, p.reps)));

  await Promise.all([
    toSave.length > 0 ? storage.personalRecords.putMany(toSave) : Promise.resolve(),
    ...toRemove.map((p) => storage.personalRecords.softDelete(p.id)),
  ]);
}

/** Recalculates PRs for every distinct exercise touched by a just-completed session -- call once on workout finish. */
export async function recalculatePRsForSession(
  storage: AtlasStorage,
  exerciseIds: string[],
  exercisesById: Map<string, Exercise>,
): Promise<void> {
  const unique = [...new Set(exerciseIds)];
  await Promise.all(
    unique.map((id) => {
      const exercise = exercisesById.get(id);
      return exercise ? recalculatePRsForExercise(storage, exercise) : Promise.resolve();
    }),
  );
}
