import type { SyncMeta } from './sync';

/** Not every measurement is always present — all metrics beyond date/weight are nullable. */
export interface BodyMeasurement extends SyncMeta {
  date: string;
  weight: number | null;
  body_fat_percentage: number | null;
  fat_mass: number | null;
  lean_mass: number | null;
  muscle_mass: number | null;
  water_percentage: number | null;
  visceral_fat: number | null;
  bone_mass: number | null;
  bmr: number | null;
  source: string | null;
  notes: string | null;
}
