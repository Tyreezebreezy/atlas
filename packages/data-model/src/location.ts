import type { SyncMeta } from './sync';

/**
 * v1.0.0 (H2). A reusable training location ("Home", "Regular Gym", "Hotel",
 * "Travel setup" — nothing hardcodes these) with the equipment available
 * there. First-class synced entity (unlike the old device-local
 * `EquipmentProfile` in Settings, which this supersedes). The "currently
 * active" location stays a device-local setting (see `AtlasSettings`), since
 * "which gym am I at right now" is transient context, not shared history.
 */
export interface TrainingLocation extends SyncMeta {
  name: string;
  equipment: string[];
  note: string | null;
}
