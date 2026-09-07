import type { PerformedSet, WorkoutSession } from '@atlas/data-model';
import { setPhaseOf } from '@atlas/workout-engine';

export interface EligibleSet {
  set: PerformedSet;
  session: WorkoutSession;
}

/**
 * Only 'completed' sessions ever contribute PRs -- in_progress, discarded,
 * and skipped sessions are excluded entirely, regardless of what sets they
 * contain. Warm-up sets are excluded from every PR kind (the handoff's
 * documented default when unsure); working/drop/amrap/failure sets all
 * count -- each represents a real completed effort.
 *
 * A per-exercise `skipped_exercises` marker on the session does NOT
 * invalidate sets that were actually logged for that exercise before the
 * skip -- it only means the slot wasn't fully completed as planned. Sets
 * that genuinely exist are genuine performance.
 */
export function eligibleSetsForExercise(
  sessions: WorkoutSession[],
  exerciseId: string,
): EligibleSet[] {
  return eligibleSets(sessions).filter((e) => e.set.exercise_id === exerciseId);
}

/** Same eligibility rules as eligibleSetsForExercise, across every exercise at once -- for aggregates (e.g. training-distribution totals) that don't start from one known exercise id. */
export function eligibleSets(sessions: WorkoutSession[]): EligibleSet[] {
  const result: EligibleSet[] = [];
  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    for (const set of session.performed_sets) {
      if (setPhaseOf(set) === 'warmup') continue;
      result.push({ set, session });
    }
  }
  return result;
}
