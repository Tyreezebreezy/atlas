import type { Exercise, PersonalRecord, PrKind } from '@atlas/data-model';
import { performanceContextKey, type PerformanceContextParts } from '@atlas/pr-engine';

/** Which PR kind calculatePRs.ts actually produces as the headline "best"
 * for each measurement type -- see packages/pr-engine/src/calculatePRs.ts.
 * distance_time produces both 'timed' and 'distance'; distance is preferred
 * as the more usual primary metric for that kind of exercise. */
function headlineKind(measurementType: Exercise['measurement_type']): PrKind | null {
  switch (measurementType) {
    case 'reps_weight':
      return 'max_load';
    case 'reps':
    case 'reps_bodyweight':
      return 'bodyweight';
    case 'time':
      return 'timed';
    case 'distance':
    case 'distance_time':
      return 'distance';
    default:
      return null;
  }
}

/** The single most relevant PR for Gym Mode's compact BEST slot -- one
 * number, not every PR kind this exercise has.
 *
 * Acceptance pass: it is the best in the context the exercise is being done in -- this place and this machine --
 * because records never compare across machines or places (docs/PRS.md). This used to take the first record it
 * found for the exercise anywhere, so Chest Press #1 at Main Gym could show "BEST 95 lb" from another gym's press.
 * A first time on a machine has no best yet, and shows none. */
export function bestPRForExercise(
  personalRecords: PersonalRecord[],
  exercise: Exercise,
  context: PerformanceContextParts,
): PersonalRecord | null {
  const kind = headlineKind(exercise.measurement_type);
  if (!kind) return null;
  const key = performanceContextKey(context);
  return (
    personalRecords.find(
      (pr) =>
        pr.exercise_id === exercise.id && pr.kind === kind && performanceContextKey(pr) === key,
    ) ?? null
  );
}
