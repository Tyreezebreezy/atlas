/** Every persisted entity carries this so CITADEL sync (v0.3.0) never needs a schema redesign. */
export interface SyncMeta {
  id: string;
  created_at: string;
  updated_at: string;
  version: number;
  device_id: string;
  deleted_at: string | null;
}

export type NewEntity<T> = Omit<T, keyof SyncMeta>;

/** v0.2.1. Set only on a Program/WorkoutTemplate created by the built-in
 * owner starter-data seeder (see packages/import-export/src/ownerStarterData.ts
 * and seedOwnerStarterData.ts) -- purely informational provenance, never
 * read for idempotency (the seeder's own stable `id` is what that checks).
 * Absent for every program/template authored directly or through a manual
 * HTML/paste import. */
export interface OwnerStarterPackProvenance {
  pack_id: string;
  pack_version: string;
  source_filename: string;
  source_version: string;
}
