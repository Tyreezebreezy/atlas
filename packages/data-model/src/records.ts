import type { SyncMeta } from './sync';

export type PrKind =
  | 'max_load'
  | 'rep'
  | 'rep_range'
  | 'estimated_1rm'
  | 'volume'
  | 'timed'
  | 'distance'
  | 'bodyweight';

export interface PersonalRecord extends SyncMeta {
  exercise_id: string;
  kind: PrKind;
  value: number;
  reps: number | null;
  achieved_at: string;
  source_session_id: string;
  source_set_id: string;
}

export type MilestoneDimension =
  | 'weight'
  | 'reps'
  | 'weight_and_reps'
  | 'volume'
  | 'duration'
  | 'distance'
  | 'bodyweight_multiplier'
  | 'custom';

/**
 * Dimension + nullable target_* fields, not a variant per goal — so inventing a
 * new personal milestone is a data row, never a code change.
 */
export interface Milestone extends SyncMeta {
  title: string;
  exercise_id: string | null;
  dimension: MilestoneDimension;
  target_weight: number | null;
  target_reps: number | null;
  target_volume: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
  target_bodyweight_multiplier: number | null;
  is_builtin: boolean;
  achieved_at: string | null;
}

/** Internal quality classification — never shown on motivational cards. */
export type BenchmarkEvidenceGrade = 'A' | 'B' | 'C' | 'D';

export interface Benchmark extends SyncMeta {
  metric: string;
  exercise_id: string | null;
  age_group: string | null;
  comparison_population: string;
  percentile_thresholds: Record<string, number>;
  source: string;
  year: number | null;
  method: string | null;
  evidence_grade: BenchmarkEvidenceGrade;
}
