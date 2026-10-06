import type {
  EquipmentDefinition,
  GymEquipmentInstance,
  TrainingLocation,
} from '@atlas/data-model';
import { equipmentTypeFromText, equipmentTypeName, normalizeEquipmentText } from './equipmentTypes';

/**
 * vNext Handoff 04B. Reconciling the old free-text `TrainingLocation.equipment`
 * list with structured `GymEquipmentInstance` rows.
 *
 * Authority after this handoff:
 * - Structured instances are the inventory ATLAS reasons from -- exact loads, a
 *   maximum, which machine a performance was on.
 * - The legacy strings stay readable, untouched, as compatibility data. They
 *   still feed the substitution check (`availableEquipmentForLocation` unions
 *   them with the structured kinds) and are never deleted or rewritten.
 * - Reconciliation is one explicit step per item, taken by the owner:
 *   "Configure" turns a legacy name into an instance. It copies the NAME and
 *   guesses the kind to pre-fill the form; it never invents loads, a maximum or
 *   an increment.
 */

/** Case-, spacing- and plural-insensitive, so "Dumbbells" and "dumbbell" are one item. */
export function legacyKey(text: string): string {
  return normalizeEquipmentText(text);
}

type InstanceRef = Pick<
  GymEquipmentInstance,
  | 'id'
  | 'training_location_id'
  | 'deleted_at'
  | 'legacy_equipment'
  | 'label'
  | 'equipment_definition_id'
>;

/**
 * The structured instance that already accounts for a legacy item, or
 * undefined. An item is accounted for when an instance at this location was
 * configured from it, or is plainly the same thing -- its label, or its kind,
 * reads as the legacy name. Archived instances count: the owner dealt with the
 * item already, so it is not offered again.
 */
export function instanceCoveringLegacyItem(
  locationId: string,
  legacyName: string,
  instances: InstanceRef[],
  definitions: Pick<EquipmentDefinition, 'id' | 'type' | 'name'>[],
): InstanceRef | undefined {
  const wanted = legacyKey(legacyName);
  const definitionById = new Map(definitions.map((d) => [d.id, d]));
  return instances.find((instance) => {
    if (instance.training_location_id !== locationId || instance.deleted_at !== null) return false;
    if (instance.legacy_equipment && legacyKey(instance.legacy_equipment) === wanted) return true;
    if (legacyKey(instance.label) === wanted) return true;
    const definition = definitionById.get(instance.equipment_definition_id);
    return (
      !!definition &&
      (legacyKey(definition.type) === wanted || legacyKey(definition.name) === wanted)
    );
  });
}

/**
 * The legacy equipment names at a location that have no structured instance
 * yet -- what the settings screen lists under "Legacy equipment" with a
 * Configure button. Each distinct item appears once, in the order it was
 * written; the strings themselves are returned exactly as stored.
 */
export function legacyEquipmentToConfigure(
  location: Pick<TrainingLocation, 'id' | 'equipment'>,
  instances: InstanceRef[],
  definitions: Pick<EquipmentDefinition, 'id' | 'type' | 'name'>[],
): string[] {
  const seen = new Set<string>();
  const pending: string[] = [];
  for (const raw of location.equipment) {
    const name = raw.trim();
    const key = legacyKey(name);
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    if (!instanceCoveringLegacyItem(location.id, name, instances, definitions)) pending.push(raw);
  }
  return pending;
}

/** What to pre-fill when configuring a legacy item: its name as the label and its most plausible kind. The owner confirms both; no loads are suggested. */
export function legacyItemDraft(legacyName: string): {
  label: string;
  type: string;
  typeName: string;
} {
  const type = equipmentTypeFromText(legacyName);
  return { label: legacyName.trim(), type, typeName: equipmentTypeName(type) };
}
