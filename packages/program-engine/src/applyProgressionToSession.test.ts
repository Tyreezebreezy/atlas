import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from '@atlas/workout-engine';
import { createGymEquipmentInstance } from '@atlas/equipment-engine';
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

describe('applyProgressionToSession -- the target never exceeds what the equipment can load (vNext Handoff 04B)', () => {
  const dumbbellExercise = new Map([['bench', makeExercise({ equipment: ['dumbbell'] })]]);
  const programWith = (
    overrides: { load_increment?: number | null; ceiling_reps_max?: number | null } = {},
  ): Pick<Program, 'default_progression_policy'> => ({
    default_progression_policy: {
      kind: 'double_progression',
      load_increment: 5,
      duration_increment_seconds: null,
      duration_ceiling_seconds: null,
      ceiling_reps_max: 20,
      ...overrides,
    },
  });
  const withCeiling = programWith();
  const rack = (loads: number[]) =>
    createGymEquipmentInstance({
      trainingLocationId: 'main',
      equipmentDefinitionId: 'eq-db',
      label: 'Dumbbells',
      exactLoads: loads,
    });
  const everyFive = (max: number) => Array.from({ length: max / 5 }, (_, i) => (i + 1) * 5);
  const maxOnly = (max: number) =>
    createGymEquipmentInstance({
      trainingLocationId: 'main',
      equipmentDefinitionId: 'eq-db',
      label: 'Dumbbells',
      maxLoad: max,
    });

  /** Last session topped out the 8-12 range at `load`, so an unconstrained engine adds 5. */
  const toppedOutAt = (load: number) =>
    priorCompletedSession({ target_weight: load }, [12, 12, 12]);
  const start = (
    previous: WorkoutSession,
    equipment: ReturnType<typeof rack> | null,
    history?: WorkoutSession[],
  ) =>
    applyProgressionToSession(
      [makePlanned({ target_weight: 100 })],
      withCeiling,
      dumbbellExercise,
      [previous],
      '2026-08-08T00:00:00.000Z',
      () => ({ equipment, history: history ?? [previous] }),
    )[0]!;

  it('an 80 lb rack never gets an 85 lb target; at its top the load holds and the reps move up instead', () => {
    const planned = start(toppedOutAt(80), rack(everyFive(80)));
    expect(planned.target_weight).toBe(80);
    expect(planned.target_reps_max).toBe(13);
    expect(planned.progression_decision?.resulting_target.target_weight).toBe(80);
    expect(planned.progression_decision?.previous_result).toBe('held');
    expect(planned.progression_decision?.decision_summary).toMatch(/ceiling/i);
  });

  it('a stored maximum alone caps the target the same way, without inventing the loads beneath it', () => {
    const planned = start(toppedOutAt(80), maxOnly(80));
    expect(planned.target_weight).toBe(80);
    expect(planned.target_weight).not.toBe(85);
  });

  it('a load that fits under the maximum stands as the engine computed it', () => {
    const planned = start(toppedOutAt(75), maxOnly(80));
    expect(planned.target_weight).toBe(80);
    const roomy = start(toppedOutAt(80), maxOnly(120));
    expect(roomy.target_weight).toBe(85);
    expect(roomy.progression_decision?.previous_result).toBe('advanced');
  });

  it('a load the machine lacks becomes the nearest one it has, and the explanation says so', () => {
    const planned = start(toppedOutAt(100), rack([100, 110, 120]));
    expect(planned.target_weight).toBe(110);
    expect(planned.progression_decision?.previous_result).toBe('advanced');
    expect(planned.progression_decision?.decision_summary).toMatch(
      /nearest available load \(110\)/,
    );
  });

  it('with no ceiling reps configured, a capped target holds the load and the rep range', () => {
    const planned = applyProgressionToSession(
      [makePlanned({ target_weight: 100 })],
      programWith({ ceiling_reps_max: null }),
      dumbbellExercise,
      [toppedOutAt(80)],
      '2026-08-08T00:00:00.000Z',
      () => ({ equipment: rack(everyFive(80)), history: [toppedOutAt(80)] }),
    )[0]!;
    expect(planned.target_weight).toBe(80);
    expect(planned.target_reps_max).toBe(12);
    expect(planned.progression_decision?.decision_summary).toMatch(/review needed/i);
  });

  it("equipment that has no load data (unknown) constrains nothing -- the engine's own advance stands", () => {
    const unknown = createGymEquipmentInstance({
      trainingLocationId: 'main',
      equipmentDefinitionId: 'eq-db',
      label: 'Dumbbells',
    });
    expect(start(toppedOutAt(80), unknown).target_weight).toBe(85);
  });

  it('with no equipment, or no context at all, the result is exactly the unconstrained decision', () => {
    const previous = toppedOutAt(80);
    const at = '2026-08-08T00:00:00.000Z';
    const plain = applyProgressionToSession(
      [makePlanned({ target_weight: 100 })],
      withCeiling,
      dumbbellExercise,
      [previous],
      at,
    )[0]!;
    const noMachine = start(previous, null);
    const strip = (p: typeof plain) => ({
      ...p,
      progression_decision: { ...p.progression_decision!, computed_at: '' },
    });
    expect(plain.target_weight).toBe(85);
    expect(strip(noMachine)).toEqual(strip(plain));
  });

  it('a hold at a load the equipment has comes back exactly as computed', () => {
    const missedTop = priorCompletedSession({ target_weight: 70 }, [10, 10, 10]); // within range, not at the top
    const planned = start(missedTop, rack(everyFive(80)));
    expect(planned.target_weight).toBe(70);
    expect(planned.progression_decision?.previous_result).toBe('held');
    expect(planned.progression_decision?.decision_summary).not.toMatch(/maximum|ceiling|nearest/i);
  });

  it('a target carried over from heavier equipment elsewhere is brought down to the maximum of the machine in use', () => {
    const heavier = priorCompletedSession({ target_weight: 170 }, [10, 10, 10]); // within range: the engine holds at 170
    const planned = start(heavier, maxOnly(120));
    expect(planned.target_weight).toBe(120);
    expect(planned.progression_decision?.previous_result).toBe('held');
    expect(planned.progression_decision?.decision_summary).toMatch(/maximum \(120\)/);
  });

  it('equipment does not start raising a load the policy had no increment for', () => {
    const noIncrement = programWith({ load_increment: null });
    const previous = toppedOutAt(100);
    const planned = applyProgressionToSession(
      [makePlanned({ target_weight: 100 })],
      noIncrement,
      dumbbellExercise,
      [previous],
      '2026-08-08T00:00:00.000Z',
      () => ({ equipment: rack([100, 110, 120]), history: [previous] }),
    )[0]!;
    expect(planned.target_weight).toBe(100);
    expect(planned.progression_decision?.previous_result).toBe('suggest_advance');
  });

  it('progresses from the history it is given: the same machine here, not a heavier one elsewhere', () => {
    const elsewhere = toppedOutAt(80);
    const here = { ...toppedOutAt(60), id: 'here' };
    const planned = start(elsewhere, maxOnly(120), [here]);
    expect(planned.target_weight).toBe(65);
    expect(planned.progression_decision?.previous_session_id).toBe('here');
  });
});
