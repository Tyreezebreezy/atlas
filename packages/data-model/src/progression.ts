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
  /**
   * vNext Handoff 01 (§8). Extended rep range used ONLY once equipment
   * has no next available load (see `@atlas/program-engine`'s
   * `recommendProgression`) -- e.g. normal range 8-12, ceiling extension
   * to 15-20. Null means no configured extension: hitting the equipment
   * max with the normal range already exhausted goes straight to
   * `PROGRAM_REVIEW_REQUIRED` instead of a made-up cap. Deliberately a
   * per-policy field, not a hardcoded engine constant (research pack §4.2:
   * "do not hard-code one universal ceiling rep cap"). Optional (like
   * `is_deload`/`media` elsewhere in this codebase) so every
   * `ProgressionPolicy` literal that predates this field keeps compiling
   * unchanged; read via `?? null`, never assumed present.
   */
  ceiling_reps_max?: number | null;
  /**
   * vNext Handoff 01 (§4.1/§8.4): the largest single-step load increase
   * `recommendProgression` (in `@atlas/program-engine`) will suggest from
   * equipment data before treating it as "too large" and falling back to
   * rep progression instead -- e.g. a next available load 25 lb above the
   * last one might be a bigger single jump than the owner wants
   * recommended even though the equipment technically offers it. Optional
   * and null-safe like `ceiling_reps_max`; null means no configured
   * ceiling on jump size (any next available load is offered as-is).
   */
  max_acceptable_load_jump?: number | null;
  /**
   * vNext Handoff 02 (research pack v2 §9). How many reps short of the
   * planned target an earlier set in the SAME session must fall before a
   * later set's target is reduced to match demonstrated capacity -- e.g. a
   * planned "80x15, 80x14, 80x13" where Set 1 actually comes in at 80x10
   * (5 short) should not leave Set 2's target sitting at a now-unrealistic
   * 14. Null/absent uses a restrained default (3 reps) rather than reacting
   * to ordinary set-to-set variance of a rep or two.
   */
  current_session_shortfall_reps?: number | null;
}

export const NO_PROGRESSION: ProgressionPolicy = {
  kind: 'none',
  load_increment: null,
  duration_increment_seconds: null,
  duration_ceiling_seconds: null,
  ceiling_reps_max: null,
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

/**
 * vNext Handoff 01 (§7). Structured reason codes, never generated prose --
 * research pack §1: "No LLM is required for normal workout progression."
 * `computeProgressionDecision`'s own `ProgressionResult` is the proven,
 * tested source of truth underneath; these are the richer, equipment-aware
 * vocabulary `recommendProgression` (in `@atlas/program-engine`) maps it
 * onto -- see that function's doc comment for the exact mapping.
 */
export type ProgressionReasonCode =
  | 'FIRST_EXPOSURE'
  | 'WITHIN_REP_RANGE'
  | 'TOP_OF_RANGE'
  | 'NEXT_LOAD_AVAILABLE'
  | 'NEXT_LOAD_TOO_LARGE'
  | 'EQUIPMENT_MAX_REACHED'
  | 'BELOW_TARGET_RANGE'
  | 'CURRENT_SESSION_FATIGUE'
  | 'PROGRAM_REVIEW_REQUIRED'
  /** vNext Handoff 02 (research pack v2 §9). Distinct from
   * `CURRENT_SESSION_FATIGUE` (which marks a whole session `is_deload`,
   * excluding it from NEXT session's baseline lookup) -- this fires WITHIN
   * a session, adjusting a later set's target reps down after an earlier
   * set in the SAME session came in meaningfully short, so the next target
   * reflects demonstrated capacity rather than a now-unrealistic plan. */
  | 'CURRENT_SESSION_BELOW_TARGET';

export type ProgressionAction =
  | 'increase_load'
  | 'increase_reps'
  | 'hold'
  | 'reduce'
  | 'establish_baseline'
  | 'review';

/** How much this recommendation should be trusted -- 'none' when the
 * exercise's measurement type has no implemented strategy yet (§9: "a
 * typed 'not yet supported' path is preferable" over a faked one). */
export type ProgressionDataState = 'normal' | 'first_exposure' | 'not_yet_supported';

export interface ProgressionRecommendation {
  strategy_id: ProgressionPolicyKind;
  target_load: number | null;
  target_reps: number | null;
  target_duration: number | null;
  target_distance: number | null;
  action: ProgressionAction;
  reason_code: ProgressionReasonCode;
  data_state: ProgressionDataState;
  /** Set only when an equipment constraint (a max, or "next load too far
   * off") actually changed the outcome versus the unconstrained decision. */
  constraint_applied: string | null;
}
