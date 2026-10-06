import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  setExerciseEquipment,
  startWorkoutSession,
} from '@atlas/workout-engine';
import type { GymEquipmentInstance, WorkoutSession } from '@atlas/data-model';
import { confirmEquipmentMaximum } from './confirmEquipmentMaximum';
import { createGymEquipmentInstance } from './createEquipment';
import { isAtEquipmentMax } from './availableLoads';
import {
  dismissMaximumConfirmation,
  MAX_CONFIRMATION_MIN_SESSIONS,
  maximumConfirmationOffer,
} from './maxConfirmation';

const press = (extra = {}): GymEquipmentInstance =>
  createGymEquipmentInstance({
    trainingLocationId: 'main',
    equipmentDefinitionId: 'd',
    label: 'Chest Press #1',
    ...extra,
  });

/** A completed workout with one set per entry of `weights`, on `instance` unless null. */
function workout(
  weights: number[],
  instance: GymEquipmentInstance | null,
  phase: 'work' | 'warmup' = 'work',
): WorkoutSession {
  let session = startWorkoutSession({
    name: 'W',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
    trainingLocationId: 'main',
  });
  if (instance) session = setExerciseEquipment(session, 'press', instance.id);
  weights.forEach((weight, i) => {
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'press',
        setIndex: i,
        phase,
        setType: 'normal',
        weight,
        reps: 10,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
  });
  return completeWorkoutSession(session);
}

describe('"Is 170 lb the maximum on this machine?"', () => {
  const machine = press();

  it('is offered once the same heaviest load has been reached in enough separate workouts, on a machine with no known maximum', () => {
    const sessions = Array.from({ length: MAX_CONFIRMATION_MIN_SESSIONS }, () =>
      workout([150, 170], machine),
    );
    expect(maximumConfirmationOffer(machine, sessions)).toEqual({
      load: 170,
      sessions: MAX_CONFIRMATION_MIN_SESSIONS,
    });
  });

  it('is not offered after only one or two workouts at the top', () => {
    const sessions = Array.from({ length: MAX_CONFIRMATION_MIN_SESSIONS - 1 }, () =>
      workout([170], machine),
    );
    expect(maximumConfirmationOffer(machine, sessions)).toBeNull();
  });

  it('counts workouts, not sets: five sets at 170 in one workout is not "repeatedly"', () => {
    expect(
      maximumConfirmationOffer(machine, [workout([170, 170, 170, 170, 170], machine)]),
    ).toBeNull();
  });

  it('asks about the heaviest load only: heavy days that have since been exceeded do not add up', () => {
    const sessions = [
      workout([170], machine),
      workout([170], machine),
      workout([180], machine),
      workout([180], machine),
    ];
    expect(maximumConfirmationOffer(machine, sessions)).toBeNull(); // 180 only twice
  });

  it('ignores warm-up sets, other machines, and unfinished workouts', () => {
    const other = press();
    const warmups = Array.from({ length: 3 }, () => workout([170], machine, 'warmup'));
    const elsewhere = Array.from({ length: 3 }, () => workout([170], other));
    const noMachine = Array.from({ length: 3 }, () => workout([170], null));
    const unfinished = Array.from({ length: 3 }, () => ({
      ...workout([170], machine),
      status: 'in_progress' as const,
    }));
    for (const sessions of [warmups, elsewhere, noMachine, unfinished]) {
      expect(maximumConfirmationOffer(machine, sessions)).toBeNull();
    }
  });

  it('is never offered when the equipment already has a maximum or a load list', () => {
    const sessions = Array.from({ length: 4 }, () => workout([170], press()));
    for (const known of [
      press({ maxLoad: 200 }),
      press({ exactLoads: [100, 170] }),
      press({ minLoad: 10, maxLoad: 170, increment: 10 }),
    ]) {
      const onKnown = Array.from({ length: 4 }, () => workout([170], known));
      expect(maximumConfirmationOffer(known, onKnown)).toBeNull();
    }
    expect(sessions).toHaveLength(4);
  });

  it('is never offered for archived equipment', () => {
    const archived = { ...machine, archived_at: '2026-09-01T00:00:00.000Z' };
    const sessions = Array.from({ length: 4 }, () => workout([170], archived));
    expect(maximumConfirmationOffer(archived, sessions)).toBeNull();
  });

  it('is not offered again after "no / not sure" -- and that answer changes nothing else', () => {
    const sessions = Array.from({ length: 4 }, () => workout([170], machine));
    expect(maximumConfirmationOffer(machine, sessions)).not.toBeNull();
    const dismissed = dismissMaximumConfirmation(machine);
    expect(maximumConfirmationOffer(dismissed, sessions)).toBeNull();
    expect(dismissed.max_load).toBeNull();
    expect(dismissed.version).toBe(machine.version + 1);
  });

  it('a "yes" is recorded as the maximum, and progression then respects it', () => {
    const sessions = Array.from({ length: 4 }, () => workout([170], machine));
    const offer = maximumConfirmationOffer(machine, sessions);
    const confirmed = confirmEquipmentMaximum(machine, offer?.load ?? 0);
    expect(isAtEquipmentMax(confirmed, 170)).toBe(true);
    expect(maximumConfirmationOffer(confirmed, sessions)).toBeNull(); // never asked again either
  });

  it('infers nothing on its own: the equipment is unchanged unless the owner answers', () => {
    const sessions = Array.from({ length: 6 }, () => workout([170], machine));
    maximumConfirmationOffer(machine, sessions);
    expect(machine.max_load).toBeNull();
    expect(machine.max_prompt_dismissed_at).toBeUndefined();
  });
});
