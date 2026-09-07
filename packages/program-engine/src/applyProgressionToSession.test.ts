import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from '@atlas/workout-engine';
import type { Exercise, PlannedExercise, Program, WorkoutSession } from '@atlas/data-model';
import { applyProgressionToSession } from './applyProgressionToSession';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'bench',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Barbell Bench Press',
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

function makePlanned(overrides: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    id: 'pe-1',
    exercise_id: 'bench',
    order: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    target_weight: 100,
    target_external_load: null,
    target_rpe: null,
    target_rir: null,
    target_duration_seconds: null,
    target_distance_meters: null,
    rest_seconds: null,
    notes: null,
    group_id: null,
    ...overrides,
  };
}

function priorCompletedSession(target: Partial<PlannedExercise>, reps: number[]): WorkoutSession {
  let session = startWorkoutSession({
    name: 'Prior',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [makePlanned(target)],
  });
  for (const r of reps) {
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'bench',
        setIndex: 0,
        setType: 'normal',
        weight: target.target_weight ?? 100,
        reps: r,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
  }
  session = completeWorkoutSession(session);
  return { ...session, completed_at: '2026-08-01T00:00:00.000Z' };
}

describe('applyProgressionToSession', () => {
  const exercisesById = new Map([['bench', makeExercise()]]);
  const program: Pick<Program, 'default_progression_policy'> = {
    default_progression_policy: {
      kind: 'double_progression',
      load_increment: 5,
      duration_increment_seconds: null,
      duration_ceiling_seconds: null,
    },
  };

  it('resolves a new target and attaches its provenance onto the planned exercise', () => {
    const prior = priorCompletedSession({ target_weight: 100 }, [12, 12, 12]);
    const resolved = applyProgressionToSession(
      [makePlanned({ target_weight: 100 })],
      program,
      exercisesById,
      [prior],
      '2026-08-08T00:00:00.000Z',
    );
    expect(resolved[0]?.target_weight).toBe(105);
    expect(resolved[0]?.progression_decision?.previous_result).toBe('advanced');
    expect(resolved[0]?.progression_decision?.previous_session_id).toBe(prior.id);
  });

  it('target snapshot immutability: a session already started keeps its resolved target even after the program/policy changes afterward', () => {
    const prior = priorCompletedSession({ target_weight: 100 }, [12, 12, 12]);
    const resolvedAtStart = applyProgressionToSession(
      [makePlanned({ target_weight: 100 })],
      program,
      exercisesById,
      [prior],
      '2026-08-08T00:00:00.000Z',
    );
    const session = startWorkoutSession({
      name: 'Today',
      templateId: 't1',
      programId: 'p1',
      programDayId: 'd1',
      plannedSnapshot: resolvedAtStart,
    });

    // Simulate the program's policy changing (and even a totally different
    // in-memory Program.default_progression_policy) AFTER this session
    // already started -- none of it should touch the session.
    const changedProgram: Pick<Program, 'default_progression_policy'> = {
      default_progression_policy: {
        kind: 'linear_load',
        load_increment: 999,
        duration_increment_seconds: null,
        duration_ceiling_seconds: null,
      },
    };
    void applyProgressionToSession(
      [makePlanned({ target_weight: 100 })],
      changedProgram,
      exercisesById,
      [prior],
      '2026-08-15T00:00:00.000Z',
    );

    expect(session.planned_snapshot[0]?.target_weight).toBe(105);
    expect(session.planned_snapshot[0]?.progression_decision?.policy).toBe('double_progression');
  });

  it('leaves the target unchanged when the exercise is missing from the library (deleted/unavailable)', () => {
    const resolved = applyProgressionToSession(
      [makePlanned({ exercise_id: 'ghost', target_weight: 100 })],
      program,
      new Map(),
      [],
    );
    expect(resolved[0]?.target_weight).toBe(100);
    expect(resolved[0]?.progression_decision).toBeUndefined();
  });
});
