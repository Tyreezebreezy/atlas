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
  | 'weighted_bodyweight'
  /** vNext Handoff 02. The dual of `rep_range`: best `reps` at an **exact**
   * observed `value` (load), one row per load that has ever been used --
   * the equipment-ceiling case (170x12 -> 170x15 -> 170x18 all register as
   * new records at the same load). See docs/PRS.md. */
  | 'rep_at_load';

export interface PersonalRecord extends SyncMeta {
  exercise_id: string;
  kind: PrKind;
  value: number;
  reps: number | null;
  achieved_at: string;
  source_session_id: string;
  source_set_id: string;
  /** vNext Handoff 02. Which `TrainingLocation` this record was set at, when
   * the source session recorded one -- null for every PR computed before
   * this field existed and for any session with no recorded location. A
   * null-location PR is a legacy/unscoped series; once sessions start
   * recording `training_location_id`, weight-bearing PR series are grouped
   * by it so a harder machine at one gym never overwrites an easier
   * machine's max at another. See docs/PRS.md "Equipment-scoped series." */
  training_location_id?: string | null;
  /** vNext Handoff 02. Set only for `kind === 'estimated_1rm'` -- which
   * `E1RMEstimator` produced `value`, so a future default-formula change is
   * a recorded fact rather than a silent rewrite of history. Null for every
   * other kind and for any e1RM PR computed before estimator provenance
   * existed. See docs/PRS.md "Estimated 1RM." */
  estimator_id?: string | null;
  estimator_version?: string | null;
  /** vNext Handoff 02. `kind === 'rep_at_load'` only -- the fixed load this
   * record was set at (`value`/`reps` keep their usual meaning: `value` is
   * the achievement number, i.e. reps performed; `reps` is unused/null for
   * this kind). Kept as its own field rather than overloading `reps` with a
   * second meaning depending on `kind`. */
  load?: number | null;
}

/**
 * vNext Handoff 04A.1. One headline PR event: an exercise, in one completed
 * session, in one equipment context, that improved at least one PR dimension
 * over every earlier performance in that context. The historical layer next
 * to `PersonalRecord`, which is only ever the CURRENT best -- a record a later
 * session beats leaves `personal_records`, but the event stays here, so
 * "PRs this week" counts every performance that earned a new best.
 *
 * - A first-ever performance in a context is a baseline: it makes no event.
 * - The id is derived from session + exercise + context
 *   (`personalRecordEventId`), so there can be at most one event for that
 *   combination and re-deriving it is an upsert, never a duplicate.
 * - `pr_kinds` lists which detailed records the performance set (max load,
 *   e1RM, rep-at-load, ...); the detailed rows themselves stay in
 *   `personal_records`.
 * - `evaluator_version` says how the event was recognized. A change to the
 *   evaluator (or the default e1RM estimator) never rewrites or deletes an
 *   event stamped with an older version. See docs/PRS.md "Headline PR events".
 */
export interface PersonalRecordEvent extends SyncMeta {
  session_id: string;
  exercise_id: string;
  /** The equipment context the session ran in; null when none was recorded (all legacy history). */
  training_location_id: string | null;
  /** The earliest `achieved_at` among the records the performance set. */
  achieved_at: string;
  pr_kinds: PrKind[];
  evaluator_version: string;
  /** Set only when an `estimated_1rm` record contributed -- which estimator produced it. */
  estimator_id?: string | null;
  estimator_version?: string | null;
}

