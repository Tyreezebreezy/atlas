import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, ProgressionPolicy, WorkoutSession } from '@atlas/data-model';
import { NO_PROGRESSION } from '@atlas/data-model';
import { computeProgressionDecision, findPreviousNormalSession } from './progressionDecision';

let exerciseCounter = 0;
function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  exerciseCounter += 1;
  return {
    id: overrides.id ?? `ex-${exerciseCounter}`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: `Exercise ${exerciseCounter}`,
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

function set(input: Partial<LogSetInput> & { exerciseId: string }) {
  return createPerformedSet({
    setIndex: 0,
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
}

function sessionWithTarget(
  exerciseId: string,
  target: {
    target_weight?: number | null;
    target_external_load?: number | null;
    target_reps_min?: number | null;
    target_reps_max?: number | null;
    target_duration_seconds?: number | null;
  },
  sets: ReturnType<typeof set>[],
  completedAt: string,
  isDeload = false,
): WorkoutSession {
  let session = startWorkoutSession({
    name: 'Session',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [
      {
        id: 'pe-1',
        exercise_id: exerciseId,
        order: 0,
        target_sets: 3,
        target_reps_min: target.target_reps_min ?? null,
        target_reps_max: target.target_reps_max ?? null,
        target_weight: target.target_weight ?? null,
        target_external_load: target.target_external_load ?? null,
        target_rpe: null,
        target_rir: null,
        target_duration_seconds: target.target_duration_seconds ?? null,
        target_distance_meters: null,
        rest_seconds: null,
        notes: null,
        group_id: null,
      },
    ],
  });
  for (const s of sets) {
    session = addPerformedSet(session, {
      ...s,
      exercise_id: exerciseId,
      completed_at: completedAt,
    });
  }
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt, is_deload: isDeload };
}

const currentTarget = {
  target_weight: null,
  target_external_load: null,
  target_reps_min: null,
  target_reps_max: null,
  target_duration_seconds: null,
};

describe('findPreviousNormalSession', () => {
  it('finds the most recent completed session with a work set for this exercise', () => {
    const s1 = sessionWithTarget(
      'bench',
      {},
      [set({ exerciseId: 'bench', reps: 8 })],
      '2026-08-01T00:00:00.000Z',
    );
    const s2 = sessionWithTarget(
      'bench',
      {},
      [set({ exerciseId: 'bench', reps: 9 })],
      '2026-08-08T00:00:00.000Z',
    );
    const found = findPreviousNormalSession([s1, s2], 'bench', '2026-08-15T00:00:00.000Z');
    expect(found?.id).toBe(s2.id);
  });

  it('is chronology-safe: uses completed_at, not array order, and never returns a session at/after the boundary', () => {
    const early = sessionWithTarget(
      'bench',
      {},
      [set({ exerciseId: 'bench', reps: 8 })],
      '2026-08-01T00:00:00.000Z',
    );
    const late = sessionWithTarget(
      'bench',
      {},
      [set({ exerciseId: 'bench', reps: 9 })],
      '2026-08-08T00:00:00.000Z',
    );
    // Deliberately out of chronological order in the array -- a backfilled
    // session saved after the fact must not be mistaken for "most recent."
    const found = findPreviousNormalSession([late, early], 'bench', '2026-08-08T00:00:00.000Z');
    expect(found?.id).toBe(early.id); // late is excluded: not strictly before the boundary
  });

  it('excludes deload sessions from the baseline lookup', () => {
    const normal = sessionWithTarget(
      'bench',
      {},
      [set({ exerciseId: 'bench', reps: 8 })],
      '2026-08-01T00:00:00.000Z',
    );
    const deload = sessionWithTarget(
      'bench',
      {},
      [set({ exerciseId: 'bench', reps: 8 })],
      '2026-08-08T00:00:00.000Z',
      true,
    );
    const found = findPreviousNormalSession([normal, deload], 'bench', '2026-08-15T00:00:00.000Z');
    expect(found?.id).toBe(normal.id);
  });

  it('excludes a session whose only sets for this exercise are warm-ups', () => {
    const warmupOnly = sessionWithTarget(
      'bench',
      {},
      [set({ exerciseId: 'bench', reps: 8, phase: 'warmup' })],
      '2026-08-01T00:00:00.000Z',
    );
    const found = findPreviousNormalSession([warmupOnly], 'bench', '2026-08-15T00:00:00.000Z');
    expect(found).toBeNull();
  });

  it('returns null when there is no eligible prior session', () => {
    expect(findPreviousNormalSession([], 'bench', '2026-08-15T00:00:00.000Z')).toBeNull();
  });
});

describe('computeProgressionDecision: none / first-time', () => {
  it('holds with no policy configured', () => {
    const decision = computeProgressionDecision(
      NO_PROGRESSION,
      makeExercise(),
      currentTarget,
      null,
    );
    expect(decision.previous_result).toBe('first_time');
    expect(decision.resulting_target).toEqual(currentTarget);
  });

  it('is first_time when there is no previous session, regardless of policy', () => {
    const policy: ProgressionPolicy = {
      kind: 'double_progression',
      load_increment: 5,
      duration_increment_seconds: null,
      duration_ceiling_seconds: null,
    };
    const decision = computeProgressionDecision(policy, makeExercise(), currentTarget, null);
    expect(decision.previous_result).toBe('first_time');
    expect(decision.resulting_target).toEqual(currentTarget);
  });
});

describe('computeProgressionDecision: double_progression', () => {
  const policy: ProgressionPolicy = {
    kind: 'double_progression',
    load_increment: 5,
    duration_increment_seconds: null,
    duration_ceiling_seconds: null,
  };
  const exercise = makeExercise({ measurement_type: 'reps_weight' });

  it('holds when sets stay in range without reaching the ceiling (100x10,100x10,100x9 with 8-12 target)', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      [
        set({ exerciseId: exercise.id, weight: 100, reps: 10 }),
        set({ exerciseId: exercise.id, weight: 100, reps: 10 }),
        set({ exerciseId: exercise.id, weight: 100, reps: 9 }),
      ],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      prev,
    );
    expect(decision.previous_result).toBe('held');
    expect(decision.resulting_target.target_weight).toBe(100);
  });

  it('advances when every set reaches the ceiling (100x12,100x12,100x12 -> 105)', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      [
        set({ exerciseId: exercise.id, weight: 100, reps: 12 }),
        set({ exerciseId: exercise.id, weight: 100, reps: 12 }),
        set({ exerciseId: exercise.id, weight: 100, reps: 12 }),
      ],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      prev,
    );
    expect(decision.previous_result).toBe('advanced');
    expect(decision.resulting_target.target_weight).toBe(105);
    expect(decision.resulting_target.target_reps_min).toBe(8);
    expect(decision.resulting_target.target_reps_max).toBe(12);
  });

  it('does not advance from a single set reaching the top of the range alone', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      [
        set({ exerciseId: exercise.id, weight: 100, reps: 12 }),
        set({ exerciseId: exercise.id, weight: 100, reps: 9 }),
        set({ exerciseId: exercise.id, weight: 100, reps: 8 }),
      ],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      prev,
    );
    expect(decision.previous_result).toBe('held');
    expect(decision.resulting_target.target_weight).toBe(100);
  });

  it('marks failed_held when a set falls below the target range floor', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 100, reps: 5 })],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      prev,
    );
    expect(decision.previous_result).toBe('failed_held');
    expect(decision.resulting_target.target_weight).toBe(100);
  });

  it('suggests rather than auto-advances at the ceiling when no load increment is configured (pure bodyweight)', () => {
    const noIncrementPolicy: ProgressionPolicy = { ...policy, load_increment: null };
    const bwExercise = makeExercise({ measurement_type: 'reps_bodyweight' });
    const prev = sessionWithTarget(
      bwExercise.id,
      { target_reps_min: 8, target_reps_max: 15 },
      [
        set({ exerciseId: bwExercise.id, reps: 15 }),
        set({ exerciseId: bwExercise.id, reps: 15 }),
        set({ exerciseId: bwExercise.id, reps: 15 }),
      ],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      noIncrementPolicy,
      bwExercise,
      { ...currentTarget, target_reps_min: 8, target_reps_max: 15 },
      prev,
    );
    expect(decision.previous_result).toBe('suggest_advance');
    // Never silently mutates to a different exercise or auto-adds load.
    expect(decision.resulting_target.target_reps_max).toBe(15);
    expect(decision.resulting_target.target_external_load).toBeNull();
  });

  it('advances external_load, not weight, for a weighted bodyweight exercise at the ceiling', () => {
    const bwExercise = makeExercise({ measurement_type: 'reps_bodyweight' });
    const prev = sessionWithTarget(
      bwExercise.id,
      { target_external_load: 25, target_reps_min: 5, target_reps_max: 8 },
      [
        set({ exerciseId: bwExercise.id, reps: 8, externalLoad: 25 }),
        set({ exerciseId: bwExercise.id, reps: 8, externalLoad: 25 }),
      ],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      bwExercise,
      { ...currentTarget, target_external_load: 25, target_reps_min: 5, target_reps_max: 8 },
      prev,
    );
    expect(decision.previous_result).toBe('advanced');
    expect(decision.resulting_target.target_external_load).toBe(30);
    expect(decision.resulting_target.target_weight).toBeNull();
  });

  it('does not alter unilateral (per-side) reps -- reads them exactly as stored', () => {
    const unilateral = makeExercise({ measurement_type: 'reps_weight', is_unilateral: true });
    const prev = sessionWithTarget(
      unilateral.id,
      { target_weight: 30, target_reps_min: 8, target_reps_max: 10 },
      [
        set({ exerciseId: unilateral.id, weight: 30, reps: 10 }),
        set({ exerciseId: unilateral.id, weight: 30, reps: 10 }),
      ],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      unilateral,
      { ...currentTarget, target_weight: 30, target_reps_min: 8, target_reps_max: 10 },
      prev,
    );
    // Same outcome as the bilateral case -- reps are never doubled/halved.
    expect(decision.previous_result).toBe('advanced');
    expect(decision.resulting_target.target_weight).toBe(35);
  });
});

