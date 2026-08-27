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
