import type {
  EquipmentDefinition,
  GymEquipmentInstance,
  TrainingLocation,
} from '@atlas/data-model';
import { normalizeEquipmentText } from './equipmentTypes';
import { isInstanceActive } from './manageEquipment';

/**
 * vNext Handoff 04B. The kinds of equipment known to be at a location, for the
 * substitution check ("this exercise needs X, which isn't here"): the legacy
 * free-text list unioned with the kinds of the structured equipment configured
 * there. Both count, so adding structured equipment never makes the check
 * forget what the legacy list said, and vice versa.
 *
 * Returns null when nothing at all is known about the place. That is "unknown",
 * not "empty": a location that is only a name must not make every exercise look
 * unavailable (nothing is flagged until the owner has said what is there).
 */
export function availableEquipmentForLocation(
  location: Pick<TrainingLocation, 'id' | 'equipment'> | null,
  instances: GymEquipmentInstance[],
  definitions: Pick<EquipmentDefinition, 'id' | 'type'>[],
): string[] | null {
  if (!location) return null;
  const definitionById = new Map(definitions.map((d) => [d.id, d.type]));
  const kinds = new Map<string, string>(); // normalized -> as written
  for (const name of location.equipment) {
    const trimmed = name.trim();
    if (trimmed) kinds.set(normalizeEquipmentText(trimmed), trimmed);
  }
  for (const instance of instances) {
    if (instance.training_location_id !== location.id || !isInstanceActive(instance)) continue;
    const type = definitionById.get(instance.equipment_definition_id);
    if (type) kinds.set(normalizeEquipmentText(type), type);
  }
  return kinds.size === 0 ? null : [...kinds.values()];
}

/** "Equipment" that is just the person: never has to be found at a gym, so never makes an exercise unavailable. */
const ALWAYS_AVAILABLE = new Set(
  ['body weight', 'bodyweight', 'body only', 'none'].map(normalizeEquipmentText),
);

/**
 * True when `needed` (an exercise's equipment list) is NOT covered by a known
 * inventory. Always false when the inventory is unknown (null) or the exercise
 * needs nothing -- the alert only fires when the owner has said what is here
 * and none of it is what the exercise calls for. A bodyweight exercise needs
 * nothing from the gym, so it is never flagged.
 */
export function equipmentUnavailable(needed: string[], inventory: string[] | null): boolean {
  const required = needed.filter((kind) => !ALWAYS_AVAILABLE.has(normalizeEquipmentText(kind)));
  if (inventory === null || required.length === 0) return false;
  const have = new Set(inventory.map(normalizeEquipmentText));
  return !required.some((kind) => have.has(normalizeEquipmentText(kind)));
}
