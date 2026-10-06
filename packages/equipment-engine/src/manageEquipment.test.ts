import { describe, expect, it } from 'vitest';
import { createGymEquipmentInstance } from './createEquipment';
import {
  activeInstancesAt,
  archivedInstancesAt,
  archiveGymEquipmentInstance,
  isInstanceActive,
  MAX_EQUIPMENT_LABEL_LENGTH,
  restoreGymEquipmentInstance,
  updateGymEquipmentInstance,
  validateEquipmentLabel,
} from './manageEquipment';
import { parseLoadConfig, EMPTY_LOAD_DRAFT } from './loadConfig';

const at = (location: string, label: string, extra = {}) =>
  createGymEquipmentInstance({
    trainingLocationId: location,
    equipmentDefinitionId: 'd',
    label,
    ...extra,
  });

describe('two machines at one place stay distinct', () => {
  it('are separate rows with independent loads', () => {
    const one = at('main', 'Chest Press #1', { maxLoad: 170 });
    const two = at('main', 'Chest Press #2', { maxLoad: 200 });
    expect(one.id).not.toBe(two.id);
    expect(activeInstancesAt([one, two], 'main').map((i) => [i.label, i.max_load])).toEqual([
      ['Chest Press #1', 170],
      ['Chest Press #2', 200],
    ]);
  });

  it('labels are unique within a place, ignoring case -- so a picker can tell them apart', () => {
    const one = at('main', 'Chest Press #1');
    expect(validateEquipmentLabel('chest press #1', [one])).toBeTruthy();
    expect(validateEquipmentLabel('Chest Press #2', [one])).toBeNull();
  });

  it('the same label at another place is fine, and a row may keep its own label', () => {
    const one = at('main', 'Chest Press');
    const hotel = at('hotel', 'Chest Press');
    expect(validateEquipmentLabel('Chest Press', [one], hotel.id)).toBeTruthy(); // siblings passed are the place's own
    expect(validateEquipmentLabel('Chest Press', [hotel])).toBeTruthy();
    expect(validateEquipmentLabel('Chest Press', [], null)).toBeNull();
    expect(validateEquipmentLabel('Chest Press', [one], one.id)).toBeNull();
  });

  it('needs a label of reasonable length', () => {
    expect(validateEquipmentLabel('  ', [])).toBeTruthy();
    expect(validateEquipmentLabel('x'.repeat(MAX_EQUIPMENT_LABEL_LENGTH + 1), [])).toBeTruthy();
  });
});

describe('editing equipment', () => {
  it('replaces the load configuration outright: an old exact list never lingers beside a new range', () => {
    const rack = at('main', 'Rack', { exactLoads: [5, 10, 80] });
    const parsed = parseLoadConfig({
      ...EMPTY_LOAD_DRAFT,
      mode: 'range',
      min: '10',
      max: '100',
      increment: '10',
    });
    if (!parsed.ok) throw new Error('should parse');
    const edited = updateGymEquipmentInstance(rack, {
      label: ' Dumbbell rack ',
      equipment_definition_id: 'd2',
      notes: '  heavy end is rubber  ',
      loads: parsed.fields,
    });
    expect(edited).toMatchObject({
      label: 'Dumbbell rack',
      equipment_definition_id: 'd2',
      notes: 'heavy end is rubber',
      exact_loads: null,
      min_load: 10,
      max_load: 100,
      increment: 10,
    });
    expect(edited.version).toBe(rack.version + 1);
    expect(edited.id).toBe(rack.id);
  });

  it('does not touch what it does not own: the legacy source and the dismissal survive an edit', () => {
    const configured = {
      ...at('main', 'Cable machine'),
      legacy_equipment: 'Cable machine',
      max_prompt_dismissed_at: '2026-09-01T00:00:00.000Z',
    };
    const edited = updateGymEquipmentInstance(configured, {
      label: 'Cable stack A',
      equipment_definition_id: 'd',
      notes: null,
      loads: { exact_loads: null, min_load: null, max_load: null, increment: null },
    });
    expect(edited.legacy_equipment).toBe('Cable machine');
    expect(edited.max_prompt_dismissed_at).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('archiving equipment', () => {
  it('hides it from the choices but keeps the row, so past sessions still resolve its label', () => {
    const press = at('main', 'Old press');
    const archived = archiveGymEquipmentInstance(press);
    expect(archived.deleted_at).toBeNull();
    expect(archived.label).toBe('Old press');
    expect(isInstanceActive(archived)).toBe(false);
    expect(activeInstancesAt([archived], 'main')).toEqual([]);
    expect(archivedInstancesAt([archived], 'main').map((i) => i.label)).toEqual(['Old press']);
  });

  it('can be restored', () => {
    const restored = restoreGymEquipmentInstance(archiveGymEquipmentInstance(at('main', 'Press')));
    expect(isInstanceActive(restored)).toBe(true);
  });

  it('archived equipment still blocks a duplicate label, so restoring never creates a clash', () => {
    const archived = archiveGymEquipmentInstance(at('main', 'Press'));
    expect(validateEquipmentLabel('Press', [archived])).toBeTruthy();
  });
});
