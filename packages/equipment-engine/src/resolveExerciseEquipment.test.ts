import { describe, expect, it } from 'vitest';
import { startWorkoutSession } from '@atlas/workout-engine';
import { createExerciseEquipmentContext, createGymEquipmentInstance } from './createEquipment';
import { effectiveExerciseEquipment, resolveExerciseEquipment } from './resolveExerciseEquipment';
import { setExerciseEquipment } from '@atlas/workout-engine';

describe('resolveExerciseEquipment', () => {
  it('resolves the default equipment configured for an exercise at the active location', () => {
    const chestPress = createGymEquipmentInstance({
      trainingLocationId: 'gym-a',
      equipmentDefinitionId: 'eq-chest-press',
      label: 'Machine Chest Press',
      minLoad: 10,
      maxLoad: 170,
      increment: 10,
    });
    const context = createExerciseEquipmentContext({
      exerciseId: 'ex-chest-press',
      gymEquipmentId: chestPress.id,
      isDefault: true,
    });
    const result = resolveExerciseEquipment('ex-chest-press', [context], [chestPress], 'gym-a');
    expect(result?.id).toBe(chestPress.id);
  });

  it('returns null when no active training location is known -- never guesses', () => {
    const chestPress = createGymEquipmentInstance({
      trainingLocationId: 'gym-a',
      equipmentDefinitionId: 'eq-chest-press',
      label: 'Machine Chest Press',
    });
    const context = createExerciseEquipmentContext({
      exerciseId: 'ex-chest-press',
      gymEquipmentId: chestPress.id,
      isDefault: true,
    });
    expect(resolveExerciseEquipment('ex-chest-press', [context], [chestPress], null)).toBeNull();
  });

  it('returns null when the exercise has no configured equipment at all -- distinct from "at max"', () => {
    expect(resolveExerciseEquipment('ex-unconfigured', [], [], 'gym-a')).toBeNull();
  });

  it('never applies a default configured for a DIFFERENT location -- Gym A and Gym B are different physical machines', () => {
    const gymAPress = createGymEquipmentInstance({
      trainingLocationId: 'gym-a',
      equipmentDefinitionId: 'eq-chest-press',
      label: 'Machine Chest Press',
      maxLoad: 170,
    });
    const context = createExerciseEquipmentContext({
      exerciseId: 'ex-chest-press',
      gymEquipmentId: gymAPress.id,
      isDefault: true,
    });
    // Owner is currently at gym-b, but the only configured default is for gym-a.
    expect(resolveExerciseEquipment('ex-chest-press', [context], [gymAPress], 'gym-b')).toBeNull();
  });

  it('ignores a non-default context for the exercise', () => {
    const chestPress = createGymEquipmentInstance({
      trainingLocationId: 'gym-a',
      equipmentDefinitionId: 'eq-chest-press',
      label: 'Machine Chest Press',
    });
    const nonDefault = createExerciseEquipmentContext({
      exerciseId: 'ex-chest-press',
      gymEquipmentId: chestPress.id,
      isDefault: false,
    });
    expect(resolveExerciseEquipment('ex-chest-press', [nonDefault], [chestPress], 'gym-a')).toBeNull();
  });
});

