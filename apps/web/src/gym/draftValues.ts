import type { Exercise, PerformedSet, PlannedExercise } from '@atlas/data-model';
import { PLAN_LIMITS } from '@atlas/workout-engine';

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
  /** v1.0.0 (H1). Optional per-set effort/notes, previously present in the
   * data model but never wired to an input. String drafts for smooth
   * typing; parsed to number|null on complete. */
  rpe: string;
  rir: string;
  notes: string;
  kind: DraftSetKind;
}

export const EMPTY_DRAFT: DraftValues = {
  weight: '',
  externalLoad: '',
  reps: '',
  duration: '',
  distance: '',
  rpe: '',
  rir: '',
  notes: '',
  kind: 'normal',
};

/** Sanity bounds for a logged set. Nobody lifts 999,999 lb for 9,999 reps: a number like that is a typo, and one typo
 * becomes a permanent personal record, a wrecked chart axis and a milestone nobody earned. */
export const MAX_SET_LOAD = PLAN_LIMITS.load;
export const MAX_SET_REPS = PLAN_LIMITS.reps;
export const MAX_SET_SECONDS = PLAN_LIMITS.seconds;
export const MAX_SET_METERS = PLAN_LIMITS.meters;

/** The string drafts of one set, as typed. Fields an exercise does not show are simply left blank. */
export interface SetEntry {
  weight: string;
  externalLoad?: string;
  reps: string;
  duration: string;
  distance: string;
  rpe: string;
  rir: string;
}

function numberIn(text: string, min: number, max: number): boolean {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Acceptance pass. What is wrong with a set about to be logged, in words, or null when it is fine. A completed set
 * used to accept anything -- negative weight, zero or blank reps (a "completed" set with nothing in it), 999,999 lb for
 * 9,999 reps -- and every such set fed PRs, volume and charts.
 *
 * A rep exercise needs whole reps from 1; a timed one needs a time; a distance one needs a distance. A load is
 * optional (bodyweight work) but, when typed, 0 to MAX_SET_LOAD. RPE is 1-10 and RIR 0-10 when given.
 */
export function setEntryProblem(
  measurementType: Exercise['measurement_type'],
  entry: SetEntry,
): string | null {
  const blank = (text: string | undefined) => (text ?? '').trim() === '';
  if (
    measurementType === 'reps_weight' ||
    measurementType === 'reps' ||
    measurementType === 'reps_bodyweight'
  ) {
    if (blank(entry.reps)) return 'Enter the reps.';
    if (!numberIn(entry.reps, 1, MAX_SET_REPS) || !Number.isInteger(Number(entry.reps))) {
      return `Reps must be a whole number from 1 to ${MAX_SET_REPS}.`;
    }
  }
  if (
    measurementType === 'reps_weight' &&
    !blank(entry.weight) &&
    !numberIn(entry.weight, 0, MAX_SET_LOAD)
  ) {
    return Number(entry.weight) < 0
      ? "Weight can't be negative."
      : `Weight must be between 0 and ${MAX_SET_LOAD}.`;
  }
  if (
    measurementType === 'reps_bodyweight' &&
    !blank(entry.externalLoad) &&
    !numberIn(entry.externalLoad ?? '', 0, MAX_SET_LOAD)
  ) {
    return Number(entry.externalLoad) < 0
      ? "Added load can't be negative."
      : `Added load must be between 0 and ${MAX_SET_LOAD}.`;
  }
  const timed = measurementType === 'time' || measurementType === 'distance_time';
  const distance = measurementType === 'distance' || measurementType === 'distance_time';
  if (timed && !blank(entry.duration) && !numberIn(entry.duration, 1, MAX_SET_SECONDS)) {
    return `Time must be between 1 and ${MAX_SET_SECONDS.toLocaleString()} seconds.`;
  }
  if (distance && !blank(entry.distance) && !numberIn(entry.distance, 0.01, MAX_SET_METERS)) {
    return `Distance must be above 0 and at most ${MAX_SET_METERS.toLocaleString()} meters.`;
  }
  if (timed && distance) {
    if (blank(entry.duration) && blank(entry.distance)) return 'Enter a time or a distance.';
  } else if (timed) {
    if (blank(entry.duration)) return 'Enter the time in seconds.';
  } else if (distance) {
    if (blank(entry.distance)) return 'Enter the distance.';
  }
  if (!blank(entry.rpe) && !numberIn(entry.rpe, 1, 10)) return 'RPE is from 1 to 10.';
  if (!blank(entry.rir) && !numberIn(entry.rir, 0, 10)) return 'RIR is from 0 to 10.';
  return null;
}

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
