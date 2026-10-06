import { describe, expect, it } from 'vitest';
import { localIsoDate } from '@atlas/core';
import type { WorkoutSession } from '@atlas/data-model';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  removePerformedSet,
  startWorkoutSession,
  type StartSessionInput,
} from './session';
import {
  changeSessionLocation,
  exerciseEquipmentIdOf,
  hasLoggedSets,
  isExerciseEquipmentLocked,
  isLocationLocked,
  locationChangeImpact,
  setExerciseEquipment,
} from './sessionContext';

function start(overrides: Partial<StartSessionInput> = {}): WorkoutSession {
  return startWorkoutSession({
    name: 'Upper A',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
    ...overrides,
  });
}

function logSet(
  session: WorkoutSession,
  exerciseId: string,
  phase: 'work' | 'warmup' = 'work',
): WorkoutSession {
  return addPerformedSet(
    session,
    createPerformedSet({
      exerciseId,
      setIndex: session.performed_sets.length,
      phase,
      setType: 'normal',
      weight: 100,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
    }),
  );
}

const instances = [
  { id: 'press-1', training_location_id: 'main' },
  { id: 'press-2', training_location_id: 'main' },
  { id: 'hotel-press', training_location_id: 'hotel' },
];

describe('startWorkoutSession: location and local-time capture', () => {
  it('stores the selected location -- planned and freestyle sessions alike go through this one entry point', () => {
    expect(start({ trainingLocationId: 'main' }).training_location_id).toBe('main');
    expect(
      start({ name: 'Freestyle Workout', trainingLocationId: 'home' }).training_location_id,
    ).toBe('home');
  });

  it('starts with a null location when none is chosen -- starting never requires one', () => {
    expect(start().training_location_id).toBeNull();
    expect(start({ trainingLocationId: null }).training_location_id).toBeNull();
  });

  it('a live session records the device date, zone and offset at the moment it started', () => {
    const before = localIsoDate();
    const session = start();
    const after = localIsoDate();
    expect([before, after]).toContain(session.performed_local_date);
    expect(session.time_zone_id).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(typeof session.utc_offset_minutes).toBe('number');
  });

  it('a Log Past Workout entry counts toward the day the owner picked, and invents no zone', () => {
    const session = start({
      startedAt: '2026-08-01T16:00:00.000Z',
      plannedCompletedAt: '2026-08-01T17:00:00.000Z',
      performedLocalDate: '2026-08-01',
    });
    expect(session.performed_local_date).toBe('2026-08-01');
    expect(session.time_zone_id).toBeNull();
    expect(session.utc_offset_minutes).toBeNull();
  });

  it('a backdated start with no explicit day takes it from the start instant, still with no invented zone', () => {
    const noon = new Date(2026, 7, 1, 12, 0); // wall-clock noon, so the same day in any zone
    const session = start({ startedAt: noon.toISOString() });
    expect(session.performed_local_date).toBe('2026-08-01');
    expect(session.time_zone_id).toBeNull();
  });

  it("does not change a completed session's recorded day when it is finished later", () => {
    const session = start({
      performedLocalDate: '2026-08-01',
      startedAt: '2026-08-01T16:00:00.000Z',
    });
    expect(completeWorkoutSession(session).performed_local_date).toBe('2026-08-01');
  });
});