describe('computeProgressionDecision: linear_load', () => {
  const policy: ProgressionPolicy = {
    kind: 'linear_load',
    load_increment: 2.5,
    duration_increment_seconds: null,
    duration_ceiling_seconds: null,
  };
  const exercise = makeExercise({ measurement_type: 'reps_weight' });

  it('advances by the configured increment after a successful session', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_weight: 100, target_reps_min: 5 },
      [set({ exerciseId: exercise.id, weight: 100, reps: 5 })],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_weight: 100, target_reps_min: 5 },
      prev,
    );
    expect(decision.previous_result).toBe('advanced');
    expect(decision.resulting_target.target_weight).toBe(102.5);
  });

  it('does not blindly continue adding weight after a failed session', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_weight: 100, target_reps_min: 5 },
      [set({ exerciseId: exercise.id, weight: 100, reps: 3 })],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_weight: 100, target_reps_min: 5 },
      prev,
    );
    expect(decision.previous_result).toBe('failed_held');
    expect(decision.resulting_target.target_weight).toBe(100);
  });
});

describe('computeProgressionDecision: timed', () => {
  const policy: ProgressionPolicy = {
    kind: 'timed',
    load_increment: null,
    duration_increment_seconds: 5,
    duration_ceiling_seconds: 60,
  };
  const exercise = makeExercise({ measurement_type: 'time' });

  it('advances duration after reaching the target (30s -> 35s)', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_duration_seconds: 30 },
      [set({ exerciseId: exercise.id, durationSeconds: 32 })],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_duration_seconds: 30 },
      prev,
    );
    expect(decision.previous_result).toBe('advanced');
    expect(decision.resulting_target.target_duration_seconds).toBe(35);
  });

  it('holds at the configured ceiling instead of advancing past it', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_duration_seconds: 58 },
      [set({ exerciseId: exercise.id, durationSeconds: 60 })],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_duration_seconds: 58 },
      prev,
    );
    expect(decision.previous_result).toBe('held');
    expect(decision.resulting_target.target_duration_seconds).toBe(58);
  });

  it('holds when the target duration was not reached', () => {
    const prev = sessionWithTarget(
      exercise.id,
      { target_duration_seconds: 30 },
      [set({ exerciseId: exercise.id, durationSeconds: 20 })],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_duration_seconds: 30 },
      prev,
    );
    expect(decision.previous_result).toBe('failed_held');
    expect(decision.resulting_target.target_duration_seconds).toBe(30);
  });
});

