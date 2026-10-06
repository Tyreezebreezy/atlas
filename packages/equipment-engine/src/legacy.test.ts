import { describe, expect, it } from 'vitest';
import type { EquipmentDefinition, TrainingLocation } from '@atlas/data-model';
import { availableEquipmentForLocation, equipmentUnavailable } from './availability';
import { createEquipmentDefinition, createGymEquipmentInstance } from './createEquipment';
import {
  EQUIPMENT_TYPES,
  equipmentTypeFromText,
  equipmentTypeName,
  findOrCreateEquipmentDefinition,
  matchesExerciseEquipment,
  OTHER_EQUIPMENT_TYPE,
} from './equipmentTypes';
import { instanceCoveringLegacyItem, legacyEquipmentToConfigure, legacyItemDraft } from './legacy';
import { createTrainingLocation } from './locations';

const location = (equipment: string[]): TrainingLocation => ({
  ...createTrainingLocation({ name: 'Main Gym' }),
  equipment,
});
const dumbbellDef = createEquipmentDefinition({ type: 'dumbbell', name: 'Dumbbells' });
const defs: EquipmentDefinition[] = [dumbbellDef];

describe('legacy equipment strings stay readable and reconcile one item at a time', () => {
  it('lists every legacy name that has no structured instance, exactly as stored', () => {
    const main = location(['Chest press', 'Dumbbells', 'Cable machine']);
    expect(legacyEquipmentToConfigure(main, [], defs)).toEqual([
      'Chest press',
      'Dumbbells',
      'Cable machine',
    ]);
    expect(main.equipment).toEqual(['Chest press', 'Dumbbells', 'Cable machine']); // untouched
  });

  it('configuring one item removes only that item from the list -- no duplicates are offered again', () => {
    const main = location(['Chest press', 'Dumbbells', 'Cable machine']);
    const press = createGymEquipmentInstance({
      trainingLocationId: main.id,
      equipmentDefinitionId: 'd-other',
      label: 'Chest Press #1',
      legacyEquipment: 'Chest press',
    });
    expect(legacyEquipmentToConfigure(main, [press], defs)).toEqual(['Dumbbells', 'Cable machine']);
    // asking again changes nothing: the item stays accounted for
    expect(legacyEquipmentToConfigure(main, [press], defs)).toEqual(['Dumbbells', 'Cable machine']);
  });

  it('finds the instance that already covers an item, so configuring it twice returns the first', () => {
    const main = location(['Chest press']);
    const press = createGymEquipmentInstance({
      trainingLocationId: main.id,
      equipmentDefinitionId: 'd',
      label: 'Chest Press #1',
      legacyEquipment: 'chest press',
    });
    expect(instanceCoveringLegacyItem(main.id, 'Chest press', [press], defs)).toBe(press);
    expect(
      instanceCoveringLegacyItem('another-place', 'Chest press', [press], defs),
    ).toBeUndefined();
  });

  it('an item added directly as equipment of that kind also counts as configured', () => {
    const main = location(['dumbbell']);
    const rack = createGymEquipmentInstance({
      trainingLocationId: main.id,
      equipmentDefinitionId: dumbbellDef.id,
      label: 'Rack',
    });
    expect(legacyEquipmentToConfigure(main, [rack], defs)).toEqual([]);
  });

  it('an archived instance still counts as handled: the owner dealt with the item already', () => {
    const main = location(['Chest press']);
    const archived = {
      ...createGymEquipmentInstance({
        trainingLocationId: main.id,
        equipmentDefinitionId: 'd',
        label: 'x',
        legacyEquipment: 'Chest press',
      }),
      archived_at: '2026-09-01T00:00:00.000Z',
    };
    expect(legacyEquipmentToConfigure(main, [archived], defs)).toEqual([]);
  });

  it('collapses repeats that differ only by case or a plural, and skips blanks', () => {
    const main = location(['Dumbbell', 'dumbbells', '  ', 'Barbell']);
    expect(legacyEquipmentToConfigure(main, [], defs)).toEqual(['Dumbbell', 'Barbell']);
  });

  it('pre-fills a name and a plausible kind, but never any loads, maximum or increment', () => {
    const draft = legacyItemDraft(' Cable machine ');
    expect(draft).toEqual({ label: 'Cable machine', type: 'cable', typeName: 'Cable stack' });
    expect(Object.keys(draft)).not.toContain('max_load');
    expect(legacyItemDraft('Chest press').type).toBe(OTHER_EQUIPMENT_TYPE);
  });

  it('a configured instance carries no invented loads', () => {
    const instance = createGymEquipmentInstance({
      trainingLocationId: 'l',
      equipmentDefinitionId: 'd',
      label: 'Cable machine',
      legacyEquipment: 'Cable machine',
    });
    expect(instance).toMatchObject({
      exact_loads: null,
      min_load: null,
      max_load: null,
      increment: null,
      legacy_equipment: 'Cable machine',
    });
  });
});

