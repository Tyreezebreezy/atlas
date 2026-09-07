export type ProgressionPolicyKind = 'none' | 'double_progression' | 'linear_load' | 'timed';

/**
 * One shape covers all four kinds -- fields irrelevant to a given kind are
 * simply unused -- rather than a union type per kind, since callers
 * usually need "the configured increment" without a kind-specific
 * narrowing step first. Not a plugin system: a fifth kind is still a code
 * change here, deliberately (v0.2.0 handoff: "do not overbuild a plugin
 * language yet"). See docs/PROGRESSION.md.
 */
export interface ProgressionPolicy {
  kind: ProgressionPolicyKind;
  /** double_progression: load increment applied once every set reaches
   * target_reps_max. linear_load: load increment applied after every
   * successful session. Unused by 'none'/'timed'. */
  load_increment: number | null;
  /** timed: duration increment applied after every successful session. */
  duration_increment_seconds: number | null;
  /** timed: stop auto-progressing once target duration would reach this;
   * beyond it, another progression mechanism is required (handoff's own
   * wording) -- ATLAS just holds the target rather than picking one. */
  duration_ceiling_seconds: number | null;
}

export const NO_PROGRESSION: ProgressionPolicy = {
  kind: 'none',
  load_increment: null,
  duration_increment_seconds: null,
  duration_ceiling_seconds: null,
};

/**
 * 'suggest_advance' is distinct from 'advanced': a pure-bodyweight exercise
 * that hits its rep ceiling has nothing to auto-increment (no bar to add
 * plates to), so the decision surfaces a suggestion instead of silently
 * mutating the target -- see docs/PROGRESSION.md "Bodyweight ceiling."
 */
export type ProgressionResult =
  'first_time' | 'held' | 'advanced' | 'failed_held' | 'deload_excluded' | 'suggest_advance';

export interface ProgressionTargetSnapshot {
  target_weight: number | null;
  target_external_load: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_duration_seconds: number | null;
}

/**
 * The "why" behind a generated target, stored as structured evidence
 * rather than regenerated prose -- see docs/PROGRESSION.md. Lives on the
 * `PlannedExercise` it explains, which rides along for free wherever that
 * type is already snapshotted (`WorkoutSession.planned_snapshot`), so a
 * historical session keeps the exact explanation it had even if the
 * program or policy changes later.
 */
export interface ProgressionDecision {
  policy: ProgressionPolicyKind;
  previous_session_id: string | null;
  previous_target: ProgressionTargetSnapshot | null;
  previous_result: ProgressionResult;
  /** Short human-readable line, e.g. "Hold load until all sets reach target." */
  decision_summary: string;
  resulting_target: ProgressionTargetSnapshot;
  computed_at: string;
}
