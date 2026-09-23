import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import { createGymEquipmentInstance, type CreateGymEquipmentInstanceInput } from '@atlas/equipment-engine';
import type { Exercise, ProgressionPolicy, WorkoutSession } from '@atlas/data-model';
import { NO_PROGRESSION } from '@atlas/data-model';
import { recommendProgression } from './recommendProgression';
import { refineForCurrentSession } from './refineForCurrentSession';

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
  target: { target_weight?: number | null; target_reps_min?: number | null; target_reps_max?: number | null },
  sets: ReturnType<typeof set>[],
  completedAt: string,
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
        target_external_load: null,
        target_rpe: null,
        target_rir: null,
        target_duration_seconds: null,
        target_distance_meters: null,
        rest_seconds: null,
        notes: null,
        group_id: null,
      },
    ],
  });
  for (const s of sets) {
    session = addPerformedSet(session, { ...s, exercise_id: exerciseId, completed_at: completedAt });
  }
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

const currentTarget = {
  target_weight: null,
  target_external_load: null,
  target_reps_min: null,
  target_reps_max: null,
  target_duration_seconds: null,
};

const doubleProgression: ProgressionPolicy = {
  kind: 'double_progression',
  load_increment: null,
  duration_increment_seconds: null,
  duration_ceiling_seconds: null,
  ceiling_reps_max: null,
};

function chestPress(overrides: Partial<CreateGymEquipmentInstanceInput> = {}) {
  return createGymEquipmentInstance({
    trainingLocationId: 'loc-1',
    equipmentDefinitionId: 'eq-chest-press',
    label: 'Machine Chest Press',
    minLoad: 10,
    maxLoad: 170,
    increment: 10,
    ...overrides,
  });
}