describe('equipment kinds', () => {
  it("uses the exercise library's own vocabulary", () => {
    expect(EQUIPMENT_TYPES.map((t) => t.type)).toEqual(
      expect.arrayContaining([
        'dumbbell',
        'barbell',
        'cable',
        'leverage machine',
        'smith machine',
        'kettlebell',
      ]),
    );
  });

  it('names a kind, and falls back to the raw type for one it does not know', () => {
    expect(equipmentTypeName('dumbbell')).toBe('Dumbbells');
    expect(equipmentTypeName('flux capacitor')).toBe('flux capacitor');
  });

  it('matches an instance kind to the exercises that call for it', () => {
    expect(matchesExerciseEquipment('dumbbell', { equipment: ['dumbbell'] })).toBe(true);
    expect(matchesExerciseEquipment('dumbbell', { equipment: ['Dumbbells'] })).toBe(true);
    expect(matchesExerciseEquipment('dumbbell', { equipment: ['barbell'] })).toBe(false);
    expect(matchesExerciseEquipment('dumbbell', { equipment: [] })).toBe(false);
  });

  it('guesses a kind from free text, defaulting to other', () => {
    expect(equipmentTypeFromText('Dumbbells')).toBe('dumbbell');
    expect(equipmentTypeFromText('EZ bar')).toBe('ez barbell');
    expect(equipmentTypeFromText('Smith machine')).toBe('smith machine');
    expect(equipmentTypeFromText('Pec deck')).toBe(OTHER_EQUIPMENT_TYPE);
  });

  it('shares one definition per kind instead of creating one per instance', () => {
    const first = findOrCreateEquipmentDefinition([], { type: 'cable' });
    expect(first.created).toBe(true);
    expect(first.definition).toMatchObject({ type: 'cable', name: 'Cable stack' });
    const again = findOrCreateEquipmentDefinition([first.definition], { type: 'cable' });
    expect(again.created).toBe(false);
    expect(again.definition.id).toBe(first.definition.id);
  });

  it('"other" definitions are told apart by name', () => {
    const pecDeck = findOrCreateEquipmentDefinition([], {
      type: OTHER_EQUIPMENT_TYPE,
      name: 'Pec deck',
    });
    const same = findOrCreateEquipmentDefinition([pecDeck.definition], {
      type: OTHER_EQUIPMENT_TYPE,
      name: ' pec deck ',
    });
    const different = findOrCreateEquipmentDefinition([pecDeck.definition], {
      type: OTHER_EQUIPMENT_TYPE,
      name: 'Leg curl',
    });
    expect(same.created).toBe(false);
    expect(different.created).toBe(true);
    expect(different.definition.name).toBe('Leg curl');
  });
});

describe('what equipment is at a place (for the substitution check)', () => {
  const main = location(['Cable machine']);

  it('unions the legacy list with the kinds of structured equipment, so neither is forgotten', () => {
    const rack = createGymEquipmentInstance({
      trainingLocationId: main.id,
      equipmentDefinitionId: dumbbellDef.id,
      label: 'Rack',
    });
    const inventory = availableEquipmentForLocation(main, [rack], defs);
    expect(inventory).toEqual(expect.arrayContaining(['Cable machine', 'dumbbell']));
    expect(inventory).toHaveLength(2);
  });

  it('is null -- unknown, not empty -- for a place that is only a name', () => {
    expect(availableEquipmentForLocation(location([]), [], defs)).toBeNull();
    expect(availableEquipmentForLocation(null, [], defs)).toBeNull();
  });

  it('ignores archived equipment and equipment at other places', () => {
    const base = location([]);
    const archived = {
      ...createGymEquipmentInstance({
        trainingLocationId: base.id,
        equipmentDefinitionId: dumbbellDef.id,
        label: 'Old rack',
      }),
      archived_at: '2026-09-01T00:00:00.000Z',
    };
    const elsewhere = createGymEquipmentInstance({
      trainingLocationId: 'other',
      equipmentDefinitionId: dumbbellDef.id,
      label: 'Other rack',
    });
    expect(availableEquipmentForLocation(base, [archived, elsewhere], defs)).toBeNull();
  });

  it('flags an exercise only when the owner has said what is here and none of it fits', () => {
    expect(equipmentUnavailable(['barbell'], ['dumbbell'])).toBe(true);
    expect(equipmentUnavailable(['dumbbell'], ['Dumbbells'])).toBe(false);
    expect(equipmentUnavailable(['barbell'], null)).toBe(false); // unknown inventory: never flagged
    expect(equipmentUnavailable([], ['dumbbell'])).toBe(false);
  });

  it('never flags a bodyweight exercise: it needs nothing from the gym', () => {
    expect(equipmentUnavailable(['body weight'], ['dumbbell'])).toBe(false);
    expect(equipmentUnavailable(['body weight', 'barbell'], ['dumbbell'])).toBe(true); // the barbell part is still missing
  });
});
