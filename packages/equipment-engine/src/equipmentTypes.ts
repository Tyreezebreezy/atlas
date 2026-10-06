import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { EquipmentDefinition, Exercise } from '@atlas/data-model';

/**
 * vNext Handoff 04B. The kinds of equipment the owner can pick when adding a
 * piece of equipment. `type` is the SAME vocabulary `Exercise.equipment` uses
 * (the bundled exercise data), so a "Dumbbells" instance can be matched to the
 * dumbbell exercises without any guesswork; `name` is what the owner reads.
 * These are the load-bearing kinds -- the ones that have selectable weights.
 */
export interface EquipmentTypeOption {
  type: string;
  name: string;
}

export const EQUIPMENT_TYPES: readonly EquipmentTypeOption[] = [
  { type: 'dumbbell', name: 'Dumbbells' },
  { type: 'barbell', name: 'Barbell' },
  { type: 'ez barbell', name: 'EZ bar' },
  { type: 'trap bar', name: 'Trap bar' },
  { type: 'cable', name: 'Cable stack' },
  { type: 'leverage machine', name: 'Machine' },
  { type: 'smith machine', name: 'Smith machine' },
  { type: 'sled machine', name: 'Sled' },
  { type: 'kettlebell', name: 'Kettlebells' },
  { type: 'assisted', name: 'Assisted machine' },
];

/** The type for equipment that is none of the above; its name is whatever the owner typed. */
export const OTHER_EQUIPMENT_TYPE = 'other';

/** Case-, spacing- and plural-insensitive form, so "Dumbbells", "dumbbell" and " DUMBBELL " compare equal. */
export function normalizeEquipmentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/s$/, '');
}

const ALIASES: Record<string, string> = {
  'cable machine': 'cable',
  'cable station': 'cable',
  'cable cross': 'cable',
  machine: 'leverage machine',
  'plate loaded machine': 'leverage machine',
  'ez bar': 'ez barbell',
  'ez curl bar': 'ez barbell',
  'hex bar': 'trap bar',
  bar: 'barbell',
};

/** The vocabulary type a free-text equipment name most plainly means, or `other`. Used only to PRE-FILL the type; the owner confirms it. */
export function equipmentTypeFromText(text: string): string {
  const normalized = normalizeEquipmentText(text);
  const aliased = ALIASES[normalized];
  const direct = EQUIPMENT_TYPES.find(
    (option) =>
      normalizeEquipmentText(option.type) === normalized ||
      normalizeEquipmentText(option.name) === normalized,
  );
  return aliased ?? direct?.type ?? OTHER_EQUIPMENT_TYPE;
}

/** The display name for a type, falling back to the type itself (so an unrecognized one still reads). */
export function equipmentTypeName(type: string): string {
  return EQUIPMENT_TYPES.find((option) => option.type === type)?.name ?? type;
}

/** True when equipment of `type` is the kind an exercise calls for (its `equipment` list names that type). */
export function matchesExerciseEquipment(
  type: string,
  exercise: Pick<Exercise, 'equipment'>,
): boolean {
  const wanted = normalizeEquipmentText(type);
  return exercise.equipment.some((needed) => normalizeEquipmentText(needed) === wanted);
}

export interface EquipmentDefinitionInput {
  type: string;
  /** Required only for `other`; a known type uses its standard name. */
  name?: string;
}

/**
 * The shared `EquipmentDefinition` for a kind of equipment, created when there
 * is none yet. Definitions are found by type (and by name for `other`), so ten
 * "Dumbbells" instances across places share one definition instead of making
 * ten.
 */
export function findOrCreateEquipmentDefinition(
  definitions: EquipmentDefinition[],
  input: EquipmentDefinitionInput,
): { definition: EquipmentDefinition; created: boolean } {
  const name =
    (input.type === OTHER_EQUIPMENT_TYPE ? input.name?.trim() : '') ||
    equipmentTypeName(input.type);
  const existing = definitions.find(
    (definition) =>
      definition.deleted_at === null &&
      definition.type === input.type &&
      (input.type !== OTHER_EQUIPMENT_TYPE ||
        normalizeEquipmentText(definition.name) === normalizeEquipmentText(name)),
  );
  if (existing) return { definition: existing, created: false };
  const now = new Date().toISOString();
  return {
    created: true,
    definition: {
      id: newId(),
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: getOrCreateDeviceId(),
      deleted_at: null,
      type: input.type,
      name,
    },
  };
}
