import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  changeSessionLocation,
  completeWorkoutSession,
  createPerformedSet,
  setExerciseEquipment,
  startWorkoutSession,
} from '@atlas/workout-engine';
import {
  calculatePRs,
  derivePREventsForExercise,
  performanceContextKey,
  performanceContextOf,
  personalRecordEventId,
} from '@atlas/pr-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { strengthContexts } from './strengthView';

/**
 * vNext Handoff 04B. The point of locking a workout's place and an exercise's
 * machine once sets are logged: what PRs, headline events and the Strength view
 * report must stay attached to the place and machine the sets were REALLY done on.
 * Each workout below tries to move itself to another gym and another machine after
 * its first set; every attempt is refused, and everything derived afterwards still
 * says Main Gym / Chest Press #1.
 */

const press: Exercise = {
  id: 'press',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
  device_id: 'seed',
  deleted_at: null,
  name: 'Machine Chest Press',
  aliases: [],
  category: null,
  equipment: ['leverage machine'],
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
};

const instances = [
  { id: 'press-1', training_location_id: 'main' },
  { id: 'press-2', training_location_id: 'main' },
  { id: 'hotel-press', training_location_id: 'hotel' },
];

function logSet(session: WorkoutSession, weight: number, at: string): WorkoutSession {
  const set = createPerformedSet({
    exerciseId: 'press',
    setIndex: session.performed_sets.length,
    phase: 'work',
    setType: 'normal',
    weight,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    rir: null,
    notes: null,
  });
  return addPerformedSet(session, { ...set, completed_at: at });
}

/** A Main Gym workout on Chest Press #1 that tries to relocate itself, and switch machines, after its first set. */
function workoutThatTriesToMove(day: number, weight: number): WorkoutSession {
  const at = `2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z`;
  let session = startWorkoutSession({
    name: 'Upper',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
    trainingLocationId: 'main',
  });
  session = setExerciseEquipment(session, 'press', 'press-1');
  session = logSet(session, weight, at);

  // The owner moves to the hotel, then to another machine, then nowhere -- all refused.
  session = changeSessionLocation(session, 'hotel', instances);
  session = setExerciseEquipment(session, 'press', 'press-2');
  session = setExerciseEquipment(session, 'press', 'hotel-press');
  session = changeSessionLocation(session, null, instances);

  session = logSet(session, weight, at);
  return {
    ...completeWorkoutSession(session),
    completed_at: at,
    performed_local_date: at.slice(0, 10),
  };
}

const MAIN_PRESS_1 = { training_location_id: 'main', gym_equipment_id: 'press-1' };

describe('refused context changes cannot move history', () => {
  const first = workoutThatTriesToMove(1, 100);
  const second = workoutThatTriesToMove(8, 110);
  const history = [first, second];

  it('each workout still records Main Gym and Chest Press #1', () => {
    for (const session of history) {
      expect(performanceContextOf(session, 'press')).toEqual(MAIN_PRESS_1);
      expect(session.training_location_id).toBe('main');
    }
  });

  it('every personal record is attached to the original place and machine -- none to the hotel, another machine, or nowhere', () => {
    const records = calculatePRs(history, press);
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect({
        training_location_id: record.training_location_id,
        gym_equipment_id: record.gym_equipment_id,
      }).toEqual(MAIN_PRESS_1);
    }
  });

  it('the headline PR event is in the original context, under the id that names it', () => {
    const events = derivePREventsForExercise(history, press);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ session_id: second.id, ...MAIN_PRESS_1 });
    expect(personalRecordEventId(second.id, 'press', 'main', 'press-1')).toBe(
      `pr-event:${second.id}:press:main:press-1`,
    );
  });

  it('the Strength view lists exactly one context -- Chest Press #1 at Main Gym -- holding both workouts', () => {
    const contexts = strengthContexts(history, press);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      ...MAIN_PRESS_1,
      key: performanceContextKey(MAIN_PRESS_1),
      session_count: 2,
    });
  });

  it('control: a machine changed BEFORE the first set is honored, so these checks would catch a relabel', () => {
    const at = '2026-08-15T10:00:00.000Z';
    let session = startWorkoutSession({
      name: 'Upper',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
      trainingLocationId: 'main',
    });
    session = setExerciseEquipment(session, 'press', 'press-1');
    session = setExerciseEquipment(session, 'press', 'press-2'); // allowed: nothing logged yet
    session = logSet(session, 120, at);
    const done = {
      ...completeWorkoutSession(session),
      completed_at: at,
      performed_local_date: '2026-08-15',
    };

    expect(performanceContextOf(done, 'press')).toEqual({
      training_location_id: 'main',
      gym_equipment_id: 'press-2',
    });
    expect(
      strengthContexts([...history, done], press)
        .map((c) => c.gym_equipment_id)
        .sort(),
    ).toEqual(['press-1', 'press-2']);
  });
});
