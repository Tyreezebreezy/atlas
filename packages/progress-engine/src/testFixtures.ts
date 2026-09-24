import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, PersonalRecord, PlannedExercise, WorkoutSession } from '@atlas/data-model';

/** Builders shared by the vNext Handoff 03B progress-engine tests. Not exported from the package. */

export function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'bench',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Exercise',
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
    ...overrides,
  };
}

/** An exercise with an explicit muscle map, so tests never depend on the curated/imported tables. */
export function exerciseTargeting(
  id: string,
  primary: string[],
  secondary: string[] = [],
  overrides: Partial<Exercise> = {},
): Exercise {
  return makeExercise({
    id,
    name: id,
    muscle_map: { primary, secondary, provenance: 'user', taxonomy_version: '1.0.0' },
    ...overrides,
  });
}

export type SetInput = Partial<LogSetInput> & { exerciseId: string };

export function makeSession(
  sets: SetInput[],
  completedAt: string,
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession {
  let session = startWorkoutSession({
    name: 'Session',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
  });
  sets.forEach((input, index) => {
    const performed = createPerformedSet({
      setIndex: index,
      setType: 'normal',
      weight: null,
      reps: null,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
      ...input,
    });
    session = addPerformedSet(session, { ...performed, completed_at: completedAt });
  });
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt, ...overrides };
}

export function makePR(
  overrides: Partial<PersonalRecord> & { source_session_id: string },
): PersonalRecord {
  return {
    id: `pr-${overrides.source_session_id}-${overrides.kind ?? 'max_load'}`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    exercise_id: 'bench',
    kind: 'max_load',
    value: 100,
    reps: 5,
    achieved_at: '2026-08-01T10:00:00.000Z',
    source_set_id: 'set-1',
    training_location_id: null,
    ...overrides,
  };
}

export function planned(exerciseId: string, targetSets: number | null): PlannedExercise {
  return {
    id: `planned-${exerciseId}`,
    exercise_id: exerciseId,
    order: 0,
    target_sets: targetSets,
    group_id: null,
  } as PlannedExercise;
}

/** ISO timestamp `daysAgo` days before `now`, at 10:00 UTC. */
export function daysBefore(now: Date, daysAgo: number): string {
  const d = new Date(now);
  d.setUTCHours(10, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}
