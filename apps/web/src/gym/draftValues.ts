import type { Exercise, PerformedSet, PlannedExercise } from '@atlas/data-model';

/**
 * v0.2.5. Pure draft-prefill logic, extracted out of ExerciseLogger so the
 * cross-exercise carryover regression is unit-testable without mounting a
 * component (this repo tests pure functions in a node environment, not
 * React trees).
 *
 * A set being typed into is pure component state; the value it starts from
 * is derived ONLY from (a) this exercise's own already-completed sets in the
 * current session, (b) this exercise's own previous history, and (c) this
 * exercise's own plan target -- never from another movement's in-flight
 * entry. The `key` on `<ExerciseLogger>` guarantees a fresh mount per
 * exercise, so `drafts` state is reset; this function guarantees the fresh
 * mount starts from the right data.
 */

export type DraftSetKind = 'warmup' | 'normal' | 'amrap' | 'drop' | 'failure' | 'rest_pause';

export interface DraftValues {
  weight: string;
  externalLoad: string;
  reps: string;
  duration: string;
  distance: string;
  kind: DraftSetKind;
}

export const EMPTY_DRAFT: DraftValues = {
  weight: '',
  externalLoad: '',
  reps: '',
  duration: '',
  distance: '',
  kind: 'normal',
};

/**
 * The initial value for a not-yet-typed set row, parameterized entirely by
 * this exercise's own plan/history. "Same exercise" reference/reuse is
 * intentional (the last completed set and the last previous set feed the
 * weight prefill); "different exercise" is impossible by construction --
 * there is no cross-exercise state here to leak.
 */
export function initialDraftValues(
  exercise: Exercise,
  planned: PlannedExercise,
  performedSets: PerformedSet[],
  previousSets: PerformedSet[],
): DraftValues {
  const lastCompleted = performedSets[performedSets.length - 1];
  const lastPrevious = previousSets[previousSets.length - 1];
  const weight = lastCompleted?.weight ?? lastPrevious?.weight ?? planned.target_weight;
  const externalLoad =
    lastCompleted?.external_load ?? lastPrevious?.external_load ?? planned.target_external_load;
  return {
    ...EMPTY_DRAFT,
    weight: weight != null ? String(weight) : '',
    externalLoad: externalLoad != null ? String(externalLoad) : '',
    reps: planned.target_reps_min != null ? String(planned.target_reps_min) : '',
    duration:
      planned.target_duration_seconds != null ? String(planned.target_duration_seconds) : '',
    distance: planned.target_distance_meters != null ? String(planned.target_distance_meters) : '',
    // v0.2.5. A planned warm-up exercise (warmup_execution set) defaults its
    // set type to warm-up so it's excluded from PRs/volume by default.
    kind: planned.warmup_execution ? 'warmup' : 'normal',
  };
}
