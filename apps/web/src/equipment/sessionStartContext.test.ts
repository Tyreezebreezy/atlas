import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  setExerciseEquipment,
  startWorkoutSession,
} from '@atlas/workout-engine';
import { applyProgressionToSession } from '@atlas/program-engine';
import {
  createExerciseEquipmentContext,
  createGymEquipmentInstance,
} from '@atlas/equipment-engine';
import type { Exercise, PlannedExercise, Program, WorkoutSession } from '@atlas/data-model';
import { restampUntouchedTargets, startContextFor } from './sessionStartContext';

function exercise(id: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: id,
    aliases: [],
    category: null,
    equipment: ['dumbbell'],
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

function planned(exerciseId: string, weight: number): PlannedExercise {
  return {
    id: `pe-${exerciseId}`,
    exercise_id: exerciseId,
    order: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 15,
    target_weight: weight,
    target_external_load: null,
    target_rpe: null,
    target_rir: null,
    target_duration_seconds: null,
    target_distance_meters: null,
    rest_seconds: null,
    notes: null,
    group_id: null,
  };
}

const program: Pick<Program, 'default_progression_policy'> = {
  default_progression_policy: {
    kind: 'double_progression',
    load_increment: 5,
    duration_increment_seconds: null,
    duration_ceiling_seconds: null,
    ceiling_reps_max: 20,
  },
};

const exercisesById = new Map([
  ['db', exercise('db')],
  ['press', exercise('press', { equipment: ['barbell'] })],
]);

/** A finished workout where every set hit the top of the 8-15 range at `load`, on the machine `machineId` at `locationId`. */
function finishedAt(
  load: number,
  locationId: string | null,
  machineId: string | null,
  day: number,
  id: string,
): WorkoutSession {
  let session = startWorkoutSession({
    name: 'Upper',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [planned('db', load), planned('press', 100)],
    trainingLocationId: locationId,
  });
  // The machine is picked BEFORE the first set: once a set is logged an exercise's machine is fixed.
  if (machineId) session = setExerciseEquipment(session, 'db', machineId);
  for (const exerciseId of ['db', 'press']) {
    for (let i = 0; i < 3; i += 1) {
      session = addPerformedSet(
        session,
        createPerformedSet({
          exerciseId,
          setIndex: i,
          setType: 'normal',
          weight: exerciseId === 'db' ? load : 100,
          reps: 15,
          durationSeconds: null,
          distanceMeters: null,
          rpe: null,
          rir: null,
          notes: null,
        }),
      );
    }
  }
  const at = `2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z`;
  return { ...completeWorkoutSession(session), id, completed_at: at, started_at: at };
}

const rack = (location: string, max: number) =>
  createGymEquipmentInstance({
    trainingLocationId: location,
    equipmentDefinitionId: 'eq-db',
    label: `${location} dumbbells`,
    maxLoad: max,
  });

describe('startContextFor', () => {
  it('uses the machine remembered for the exercise at the place, and the history on that machine', () => {
    const main = rack('main', 80);
    const remembered = createExerciseEquipmentContext({
      exerciseId: 'db',
      gymEquipmentId: main.id,
      isDefault: true,
    });
    const onMain = finishedAt(80, 'main', main.id, 1, 'on-main');
    const elsewhere = finishedAt(60, 'hotel', null, 2, 'elsewhere');

    const start = startContextFor(
      { training_location_id: 'main', exercise_equipment: [] },
      { contexts: [remembered], instances: [main] },
      [onMain, elsewhere],
    )('db');
    expect(start.equipment?.id).toBe(main.id);
    expect(start.history.map((s) => s.id)).toEqual(['on-main']);
  });

  it('with no machine known it constrains nothing and offers all the history', () => {
    const history = [finishedAt(80, 'hotel', null, 1, 'a'), finishedAt(60, 'home', null, 2, 'b')]; // nothing yet done at 'main': fall back to all
    const start = startContextFor(
      { training_location_id: 'main', exercise_equipment: [] },
      { contexts: [], instances: [] },
      history,
    )('db');
    expect(start.equipment).toBeNull();
    expect(start.history).toHaveLength(2);
  });
});

describe('restampUntouchedTargets', () => {
  const previous = finishedAt(80, 'main', null, 1, 'previous');

  /** A workout started before any machine was known: the unconstrained target, as the old Today wrote it. */
  function startedUnconstrained(locationId: string | null = 'main'): WorkoutSession {
    const stamped = applyProgressionToSession(
      [planned('db', 80), planned('press', 100)],
      program,
      exercisesById,
      [previous],
      '2026-08-08T00:00:00.000Z',
    );
    return startWorkoutSession({
      name: 'Upper',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: stamped,
      trainingLocationId: locationId,
    });
  }
  const inputs = (
    instances: ReturnType<typeof rack>[],
    contexts = [] as ReturnType<typeof createExerciseEquipmentContext>[],
  ) => ({
    program,
    exercisesById,
    history: [previous],
    instances,
    contexts,
  });
  const targetOf = (session: WorkoutSession, exerciseId: string) =>
    session.planned_snapshot.find((p) => p.exercise_id === exerciseId)?.target_weight;

  it("a machine chosen after the workout started brings that exercise's target down to what it can load", () => {
    const session = startedUnconstrained();
    expect(targetOf(session, 'db')).toBe(85); // the unconstrained advance
    const main = rack('main', 80);
    const chosen = setExerciseEquipment(session, 'db', main.id);

    const restamped = restampUntouchedTargets(chosen, inputs([main]), 'db');
    expect(targetOf(restamped, 'db')).toBe(80);
    expect(
      restamped.planned_snapshot.find((p) => p.exercise_id === 'db')?.progression_decision
        ?.decision_summary,
    ).toMatch(/maximum|ceiling/i);
    expect(targetOf(restamped, 'press')).toBe(targetOf(session, 'press')); // `only` left the other exercise alone
  });

  it('an exercise with a logged set keeps the target it was done against', () => {
    const main = rack('main', 80);
    let session = setExerciseEquipment(startedUnconstrained(), 'db', main.id);
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'db',
        setIndex: 0,
        setType: 'normal',
        weight: 80,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
    expect(restampUntouchedTargets(session, inputs([main]), 'db')).toBe(session);
    expect(targetOf(session, 'db')).toBe(85);
  });

  it('an exercise swapped in during the workout (no progression decision) is never given a progression target', () => {
    const main = rack('main', 80);
    const session = setExerciseEquipment(startedUnconstrained(), 'db', main.id);
    const withoutDecision = {
      ...session,
      planned_snapshot: session.planned_snapshot.map((p) => ({
        ...p,
        progression_decision: undefined,
      })),
    };
    expect(restampUntouchedTargets(withoutDecision, inputs([main]))).toBe(withoutDecision);
  });

  it('moving to another place re-targets every untouched exercise for the machines remembered there', () => {
    const main = rack('main', 80);
    const hotel = rack('hotel', 120);
    const contexts = [
      createExerciseEquipmentContext({
        exerciseId: 'db',
        gymEquipmentId: main.id,
        isDefault: true,
      }),
      createExerciseEquipmentContext({
        exerciseId: 'db',
        gymEquipmentId: hotel.id,
        isDefault: true,
      }),
    ];
    const atMain = restampUntouchedTargets(
      startedUnconstrained('main'),
      inputs([main, hotel], contexts),
    );
    expect(targetOf(atMain, 'db')).toBe(80);

    const atHotel = restampUntouchedTargets(
      { ...atMain, training_location_id: 'hotel' },
      inputs([main, hotel], contexts),
    );
    expect(targetOf(atHotel, 'db')).toBe(85); // the Hotel's 120 lb rack has room to advance

    const nowhere = restampUntouchedTargets(
      { ...atHotel, training_location_id: null },
      inputs([main, hotel], contexts),
    );
    expect(targetOf(nowhere, 'db')).toBe(85); // no place, no machine: the plan as the engine computes it
  });

  it('with nothing eligible it returns the very same session', () => {
    const session = startedUnconstrained();
    expect(restampUntouchedTargets(session, inputs([]), 'nothing-by-this-id')).toBe(session);
  });
});