describe('exercise equipment on a session', () => {
  it('records the machine an exercise was done on, one entry per exercise', () => {
    let session = start({ trainingLocationId: 'main' });
    session = setExerciseEquipment(session, 'press', 'press-1');
    session = setExerciseEquipment(session, 'row', 'press-2');
    expect(exerciseEquipmentIdOf(session, 'press')).toBe('press-1');
    expect(exerciseEquipmentIdOf(session, 'row')).toBe('press-2');
    expect(exerciseEquipmentIdOf(session, 'squat')).toBeNull();
  });

  it("choosing again replaces the exercise's machine rather than adding a second", () => {
    let session = setExerciseEquipment(start(), 'press', 'press-1');
    session = setExerciseEquipment(session, 'press', 'press-2');
    expect(session.exercise_equipment).toEqual([
      { exercise_id: 'press', gym_equipment_id: 'press-2' },
    ]);
  });

  it('clearing with null removes only that exercise', () => {
    let session = setExerciseEquipment(start(), 'press', 'press-1');
    session = setExerciseEquipment(session, 'row', 'press-2');
    session = setExerciseEquipment(session, 'press', null);
    expect(session.exercise_equipment).toEqual([
      { exercise_id: 'row', gym_equipment_id: 'press-2' },
    ]);
  });

  it('returns the same object when nothing changes, so the caller can skip the write', () => {
    const session = setExerciseEquipment(start(), 'press', 'press-1');
    expect(setExerciseEquipment(session, 'press', 'press-1')).toBe(session);
    const bare = start();
    expect(setExerciseEquipment(bare, 'press', null)).toBe(bare);
  });

  it('does not mutate the session it was given', () => {
    const session = start();
    setExerciseEquipment(session, 'press', 'press-1');
    expect(session.exercise_equipment).toBeUndefined();
  });
});

describe('what locks a workout', () => {
  it('any logged set -- a warm-up included -- is a logged set', () => {
    let session = start();
    expect(hasLoggedSets(session)).toBe(false);
    session = logSet(session, 'press', 'warmup');
    expect(hasLoggedSets(session)).toBe(true);
  });

  it('the place locks on the first logged set of any exercise, and not before', () => {
    let session = start({ trainingLocationId: 'main' });
    expect(isLocationLocked(session)).toBe(false);
    session = logSet(session, 'row', 'work');
    expect(isLocationLocked(session)).toBe(true);
  });

  it("a machine locks on the first logged set of THAT exercise; another exercise's sets do not lock it", () => {
    const session = logSet(start({ trainingLocationId: 'main' }), 'row', 'work');
    expect(isExerciseEquipmentLocked(session, 'row')).toBe(true);
    expect(isExerciseEquipmentLocked(session, 'press')).toBe(false);
  });

  it('a finished workout is locked entirely, whether or not it has sets', () => {
    const finished = completeWorkoutSession(start({ trainingLocationId: 'main' }));
    expect(isLocationLocked(finished)).toBe(true);
    expect(isExerciseEquipmentLocked(finished, 'press')).toBe(true);
  });

  it('the lock follows the data: with no set left logged there is nothing to relabel', () => {
    const logged = logSet(start({ trainingLocationId: 'main' }), 'press');
    const [only] = logged.performed_sets;
    const emptied = removePerformedSet(logged, only!.id);
    expect(isLocationLocked(emptied)).toBe(false);
    expect(isExerciseEquipmentLocked(emptied, 'press')).toBe(false);
  });
});

