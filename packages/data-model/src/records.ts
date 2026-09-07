import type { SyncMeta } from './sync';

export type PrKind =
  | 'max_load'
  | 'rep'
  | 'rep_range'
  | 'estimated_1rm'
  | 'volume'
  | 'timed'
  | 'distance'
  | 'bodyweight'
  /** v0.2.0. Best `PerformedSet.external_load` for a weighted bodyweight
   * movement (e.g. a weighted pull-up) -- the bodyweight analogue of
   * `max_load`. Only ever computed when at least one eligible set actually
   * has `external_load` set. */
  | 'weighted_bodyweight';

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
 *
 * `reference_value`/`multiplier` serve both 'custom' (e.g. "Squat Six
 * Girlfriends" = 100 lb x 6) and 'bodyweight_multiplier' (e.g. 2x bodyweight)
 * -- both compute `target_weight = reference_value * multiplier` once at
 * creation time. bodyweight_multiplier deliberately does NOT read from
 * BodyMeasurement (no input UI for that exists before v0.0.8): the user
 * enters their own current bodyweight as `reference_value` when creating the
 * milestone, same mechanism as 'custom'. See docs/MILESTONES.md.
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
  reference_value: number | null;
  multiplier: number | null;
  is_builtin: boolean;
  /** Deactivated milestones are excluded from evaluation but kept (distinct from soft-delete). */
  active: boolean;
  achieved_at: string | null;
  origin_session_id: string | null;
  origin_set_id: string | null;
}

/** Internal quality classification — never shown on motivational cards. */
export type BenchmarkEvidenceGrade = 'A' | 'B' | 'C' | 'D';

/**
 * `dataset_version` makes a benchmark row's provenance recomputable: the UI
 * always derives "stronger than X%" live from the current active dataset
 * rather than baking comparison text into a WorkoutSession. See
 * docs/BENCHMARKS.md.
 */
export interface Benchmark extends SyncMeta {
  metric: string;
  exercise_id: string | null;
  age_min: number | null;
  age_max: number | null;
  /** Human-readable label (e.g. "18-29") -- age_min/age_max drive lookup, this is display-only. */
  age_group: string | null;
  comparison_population: string;
  percentile_thresholds: Record<string, number>;
  source: string;
  source_url: string | null;
  sample_description: string | null;
  year: number | null;
  method: string | null;
  notes: string | null;
  evidence_grade: BenchmarkEvidenceGrade;
  dataset_version: string;
}