export type MilestoneDimension =
  | 'weight'
  | 'reps'
  | 'weight_and_reps'
  | 'volume'
  | 'duration'
  | 'distance'
  | 'bodyweight_multiplier'
  | 'custom'
  /** vNext Handoff 02. No `exercise_id` required -- checked against
   * `BodyMeasurement` history directly. `set.weight >= target_body_weight`,
   * i.e. "reach at least" a bodyweight target; a weight-loss ("at most")
   * goal is not modeled yet. */
  | 'body_weight'
  /** vNext Handoff 02. No `exercise_id` required. Exactly one of
   * `target_consecutive_weeks` (>=1 completed session in each of the last N
   * consecutive calendar weeks) or `target_total_sessions` (lifetime
   * completed-session count) is set per milestone. */
  | 'consistency'
  /** vNext Handoff 02. No `exercise_id` required. `target_program_id`
   * points at a Program; achieved once every `ProgramDay` across every
   * `ProgramWeek` has at least one completed `WorkoutOccurrence`. */
  | 'program_completion'
  /** vNext Handoff 02. No `exercise_id` required on the milestone itself
   * (though the underlying benchmark usually has one). `target_benchmark_id`
   * + `target_percentile` are checked against benchmark achievements the
   * caller precomputes and passes in -- milestone-engine does not depend on
   * benchmark-engine directly. */
  | 'benchmark_threshold';

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
  /** vNext Handoff 02. 'body_weight' dimension only. */
  target_body_weight?: number | null;
  /** vNext Handoff 02. 'consistency' dimension only -- exactly one of this
   * or `target_total_sessions` is set. */
  target_consecutive_weeks?: number | null;
  /** vNext Handoff 02. 'consistency' dimension only. */
  target_total_sessions?: number | null;
  /** vNext Handoff 02. 'program_completion' dimension only. */
  target_program_id?: string | null;
  /** vNext Handoff 02. 'benchmark_threshold' dimension only -- both set together. */
  target_benchmark_id?: string | null;
  target_percentile?: number | null;
  /** vNext Handoff 04A. 'benchmark_threshold' only -- how the percentile that achieved this goal was derived, stamped once when it is achieved and never re-read under a different method or benchmark version afterwards (an achieved milestone is never re-evaluated). Absent on any milestone achieved before this field existed. */
  achieved_benchmark_evaluation?: BenchmarkEvaluationProvenance | null;
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
 * vNext Handoff 04A. How a benchmark row's percentile may be derived.
 *
 * - `strict_anchor`: `percentile_thresholds` are documented anchors. A result
 *   reports the highest anchor it reaches -- never a value between two.
 * - `validated_model`: an explicitly validated continuous model. None exists
 *   yet; the value is reserved, and nothing evaluates it, so it yields no claim.
 * - `legacy_interpolated`: the v0.0.7 rows -- ATLAS-modeled points that were
 *   meant to be linearly interpolated. Historical/compatibility only: never
 *   the basis of a current claim (see `benchmarkEvaluationMethod`).
 */
export type BenchmarkEvaluationMethod = 'strict_anchor' | 'validated_model' | 'legacy_interpolated';

/** vNext Handoff 04A. What a benchmark result was derived from -- a current claim is only ever made with one of these. */
export interface BenchmarkEvaluationProvenance {
  method: Exclude<BenchmarkEvaluationMethod, 'legacy_interpolated'>;
  dataset_version: string;
  benchmark_version: string;
}

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
  /** vNext Handoff 02. New, optional provenance/eligibility fields for the
   * stricter benchmark-registry infrastructure -- additive alongside the
   * existing v0.0.7 rows, which are left exactly as stored. Absent on every
   * v0.0.7 row; since Handoff 04A a row missing them yields no current
   * comparison (`evaluateBenchmarkStrict`) rather than an interpolated one.
   * See docs/BENCHMARKS.md. */
  test_protocol_id?: string | null;
  /** 'higher_is_better' (strength, reps, distance) or 'lower_is_better'
   * (assistance load, timed-course results). Absent is treated as
   * 'higher_is_better', matching every metric seeded so far. */
  direction?: 'higher_is_better' | 'lower_is_better';
  unit?: string | null;
  geography?: string | null;
  population_type?: string | null;
  doi_or_identifier?: string | null;
  limitations?: string | null;
  /** Distinct from `dataset_version` (the seeded-data-file version) --
   * this versions the benchmark DEFINITION row itself. */
  benchmark_version?: string | null;
  /** vNext Handoff 04A. Absent on every v0.0.7 row, which therefore reads as
   * `legacy_interpolated` -- the row is left exactly as stored, never
   * rewritten. See docs/BENCHMARKS.md "Authority (Handoff 04A)". */
  evaluation_method?: BenchmarkEvaluationMethod | null;
}