describe('computeProgressionDecision: deload exclusion (via findPreviousNormalSession composition)', () => {
  it('a deload session never becomes the baseline for the next normal session', () => {
    const exercise = makeExercise({ measurement_type: 'reps_weight' });
    const policy: ProgressionPolicy = {
      kind: 'linear_load',
      load_increment: 5,
      duration_increment_seconds: null,
      duration_ceiling_seconds: null,
    };
    const normal = sessionWithTarget(
      exercise.id,
      { target_weight: 185, target_reps_min: 5 },
      [set({ exerciseId: exercise.id, weight: 185, reps: 5 })],
      '2026-08-01T00:00:00.000Z',
    );
    const deload = sessionWithTarget(
      exercise.id,
      { target_weight: 135, target_reps_min: 5 },
      [set({ exerciseId: exercise.id, weight: 135, reps: 5 })],
      '2026-08-08T00:00:00.000Z',
      true,
    );
    const previous = findPreviousNormalSession(
      [normal, deload],
      exercise.id,
      '2026-08-15T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_weight: 185, target_reps_min: 5 },
      previous,
    );
    // Baseline comes from the 185 normal session, not the 135 deload --
    // the next normal target is 185 + 5, never derived from 135.
    expect(previous?.id).toBe(normal.id);
    expect(decision.resulting_target.target_weight).toBe(190);
  });
});

