import type { SyncMeta } from './sync';

/**
 * vNext Handoff 01 (Section 5). A named category of equipment ("Dumbbell",
 * "Barbell", "Chest Press Machine") — the same vocabulary
 * `TrainingLocation.equipment`/`Exercise.equipment` already use as plain
 * strings, given a stable id + a few structured fields so a specific
 * instance (below) can reference one deterministically instead of
 * matching on a free-text label.
 */
export interface EquipmentDefinition extends SyncMeta {
  type: string;
  name: string;
}

export type LoadUnit = 'lb' | 'kg';

/**
 * One physical piece of equipment at one `TrainingLocation` — deliberately
 * separate from `TrainingLocation.equipment: string[]` (which stays the
 * coarse "what categories exist here" list the substitution engine
 * already reads unchanged). This is the richer record equipment-aware
 * progression needs: exact loads, a max, a non-uniform increment. Two
 * instances of the "same" equipment at different locations (or two
 * different machines at the same location) are different rows with
 * independent constraints and are never assumed equivalent — see
 * `docs/DATA_MODEL.md` "Equipment instances" (to be added) and the vNext
 * research pack §3.2.
 */
export interface GymEquipmentInstance extends SyncMeta {
  training_location_id: string;
  equipment_definition_id: string;
  /** Owner-facing identifying label, e.g. "Chest Press (Precor)" — distinct
   * from the shared `EquipmentDefinition.name` ("Chest Press Machine"). */
  label: string;
  manufacturer: string | null;
  model: string | null;
  /** Exact selectable loads (a plate-loaded/pin-stack machine or a fixed
   * dumbbell rack), e.g. [10, 20, 30, ..., 170]. When set, this is
   * authoritative over `min_load`/`max_load`/`increment` for "what's the
   * next available load" — see `@atlas/equipment-engine`'s
   * `nextAvailableLoad`. Null when the equipment is better described by a
   * uniform range instead (e.g. a cable stack with a fixed 5 lb pin step
   * from 0 to 200 is just `min_load: 0, max_load: 200, increment: 5`). */
  exact_loads: number[] | null;
  min_load: number | null;
  max_load: number | null;
  increment: number | null;
  unit: LoadUnit;
  notes: string | null;
}

/**
 * Maps one canonical exercise to a specific equipment instance the owner
 * actually uses it on — "Machine Chest Press" (the exercise) performed on
 * "Chest Press (Precor) @ Main Gym" (the instance). Optional per exercise:
 * most bodyweight/free-weight exercises never need one at all.
 */
export interface ExerciseEquipmentContext extends SyncMeta {
  exercise_id: string;
  gym_equipment_id: string;
  /** True when this is the instance to use by default for this exercise at
   * this instance's location, if the owner ever logs the same exercise
   * against more than one instance there. */
  is_default: boolean;
  notes: string | null;
}
