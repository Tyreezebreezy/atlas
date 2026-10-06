import type { GymEquipmentInstance } from '@atlas/data-model';
import type { LoadConfigFields } from './loadConfig';

/**
 * vNext Handoff 04B. The rules for changing a configured piece of equipment.
 * Like locations, equipment is archived rather than deleted once anything may
 * refer to it: past sessions name the machine they used, and that label must
 * keep resolving.
 */

export const MAX_EQUIPMENT_LABEL_LENGTH = 60;

export function isInstanceActive(
  instance: Pick<GymEquipmentInstance, 'deleted_at' | 'archived_at'>,
): boolean {
  return instance.deleted_at === null && !instance.archived_at;
}

/** Equipment at one location that can be chosen for a workout: not archived, not deleted, by label. */
export function activeInstancesAt(
  instances: GymEquipmentInstance[],
  locationId: string,
): GymEquipmentInstance[] {
  return instances
    .filter((i) => i.training_location_id === locationId && isInstanceActive(i))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function archivedInstancesAt(
  instances: GymEquipmentInstance[],
  locationId: string,
): GymEquipmentInstance[] {
  return instances
    .filter(
      (i) => i.training_location_id === locationId && i.deleted_at === null && !!i.archived_at,
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Null when the label is fine. Labels are unique ignoring case within one
 * location -- two machines named "Chest Press" at one gym could not be told
 * apart in a picker -- but the same label at another place is fine.
 */
export function validateEquipmentLabel(
  label: string,
  siblings: GymEquipmentInstance[],
  selfId: string | null = null,
): string | null {
  const trimmed = label.trim();
  if (trimmed === '') return 'Give this equipment a name, like "Chest Press #1".';
  if (trimmed.length > MAX_EQUIPMENT_LABEL_LENGTH)
    return `Keep the name under ${MAX_EQUIPMENT_LABEL_LENGTH} characters.`;
  const clash = siblings.some(
    (other) =>
      other.id !== selfId &&
      other.deleted_at === null &&
      other.label.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return clash ? 'This place already has equipment with that name.' : null;
}

function touched(instance: GymEquipmentInstance): GymEquipmentInstance {
  return { ...instance, updated_at: new Date().toISOString(), version: instance.version + 1 };
}

export interface EquipmentEdit {
  label: string;
  equipment_definition_id: string;
  notes: string | null;
  loads: LoadConfigFields;
}

/** Applies the editor's result: replaces the label, kind, notes and load configuration together (a load configuration replaces the old one outright -- an exact list never lingers beside a new range). */
export function updateGymEquipmentInstance(
  instance: GymEquipmentInstance,
  edit: EquipmentEdit,
): GymEquipmentInstance {
  return {
    ...touched(instance),
    label: edit.label.trim(),
    equipment_definition_id: edit.equipment_definition_id,
    notes: edit.notes?.trim() ? edit.notes.trim() : null,
    ...edit.loads,
  };
}

export function archiveGymEquipmentInstance(instance: GymEquipmentInstance): GymEquipmentInstance {
  return { ...touched(instance), archived_at: new Date().toISOString() };
}

export function restoreGymEquipmentInstance(instance: GymEquipmentInstance): GymEquipmentInstance {
  return { ...touched(instance), archived_at: null };
}
