/**
 * vNext Handoff 04B. How a comparable performance context reads to the owner:
 * "Main Gym — Chest Press #1". The Strength picker is the one consumer, but the
 * wording rules live here so they are tested and a second surface cannot word
 * the same context differently.
 *
 * Names are looked up from rows that include ARCHIVED places and equipment
 * (archiving hides a choice, it does not remove the row), so a session at a
 * place the owner has since archived still reads by its name.
 */
export interface ContextNames {
  /** `TrainingLocation.id` -> name. */
  locations: ReadonlyMap<string, string>;
  /** `GymEquipmentInstance.id` -> label. */
  equipment: ReadonlyMap<string, string>;
}

export interface ContextParts {
  training_location_id?: string | null;
  gym_equipment_id?: string | null;
}

/** What history that recorded neither a place nor a machine is called. */
export const UNSPECIFIED_CONTEXT_LABEL = 'Unspecified / Legacy';

export function performanceContextLabel(context: ContextParts, names: ContextNames): string {
  const locationId = context.training_location_id ?? null;
  const equipmentId = context.gym_equipment_id ?? null;
  if (locationId === null && equipmentId === null) return UNSPECIFIED_CONTEXT_LABEL;

  const equipment =
    equipmentId === null ? null : (names.equipment.get(equipmentId) ?? 'Removed equipment');
  if (locationId === null) return equipment ?? UNSPECIFIED_CONTEXT_LABEL;

  const location = names.locations.get(locationId) ?? 'Removed place';
  return `${location} — ${equipment ?? 'equipment not recorded'}`;
}
