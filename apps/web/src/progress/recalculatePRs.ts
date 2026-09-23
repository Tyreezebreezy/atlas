import { calculatePRs } from '@atlas/pr-engine';
import type { Exercise, PersonalRecord } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';

/**
 * vNext Handoff 02: extended for two new dimensions the original kind+reps
 * key didn't need to distinguish. `rep_at_load`'s stable identity is its
 * `load`, not `reps` (which is the improving metric for that kind, the
 * inverse of every other kind) -- see calculatePRs.ts's doc comment on
 * `PersonalRecord.load`. `training_location_id` is folded in so two real
 * gyms' series never collide once sessions start recording one; every
 * pre-Handoff-02 row has `training_location_id: null`, so this is a no-op
 * for existing history.
 */
function prKey(record: Pick<PersonalRecord, 'kind' | 'reps' | 'load' | 'training_location_id'>): string {
  const dimension =
    record.kind === 'rep_at_load' ? `L${record.load ?? 'null'}` : `R${record.reps ?? 'null'}`;
  return `${record.kind}:${dimension}:${record.training_location_id ?? 'none'}`;
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
  const existingByKey = new Map(existingForExercise.map((p) => [prKey(p), p]));
  const freshKeys = new Set(fresh.map((p) => prKey(p)));

  const toSave = fresh.map((computed) => {
    const existing = existingByKey.get(prKey(computed));
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
  const toRemove = existingForExercise.filter((p) => !freshKeys.has(prKey(p)));

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
