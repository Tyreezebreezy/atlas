import { describe, expect, it } from 'vitest';
import { createExerciseEquipmentContext, createGymEquipmentInstance } from './createEquipment';
import { planRememberedMapping } from './mapping';

const at = (location: string, label: string) =>
  createGymEquipmentInstance({ trainingLocationId: location, equipmentDefinitionId: 'd', label });

describe('planRememberedMapping', () => {
  const one = at('main', 'Chest Press #1');
  const two = at('main', 'Chest Press #2');
  const hotel = at('hotel', 'Hotel press');
  const everything = [one, two, hotel];

  it('remembers a first choice as the default for that exercise at that place', () => {
    const [created, ...rest] = planRememberedMapping('press', one, [], everything);
    expect(rest).toEqual([]);
    expect(created).toMatchObject({
      exercise_id: 'press',
      gym_equipment_id: one.id,
      is_default: true,
    });
  });

  it('choosing another machine at the same place moves the default: there is one per exercise per place', () => {
    const first = createExerciseEquipmentContext({
      exerciseId: 'press',
      gymEquipmentId: one.id,
      isDefault: true,
    });
    const plan = planRememberedMapping('press', two, [first], everything);
    expect(plan).toHaveLength(2);
    const demoted = plan.find((c) => c.id === first.id);
    expect(demoted).toMatchObject({ is_default: false, version: first.version + 1 });
    expect(plan.find((c) => c.gym_equipment_id === two.id)).toMatchObject({ is_default: true });
  });

  it('reuses an existing row for a machine chosen before instead of adding a duplicate', () => {
    const before = createExerciseEquipmentContext({
      exerciseId: 'press',
      gymEquipmentId: two.id,
      isDefault: false,
    });
    const current = createExerciseEquipmentContext({
      exerciseId: 'press',
      gymEquipmentId: one.id,
      isDefault: true,
    });
    const plan = planRememberedMapping('press', two, [before, current], everything);
    expect(plan.map((c) => [c.gym_equipment_id, c.is_default]).sort()).toEqual(
      [
        [one.id, false],
        [two.id, true],
      ].sort(),
    );
    expect(plan.find((c) => c.id === before.id)).toBeTruthy(); // updated in place, not re-created
  });

  it('a mapping at another place is independent: remembering here never disturbs it', () => {
    const atHotel = createExerciseEquipmentContext({
      exerciseId: 'press',
      gymEquipmentId: hotel.id,
      isDefault: true,
    });
    const plan = planRememberedMapping('press', one, [atHotel], everything);
    expect(plan.some((c) => c.id === atHotel.id)).toBe(false);
    expect(plan).toHaveLength(1);
  });

  it('another exercise on the same machine is untouched', () => {
    const rowOnOne = createExerciseEquipmentContext({
      exerciseId: 'row',
      gymEquipmentId: one.id,
      isDefault: true,
    });
    const plan = planRememberedMapping('press', one, [rowOnOne], everything);
    expect(plan.some((c) => c.id === rowOnOne.id)).toBe(false);
  });

  it('writes nothing when the machine is already the default', () => {
    const current = createExerciseEquipmentContext({
      exerciseId: 'press',
      gymEquipmentId: one.id,
      isDefault: true,
    });
    expect(planRememberedMapping('press', one, [current], everything)).toEqual([]);
  });
});