describe('recommendProgression', () => {
  it('first exposure: no history at all -> establish_baseline / FIRST_EXPOSURE', () => {
    const exercise = makeExercise();
    const result = recommendProgression({
      exercise,
      policy: doubleProgression,
      currentTarget: { ...currentTarget, target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      previousSession: null,
      equipment: null,
    });
    expect(result).toMatchObject({ action: 'establish_baseline', reason_code: 'FIRST_EXPOSURE' });
  });

  it('inside rep range: stayed within range, below the top -> hold / WITHIN_REP_RANGE', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 150, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 150, reps: 9 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: doubleProgression,
      currentTarget,
      previousSession,
      equipment: chestPress(),
    });
    expect(result).toMatchObject({ action: 'hold', reason_code: 'WITHIN_REP_RANGE', target_load: 150 });
  });

  it('top of range, next load available on the equipment -> increase_load / NEXT_LOAD_AVAILABLE', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 150, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 150, reps: 12 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: doubleProgression,
      currentTarget,
      previousSession,
      equipment: chestPress(), // 10 lb steps up to 170 -> next real load above 150 is 160
    });
    expect(result).toMatchObject({
      action: 'increase_load',
      reason_code: 'NEXT_LOAD_AVAILABLE',
      target_load: 160,
    });
  });

  it('top of range, next load unavailable (equipment maxed) -> increase_reps toward the ceiling / EQUIPMENT_MAX_REACHED', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 170, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 170, reps: 12 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: { ...doubleProgression, ceiling_reps_max: 20 },
      currentTarget,
      previousSession,
      equipment: chestPress(), // already at the 170 lb max
    });
    expect(result).toMatchObject({
      action: 'increase_reps',
      reason_code: 'EQUIPMENT_MAX_REACHED',
      target_load: 170,
      target_reps: 13,
    });
  });

  it('top of range, next available load exceeds the configured acceptable jump -> continue rep progression / NEXT_LOAD_TOO_LARGE', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 100, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 100, reps: 12 })],
      '2026-08-01T10:00:00.000Z',
    );
    // A machine that jumps in big 50 lb steps -- the next available load
    // (150) is a much bigger single jump than the owner wants suggested.
    const bigStepMachine = chestPress({ minLoad: 50, maxLoad: 300, increment: 50 });
    const result = recommendProgression({
      exercise,
      policy: { ...doubleProgression, ceiling_reps_max: 20, max_acceptable_load_jump: 20 },
      currentTarget,
      previousSession,
      equipment: bigStepMachine,
    });
    expect(result).toMatchObject({
      action: 'increase_reps',
      reason_code: 'NEXT_LOAD_TOO_LARGE',
      target_load: 100,
      target_reps: 13,
    });
  });

  it('equipment ceiling + ceiling rep progression: repeated calls climb 12 -> 13 -> 14, never past the configured cap', () => {
    const exercise = makeExercise();
    const machine = chestPress();
    function atCeiling(repsMax: number) {
      const previousSession = sessionWithTarget(
        exercise.id,
        { target_weight: 170, target_reps_min: 8, target_reps_max: repsMax },
        [set({ exerciseId: exercise.id, weight: 170, reps: repsMax })],
        '2026-08-01T10:00:00.000Z',
      );
      return recommendProgression({
        exercise,
        policy: { ...doubleProgression, ceiling_reps_max: 15 },
        currentTarget,
        previousSession,
        equipment: machine,
      });
    }
    expect(atCeiling(12)).toMatchObject({ action: 'increase_reps', target_reps: 13 });
    expect(atCeiling(13)).toMatchObject({ action: 'increase_reps', target_reps: 14 });
    expect(atCeiling(14)).toMatchObject({ action: 'increase_reps', target_reps: 15 });
  });

  it('ceiling rep cap exhausted (load AND reps both maxed) -> review, never a set addition', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 170, target_reps_min: 8, target_reps_max: 15 },
      [set({ exerciseId: exercise.id, weight: 170, reps: 15 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: { ...doubleProgression, ceiling_reps_max: 15 }, // already at the ceiling cap
      currentTarget,
      previousSession,
      equipment: chestPress(),
    });
    expect(result).toMatchObject({ action: 'review', reason_code: 'PROGRAM_REVIEW_REQUIRED' });
  });

  it('no ceiling configured at all once load is exhausted -> review, not a silent hold', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 170, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 170, reps: 12 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: doubleProgression, // no ceiling_reps_max configured
      currentTarget,
      previousSession,
      equipment: chestPress(),
    });
    expect(result.action).toBe('review');
    expect(result.reason_code).toBe('PROGRAM_REVIEW_REQUIRED');
  });

  it('never recommends adding a set -- no field/action in the recommendation touches set count', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 170, target_reps_min: 8, target_reps_max: 15 },
      [set({ exerciseId: exercise.id, weight: 170, reps: 15 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: { ...doubleProgression, ceiling_reps_max: 15 },
      currentTarget,
      previousSession,
      equipment: chestPress(),
    });
    expect(result).not.toHaveProperty('target_sets');
    expect(['increase_load', 'increase_reps', 'hold', 'reduce', 'establish_baseline', 'review']).toContain(
      result.action,
    );
  });

  it('no equipment configured at all -- falls back to the unconstrained decision (never treated as "at max")', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 150, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 150, reps: 12 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: { ...doubleProgression, load_increment: 10 },
      currentTarget,
      previousSession,
      equipment: null,
    });
    expect(result).toMatchObject({ action: 'increase_load', reason_code: 'NEXT_LOAD_AVAILABLE', target_load: 160 });
  });

  it('works deterministically when RIR was never logged on any set', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 150, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 150, reps: 12, rir: null })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: doubleProgression,
      currentTarget,
      previousSession,
      equipment: chestPress(),
    });
    expect(result.action).toBe('increase_load');
  });

  it('RIR present on the logged sets does not change the deterministic outcome (supplemental evidence only, not yet consumed)', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 150, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 150, reps: 12, rir: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: doubleProgression,
      currentTarget,
      previousSession,
      equipment: chestPress(),
    });
    // Same result as the RIR-absent case above -- RIR is optional
    // supplemental evidence (research pack §4.6), never a required input.
    expect(result).toMatchObject({ action: 'increase_load', reason_code: 'NEXT_LOAD_AVAILABLE', target_load: 160 });
  });

  it('a measurement type with no loadable field (pure bodyweight reps) never gets a fabricated load recommendation', () => {
    const exercise = makeExercise({ measurement_type: 'reps' });
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, reps: 12 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = recommendProgression({
      exercise,
      policy: doubleProgression,
      currentTarget,
      previousSession,
      equipment: chestPress(),
    });
    expect(result.target_load).toBeNull();
    expect(result.action).not.toBe('increase_load');
  });

  it('NO_PROGRESSION policy: no recommendation is fabricated for an exercise with no policy configured', () => {
    const exercise = makeExercise();
    const result = recommendProgression({
      exercise,
      policy: NO_PROGRESSION,
      currentTarget: { ...currentTarget, target_weight: 100 },
      previousSession: null,
      equipment: null,
    });
    expect(result.action).toBe('establish_baseline');
    expect(result.data_state).toBe('first_exposure');
  });
});

describe('vNext Handoff 02: recommendProgression + refineForCurrentSession composed', () => {
  it('current-session refinement never overrides an equipment-constrained target_load from recommendProgression', () => {
    const exercise = makeExercise();
    const previousSession = sessionWithTarget(
      exercise.id,
      { target_weight: 160, target_reps_min: 8, target_reps_max: 12 },
      [set({ exerciseId: exercise.id, weight: 160, reps: 12 })],
      '2026-08-01T10:00:00.000Z',
    );
    // Equipment tops out at 170 -- the base recommendation should land on 170, not a bigger arithmetic jump.
    const base = recommendProgression({
      exercise,
      policy: doubleProgression,
      currentTarget: { ...currentTarget, target_weight: 160, target_reps_min: 8, target_reps_max: 12 },
      previousSession,
      equipment: chestPress({ maxLoad: 170 }),
    });
    expect(base.target_load).toBe(170);

    // A weak first set this session must not change target_load -- only refineForCurrentSession's
    // one allowed field (target_reps) can move, and equipment already bounded target_load upstream.
    const refined = refineForCurrentSession(
      base,
      [set({ exerciseId: exercise.id, weight: 170, reps: 3 })],
      doubleProgression,
    );
    expect(refined.target_load).toBe(170);
    expect(refined.reason_code).toBe('CURRENT_SESSION_BELOW_TARGET');
  });
});