describe('changing the location of a workout in progress', () => {
  it('is free before any set is logged and before any machine is chosen', () => {
    const session = start({ trainingLocationId: 'main' });
    expect(locationChangeImpact(session, 'hotel', instances)).toEqual({
      blocked: false,
      needsConfirmation: false,
      clearedEquipment: 0,
    });
    expect(changeSessionLocation(session, 'hotel', instances).training_location_id).toBe('hotel');
    expect(changeSessionLocation(session, null, instances).training_location_id).toBeNull();
  });

  it('needs confirmation, before any set, once a machine has been chosen -- and then clears it', () => {
    const session = setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'press-1');
    const impact = locationChangeImpact(session, 'hotel', instances);
    expect(impact).toEqual({ blocked: false, needsConfirmation: true, clearedEquipment: 1 });
  });

  it('clears machine choices that belong to the old location -- no mapping stays silently active', () => {
    let session = start({ trainingLocationId: 'main' });
    session = setExerciseEquipment(session, 'press', 'press-1');
    session = setExerciseEquipment(session, 'row', 'press-2');
    const moved = changeSessionLocation(session, 'hotel', instances);
    expect(moved.training_location_id).toBe('hotel');
    expect(moved.exercise_equipment).toEqual([]);
    expect(exerciseEquipmentIdOf(moved, 'press')).toBeNull();
  });

  it('never substitutes a look-alike machine at the new location', () => {
    const session = setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'press-1');
    const moved = changeSessionLocation(session, 'hotel', instances);
    // The hotel has a chest press too -- it is not assumed to be the same one.
    expect(exerciseEquipmentIdOf(moved, 'press')).not.toBe('hotel-press');
    expect(exerciseEquipmentIdOf(moved, 'press')).toBeNull();
  });

  it('moving to no location clears every machine choice', () => {
    const session = setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'press-1');
    const moved = changeSessionLocation(session, null, instances);
    expect(moved.training_location_id).toBeNull();
    expect(moved.exercise_equipment).toEqual([]);
  });

  it('a machine that is already at the new location is kept', () => {
    const session = setExerciseEquipment(
      start({ trainingLocationId: null }),
      'press',
      'hotel-press',
    );
    const moved = changeSessionLocation(session, 'hotel', instances);
    expect(exerciseEquipmentIdOf(moved, 'press')).toBe('hotel-press');
  });

  it('is a no-op (same object, no confirmation) when the location does not actually change', () => {
    const session = logSet(start({ trainingLocationId: 'main' }), 'press');
    expect(changeSessionLocation(session, 'main', instances)).toBe(session);
    expect(locationChangeImpact(session, 'main', instances)).toEqual({
      blocked: false,
      needsConfirmation: false,
      clearedEquipment: 0,
    });
  });

  it('an unknown machine id (instance since removed) counts as belonging nowhere and is cleared', () => {
    const session = setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'gone');
    expect(changeSessionLocation(session, 'main', instances)).toBe(session); // same place: nothing to re-home
    expect(changeSessionLocation(session, 'hotel', instances).exercise_equipment).toEqual([]);
  });
});

describe('the location is fixed once a set is logged', () => {
  /** Two machines chosen, one set logged on the first: the state the lock exists to protect. */
  function withLoggedSet(phase: 'work' | 'warmup' = 'work'): WorkoutSession {
    let session = start({ trainingLocationId: 'main' });
    session = setExerciseEquipment(session, 'press', 'press-1');
    session = setExerciseEquipment(session, 'row', 'press-2');
    return logSet(session, 'press', phase);
  }

  it.each(['work', 'warmup'] as const)(
    'refuses a change after a first %s set, and says why',
    (phase) => {
      const session = withLoggedSet(phase);
      expect(locationChangeImpact(session, 'hotel', instances)).toEqual({
        blocked: true,
        needsConfirmation: false,
        clearedEquipment: 0,
      });
      expect(locationChangeImpact(session, null, instances).blocked).toBe(true);
      expect(changeSessionLocation(session, 'hotel', instances)).toBe(session);
    },
  );

  it('a refused change leaves the location and EVERY machine mapping exactly as they were -- same object, nothing touched', () => {
    const session = withLoggedSet();
    const before = structuredClone(session);
    for (const target of ['hotel', null, 'home'] as const) {
      const result = changeSessionLocation(session, target, instances);
      expect(result).toBe(session);
      expect(result.training_location_id).toBe('main');
      expect(result.exercise_equipment).toEqual([
        { exercise_id: 'press', gym_equipment_id: 'press-1' },
        { exercise_id: 'row', gym_equipment_id: 'press-2' },
      ]);
      expect(result.version).toBe(before.version);
      expect(result.updated_at).toBe(before.updated_at);
    }
    expect(session).toEqual(before); // nothing mutated in place either
  });

  it('the logged sets stay with the location they were logged at, and keep their machine', () => {
    const session = withLoggedSet();
    const after = changeSessionLocation(session, 'hotel', instances);
    expect(after.performed_sets).toEqual(session.performed_sets);
    expect(exerciseEquipmentIdOf(after, 'press')).toBe('press-1');
    expect(after.training_location_id).toBe('main');
  });

  it('a workout with no location is just as fixed: a place cannot be assigned to sets already logged', () => {
    const session = logSet(start({ trainingLocationId: null }), 'press');
    expect(changeSessionLocation(session, 'hotel', instances)).toBe(session);
    expect(session.training_location_id).toBeNull();
  });

  it('a finished workout is never re-homed', () => {
    const finished = completeWorkoutSession(start({ trainingLocationId: 'main' }));
    expect(changeSessionLocation(finished, 'hotel', instances)).toBe(finished);
  });
});