describe('computeProgressionDecision: provenance', () => {
  it('records enough structured evidence to explain the decision without regenerating prose', () => {
    const exercise = makeExercise({ measurement_type: 'reps_weight' });
    const policy: ProgressionPolicy = {
      kind: 'double_progression',
      load_increment: 5,
      duration_increment_seconds: null,
      duration_ceiling_seconds: null,
    };
    const prev = sessionWithTarget(
      exercise.id,
      { target_weight: 185, target_reps_min: 8, target_reps_max: 12 },
      [
        set({ exerciseId: exercise.id, weight: 185, reps: 10 }),
        set({ exerciseId: exercise.id, weight: 185, reps: 10 }),
        set({ exerciseId: exercise.id, weight: 185, reps: 9 }),
      ],
      '2026-08-01T00:00:00.000Z',
    );
    const decision = computeProgressionDecision(
      policy,
      exercise,
      { ...currentTarget, target_weight: 185, target_reps_min: 8, target_reps_max: 12 },
      prev,
    );
    expect(decision.policy).toBe('double_progression');
    expect(decision.previous_session_id).toBe(prev.id);
    expect(decision.previous_target).toEqual({
      target_weight: 185,
      target_external_load: null,
      target_reps_min: 8,
      target_reps_max: 12,
      target_duration_seconds: null,
    });
    expect(decision.previous_result).toBe('held');
    expect(typeof decision.decision_summary).toBe('string');
    expect(decision.decision_summary.length).toBeGreaterThan(0);
    expect(decision.resulting_target.target_weight).toBe(185);
    expect(typeof decision.computed_at).toBe('string');
  });
});
