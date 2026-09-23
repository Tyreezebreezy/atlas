import { describe, expect, it } from 'vitest';
import { createExerciseEquipmentContext, createGymEquipmentInstance } from './createEquipment';
import { resolveExerciseEquipment } from './resolveExerciseEquipment';

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