describe('the same exercise remembered at more than one place (vNext Handoff 04B)', () => {
  const pressAt = (location: string, label: string, extra = {}) =>
    createGymEquipmentInstance({
      trainingLocationId: location,
      equipmentDefinitionId: 'eq-chest-press',
      label,
      ...extra,
    });
  const defaultFor = (instance: { id: string }) =>
    createExerciseEquipmentContext({ exerciseId: 'ex-press', gymEquipmentId: instance.id, isDefault: true });

  it('resolves the machine at the place the owner is, wherever the other defaults sit in the list', () => {
    const main = pressAt('main', 'Chest Press #1', { maxLoad: 170 });
    const hotel = pressAt('hotel', 'Hotel press', { maxLoad: 120 });
    const contexts = [defaultFor(main), defaultFor(hotel)];
    expect(resolveExerciseEquipment('ex-press', contexts, [main, hotel], 'main')?.id).toBe(main.id);
    // Previously this returned null: the first default found belonged to `main`, which is not here.
    expect(resolveExerciseEquipment('ex-press', contexts, [main, hotel], 'hotel')?.id).toBe(hotel.id);
    expect(resolveExerciseEquipment('ex-press', [...contexts].reverse(), [main, hotel], 'main')?.id).toBe(main.id);
  });

  it('two machines at one place: only the one marked default is remembered', () => {
    const one = pressAt('main', 'Chest Press #1');
    const two = pressAt('main', 'Chest Press #2');
    const contexts = [
      createExerciseEquipmentContext({ exerciseId: 'ex-press', gymEquipmentId: one.id, isDefault: false }),
      defaultFor(two),
    ];
    expect(resolveExerciseEquipment('ex-press', contexts, [one, two], 'main')?.id).toBe(two.id);
  });

  it('forgets a machine that has been archived, rather than applying equipment the owner retired', () => {
    const old = { ...pressAt('main', 'Old press'), archived_at: '2026-09-01T00:00:00.000Z' };
    expect(resolveExerciseEquipment('ex-press', [defaultFor(old)], [old], 'main')).toBeNull();
  });

  it('never applies equipment whose loads are in a different unit than the logged history (nothing converts)', () => {
    const kg = pressAt('main', 'Kilo stack', { unit: 'kg', maxLoad: 100 });
    expect(resolveExerciseEquipment('ex-press', [defaultFor(kg)], [kg], 'main')).toBeNull();
  });

  it('a soft-deleted default context or instance is ignored', () => {
    const live = pressAt('main', 'Press');
    const gone = { ...defaultFor(live), deleted_at: '2026-09-01T00:00:00.000Z' };
    expect(resolveExerciseEquipment('ex-press', [gone], [live], 'main')).toBeNull();
    const removed = { ...live, deleted_at: '2026-09-01T00:00:00.000Z' };
    expect(resolveExerciseEquipment('ex-press', [defaultFor(live)], [removed], 'main')).toBeNull();
  });
});

describe('effectiveExerciseEquipment: which machine an exercise is on right now', () => {
  const start = (location: string | null) =>
    startWorkoutSession({ name: 'W', templateId: null, programId: null, programDayId: null, plannedSnapshot: [], trainingLocationId: location });
  const press1 = createGymEquipmentInstance({ trainingLocationId: 'main', equipmentDefinitionId: 'd', label: 'Chest Press #1', maxLoad: 170 });
  const press2 = createGymEquipmentInstance({ trainingLocationId: 'main', equipmentDefinitionId: 'd', label: 'Chest Press #2', maxLoad: 200 });
  const remembered = createExerciseEquipmentContext({ exerciseId: 'ex-press', gymEquipmentId: press1.id, isDefault: true });

  it('uses the remembered machine for this exercise at the workout\'s place, before anything is written to the session', () => {
    const result = effectiveExerciseEquipment(start('main'), 'ex-press', [remembered], [press1, press2]);
    expect(result).toMatchObject({ source: 'remembered' });
    expect(result.instance?.id).toBe(press1.id);
    expect(result.constraints?.id).toBe(press1.id);
  });

  it('a machine chosen for this workout wins over the remembered one', () => {
    const session = setExerciseEquipment(start('main'), 'ex-press', press2.id);
    const result = effectiveExerciseEquipment(session, 'ex-press', [remembered], [press1, press2]);
    expect(result).toMatchObject({ source: 'session' });
    expect(result.instance?.id).toBe(press2.id);
  });

  it('with several machines and nothing remembered or chosen it answers "none" -- it never picks one', () => {
    const result = effectiveExerciseEquipment(start('main'), 'ex-press', [], [press1, press2]);
    expect(result).toEqual({ instance: null, source: 'none', constraints: null });
  });

  it('with no location there is no machine, however much is configured elsewhere', () => {
    expect(effectiveExerciseEquipment(start(null), 'ex-press', [remembered], [press1, press2]).source).toBe('none');
  });

  it('ignores a choice that belongs to another place instead of applying its ceiling here', () => {
    const hotelPress = createGymEquipmentInstance({ trainingLocationId: 'hotel', equipmentDefinitionId: 'd', label: 'Hotel press', maxLoad: 100 });
    const session = setExerciseEquipment(start('main'), 'ex-press', hotelPress.id);
    const result = effectiveExerciseEquipment(session, 'ex-press', [], [press1, press2, hotelPress]);
    expect(result.source).toBe('none');
  });

  it('a chosen machine in another unit is still the machine used, but offers no load constraints', () => {
    const kg = createGymEquipmentInstance({ trainingLocationId: 'main', equipmentDefinitionId: 'd', label: 'Kilo stack', unit: 'kg', maxLoad: 100 });
    const session = setExerciseEquipment(start('main'), 'ex-press', kg.id);
    const result = effectiveExerciseEquipment(session, 'ex-press', [], [kg]);
    expect(result.instance?.id).toBe(kg.id);
    expect(result.constraints).toBeNull();
  });
});
