import type { SyncMeta } from './sync';

/**
 * v1.0.0 (H2). A reusable training location ("Home", "Regular Gym", "Hotel",
 * "Travel setup" — nothing hardcodes these) with the equipment available
 * there. First-class synced entity (unlike the old device-local
 * `EquipmentProfile` in Settings, which this supersedes).
 *
 * vNext Handoff 04B: this is THE location identity -- a session's
 * `training_location_id`, every `GymEquipmentInstance.training_location_id`
 * and every equipment-scoped PR series point here. The old device-local
 * "active location" setting is gone: where you are *now* is the workout's own
 * `training_location_id`, and the default lives on the entity (below) so it
 * survives a backup and restore.
 *
 * `equipment` (free-text category names) is kept readable as compatibility
 * data. Structured `GymEquipmentInstance` rows are the authoritative
 * inventory; a legacy string only matters until the owner configures it (see
 * `legacyEquipmentToConfigure` in `@atlas/equipment-engine`). Nothing here is
 * ever rewritten or deleted by that reconciliation.
 */
export interface TrainingLocation extends SyncMeta {
  name: string;
  equipment: string[];
  note: string | null;
  /** vNext Handoff 04B. The location a new workout starts at when the owner
   * has more than one. At most one location carries it (see
   * `setDefaultLocation`). Absent = not the default. */
  is_default?: boolean;
  /** vNext Handoff 04B. Set when the owner archives the location: hidden from
   * every "where are you training" choice, but kept -- sessions that happened
   * there still resolve its name, and equipment configured there is not lost.
   * Distinct from `deleted_at` (a tombstone, which `getAll()` hides). Absent
   * = active. */
  archived_at?: string | null;
}
