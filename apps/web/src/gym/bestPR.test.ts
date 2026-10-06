import { describe, expect, it } from 'vitest';
import type { Exercise, PersonalRecord } from '@atlas/data-model';
import { bestPRForExercise } from './bestPR';

const press = { id: 'press', measurement_type: 'reps_weight' } as Exercise;
const record = (id: string, extra: Partial<PersonalRecord>): PersonalRecord =>
  ({
    id,
    exercise_id: 'press',
    kind: 'max_load',
    value: 100,
    training_location_id: null,
    gym_equipment_id: null,
    ...extra,
  }) as PersonalRecord;

describe('bestPRForExercise: BEST is a record, so it belongs to one place and one machine', () => {
  const main1 = record('main-1', {
    value: 130,
    training_location_id: 'main',
    gym_equipment_id: 'press-1',
  });
  const main2 = record('main-2', {
    value: 200,
    training_location_id: 'main',
    gym_equipment_id: 'press-2',
  });
  const old = record('old', {
    value: 95,
    training_location_id: 'old-gym',
    gym_equipment_id: 'old-press',
  });
  const legacy = record('legacy', { value: 155 });
  const all = [old, main2, main1, legacy];

  it('shows the record of this machine at this place, whatever order the records come in', () => {
    expect(
      bestPRForExercise(all, press, { training_location_id: 'main', gym_equipment_id: 'press-1' })
        ?.id,
    ).toBe('main-1');
    expect(
      bestPRForExercise([...all].reverse(), press, {
        training_location_id: 'main',
        gym_equipment_id: 'press-1',
      })?.id,
    ).toBe('main-1');
    expect(
      bestPRForExercise(all, press, { training_location_id: 'main', gym_equipment_id: 'press-2' })
        ?.id,
    ).toBe('main-2');
  });

  it("never borrows another machine's or another gym's record: a first time on a machine has no best", () => {
    expect(
      bestPRForExercise(all, press, { training_location_id: 'main', gym_equipment_id: 'press-3' }),
    ).toBeNull();
    expect(
      bestPRForExercise(all, press, {
        training_location_id: 'hotel',
        gym_equipment_id: 'hotel-press',
      }),
    ).toBeNull();
    // same machine id at a different place is a different series
    expect(
      bestPRForExercise(all, press, { training_location_id: 'hotel', gym_equipment_id: 'press-1' }),
    ).toBeNull();
  });

  it('old history with no place and no machine is its own context', () => {
    expect(bestPRForExercise(all, press, {})?.id).toBe('legacy');
    expect(
      bestPRForExercise(all, press, { training_location_id: null, gym_equipment_id: null })?.id,
    ).toBe('legacy');
  });

  it('is the headline kind for the exercise, not any record that happens to be in the context', () => {
    const e1rm = record('e1rm', {
      kind: 'estimated_1rm',
      training_location_id: 'main',
      gym_equipment_id: 'press-1',
      value: 999,
    });
    expect(
      bestPRForExercise([e1rm, main1], press, {
        training_location_id: 'main',
        gym_equipment_id: 'press-1',
      })?.id,
    ).toBe('main-1');
  });
});