describe("an exercise's machine", () => {
  it("can change freely before that exercise's first set", () => {
    let session = start({ trainingLocationId: 'main' });
    session = setExerciseEquipment(session, 'press', 'press-1');
    session = setExerciseEquipment(session, 'press', 'press-2');
    expect(exerciseEquipmentIdOf(session, 'press')).toBe('press-2');
    session = setExerciseEquipment(session, 'press', null);
    expect(exerciseEquipmentIdOf(session, 'press')).toBeNull();
  });

  it('can still change when only OTHER exercises have sets', () => {
    let session = setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'press-1');
    session = logSet(session, 'row', 'work');
    session = setExerciseEquipment(session, 'press', 'press-2');
    expect(exerciseEquipmentIdOf(session, 'press')).toBe('press-2');
  });

  it.each(['work', 'warmup'] as const)(
    "cannot change after that exercise's first %s set",
    (phase) => {
      let session = setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'press-1');
      session = logSet(session, 'press', phase);
      expect(setExerciseEquipment(session, 'press', 'press-2')).toBe(session);
      expect(exerciseEquipmentIdOf(session, 'press')).toBe('press-1');
    },
  );

  it('cannot be cleared, and cannot be assigned for the first time, once a set is logged without one', () => {
    const picked = logSet(
      setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'press-1'),
      'press',
    );
    expect(setExerciseEquipment(picked, 'press', null)).toBe(picked);

    const unrecorded = logSet(start({ trainingLocationId: 'main' }), 'press');
    expect(setExerciseEquipment(unrecorded, 'press', 'press-1')).toBe(unrecorded);
    expect(exerciseEquipmentIdOf(unrecorded, 'press')).toBeNull(); // set 1 is not relabeled after the fact
  });

  it('a refused change leaves the performance context logged so far untouched -- same object, nothing moved', () => {
    let session = setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'press-1');
    session = logSet(logSet(session, 'press', 'work'), 'press', 'work');
    const before = structuredClone(session);

    const result = setExerciseEquipment(session, 'press', 'press-2');
    expect(result).toBe(session);
    expect(result.performed_sets).toEqual(before.performed_sets);
    expect(result.exercise_equipment).toEqual([
      { exercise_id: 'press', gym_equipment_id: 'press-1' },
    ]);
    expect(result.version).toBe(before.version);
    expect(result.updated_at).toBe(before.updated_at);
    expect(session).toEqual(before);
  });

  it("does not lock another exercise's machine: each exercise keeps its own", () => {
    let session = start({ trainingLocationId: 'main' });
    session = setExerciseEquipment(session, 'press', 'press-1');
    session = logSet(session, 'press', 'work');
    session = setExerciseEquipment(session, 'row', 'press-2');
    expect(exerciseEquipmentIdOf(session, 'row')).toBe('press-2');
    expect(exerciseEquipmentIdOf(session, 'press')).toBe('press-1');
  });

  it("a finished workout's machines are never rewritten", () => {
    const finished = completeWorkoutSession(
      setExerciseEquipment(start({ trainingLocationId: 'main' }), 'press', 'press-1'),
    );
    expect(setExerciseEquipment(finished, 'press', 'press-2')).toBe(finished);
  });
});
