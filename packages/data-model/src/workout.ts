import type { OwnerStarterPackProvenance, SyncMeta } from './sync';
import type { ProgressionDecision, ProgressionPolicy } from './progression';

/**
 * v0.2.0. Split out of the old overloaded `SetType` (which conflated
 * "warmup vs. work" with "normal vs. amrap/drop/etc." into one enum -- see
 * docs/DATA_MODEL.md's v0.1.1 "Set-type flexibility" note for the prior
 * shape). A set from before this field existed has no `phase` at runtime
 * despite the required type; every read site goes through `setPhaseOf()`
 * (`packages/workout-engine/src/setClassification.ts`), which falls back
 * to the old `set_type === 'warmup'` convention, rather than reading
 * `.phase` directly. See docs/PROGRESSION.md "Set phase migration."
 */
export type SetPhase = 'warmup' | 'work';

/** v0.2.0: 'working' and 'warmup' (the phase, mixed into this enum before
 * the split above) are no longer produced by new code -- 'working' maps to
 * 'normal' via `setTypeOf()`, and warmup-ness now lives on `phase`. New:
 * 'rest_pause'. Old stored values are never rewritten in place; read sites
 * normalize through `setTypeOf()`, never this literal union, for the same
 * reason as `setPhaseOf()` above. */
export type SetType = 'normal' | 'amrap' | 'failure' | 'drop' | 'rest_pause';

/**
 * Timestamp-based, not decrement-based: `ends_at` is always the source of
 * truth for remaining time (`ends_at - now()`), never a live countdown
 * that's trusted across a backgrounding/resume. `+15/-15` adjustments and
 * pause-free resilience both fall out of recomputing `ends_at` rather than
 * tracking elapsed ticks. See docs/DATA_MODEL.md.
 */
export interface TimerState {
  kind: 'rest' | 'exercise';
  /** The exercise this timer belongs to -- rest-after or the timed exercise itself. */
  exercise_id: string;
  started_at: string;
  duration_seconds: number;
  ends_at: string;
}

export interface SkippedExercise {
  exercise_id: string;
  reason: string | null;
  skipped_at: string;
}

export interface ExerciseReplacement {
  original_exercise_id: string;
  replacement_exercise_id: string;
  reason: string | null;
  /** 'today' touches only this session; 'program' also updates the source WorkoutTemplate. */
  scope: 'today' | 'program';
  replaced_at: string;
}

/** The planned side: a target prescription, never a performed value.
 * `group_id` is null for a normal, ungrouped exercise (every exercise ever
 * planned before v0.1.1's Stage 4B, and the common case after it) or the
 * id of an `ExerciseGroup` in the same template/session for a superset or
 * circuit member. Members of one group are the consecutive
 * PlannedExercise entries sharing a `group_id` -- there's no separate
 * grouped-exercises array to keep in sync. */
export interface PlannedExercise {
  id: string;
  exercise_id: string;
  order: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight: number | null;
  /** v0.2.0. Target added load for a weighted bodyweight movement -- the
   * planned-side counterpart to `PerformedSet.external_load`, kept
   * separate from `target_weight` for the same reason. Optional, same
   * reasoning as `progression_policy` below. */
  target_external_load?: number | null;
  target_rpe: number | null;
  target_rir: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
  rest_seconds: number | null;
  notes: string | null;
  group_id: string | null;
  /** v0.2.0. Exercise-level progression override -- wins over
   * `Program.default_progression_policy` when set. Optional (not
   * required + null like most fields here) for the same reason as
   * `ExerciseMedia.provider`: a PlannedExercise from before this field
   * existed has no opinion, and nothing derives a required fallback from
   * its absence -- `effectiveProgressionPolicy()` in
   * `packages/program-engine/src/progressionPolicy.ts` already treats
   * missing and `null` identically. */
  progression_policy?: ProgressionPolicy | null;
  /** v0.2.0. Populated only on the copy inside
   * `WorkoutSession.planned_snapshot` at session-start time -- never on a
   * WorkoutTemplate's own `exercises[]`, since provenance describes a
   * specific session's target, not a reusable plan. See
   * docs/PROGRESSION.md. */
  progression_decision?: ProgressionDecision | null;

  /** v0.2.5. Optional exercise -- visible in Gym Mode but does NOT count
   * toward workout completion. Absent = required (the pre-v0.2.5 default,
   * and every ordinary exercise). Read via `isOptionalExercise()`
   * (packages/workout-engine/src/slotCompletion.ts), never directly. */
  is_optional?: boolean;

  /** v0.2.5. OR-slot membership -- exercises sharing one non-null
   * `or_group` are equivalent selections ("Assisted Pull-Up OR Lat
   * Pulldown"): completing any ONE member satisfies the whole slot, the
   * others become satisfied-by-delegation. Mirrors `group_id`'s
   * "consecutive entries sharing an id" convention without introducing a
   * parallel array. Read via `orGroupMembers()`/`exerciseSlotComplete()`
   * (packages/workout-engine/src/slotCompletion.ts). */
  or_group?: string | null;

  /** v0.2.5. Warm-up execution vocabulary. Warm-up slots don't always have
   * a meaningful reps target -- "Bike 4 min" is timed, "Scapular push-ups
   * x10" is reps, "brief shoulder/lat stretch" is simply done/not-done.
   * Absent = no explicit mode (treat like a normal exercise). Warm-ups are
   * still excluded from PRs/progression/volume regardless of this field --
   * see `setPhaseOf` and `eligibleSets`. */
  warmup_execution?: 'done' | 'reps' | 'timed';

  /** v0.2.5. Work Timer toggle + optional explicit duration. When true the
   * exercise has a work timer (the timed hold itself -- plank, dead hang,
   * mobility hold). `work_timer_seconds` wins over
   * `target_duration_seconds` as the timer length when set. Absent = no
   * explicit work timer (the pre-v0.2.5 default: only `time`-measured
   * exercises had one, implicitly via `target_duration_seconds`). */
  work_timer_enabled?: boolean;
  work_timer_seconds?: number | null;

  /** v0.2.5. Rest Timer toggle. When false, completing a set for this
   * exercise does NOT auto-start a rest timer (mobility holds, easy warm-up
   * work). Absent = true (auto-rest fires, the pre-v0.2.5 default). */
  rest_timer_enabled?: boolean;

  /** v0.2.5. Per-set goal for the "Goal vs Actual" display -- the number
   * the owner aims for within `target_reps_min/max` (the program range).
   * Null/absent = no goal chosen yet (the range is shown, the owner picks).
   * Distinct from the program prescription: the range is what's programmed,
   * the goal is today's intent, the performed set is the actual. */
  goal_reps?: number | null;
  /** v0.2.5. Same as `goal_reps` for a timed hold -- goal duration in
   * seconds (e.g. Side Plank 30s goal within a 20-40s program range). */
  goal_duration_seconds?: number | null;
}

export type ExerciseGroupType = 'superset' | 'circuit';

/** A superset (2 exercises) or circuit (2+), executed round by round --
 * one set of each member, in order, before repeating. `rest_after_seconds`
 * is the rest after finishing a full round (after the group's last
 * member), not between members within a round. Added in v0.1.1 (Stage
 * 4B); a template/session from before has no `groups` array at runtime
 * despite the required type -- see workoutGroups.ts's helpers. */
export interface ExerciseGroup {
  id: string;
  type: ExerciseGroupType;
  rounds: number;
  rest_after_seconds: number | null;
  /** v0.2.0. Rest inserted after EACH member's set, before the next member
   * in the round -- distinct from `rest_after_seconds` (after the whole
   * round). Null/absent (the pre-v0.2.0 and default behavior): no rest
   * between members, matching the owner's Pre-Going-Out Pump guide's
   * "Exercise A -> Exercise B -> end round -> rest" structure. See
   * docs/DATA_MODEL.md "Rest hierarchy." */
  member_rest_seconds?: number | null;
}

/**
 * A reusable planned workout. `is_quick_workout: true` is what makes it appear
 * in the Quick Workout library (independent of any program) instead of only
 * being reachable through a ProgramDay — see docs/DATA_MODEL.md rather than a
 * separate QuickWorkout type, since the two are the same shape.
 */
export interface WorkoutTemplate extends SyncMeta {
  name: string;
  exercises: PlannedExercise[];
  is_quick_workout: boolean;
  groups: ExerciseGroup[];
  /** v0.2.0. See `Program.import_fingerprint`'s doc comment -- same
   * mechanism, for a standalone/Quick Workout import. */
  import_fingerprint?: string | null;
  /** v0.2.1. See `OwnerStarterPackProvenance`'s doc comment. */
  starter_pack?: OwnerStarterPackProvenance | null;
}

export type WorkoutSessionStatus = 'in_progress' | 'completed' | 'discarded' | 'skipped';

export interface WorkoutSession extends SyncMeta {
  name: string;
  status: WorkoutSessionStatus;
  started_at: string;
  completed_at: string | null;
  /** v0.2.0. Set only for a historical ("Log Past Workout") entry, where
   * `started_at` is backdated and the real elapsed time isn't being lived
   * through in real time -- `completeWorkoutSession` uses this as
   * `completed_at` when present (and clears it), falling back to the
   * actual current time for every normal session, exactly the pre-v0.2.0
   * behavior. See docs/DATA_MODEL.md "Historical workouts." */
  planned_completed_at?: string | null;
  program_id: string | null;
  program_day_id: string | null;
  template_id: string | null;
  /**
   * v0.2.4. The Program occurrence's ORIGINAL calendar date (YYYY-MM-DD)
   * this session fulfills -- e.g. Monday, even when this session's own
   * `started_at`/`completed_at` fall on Tuesday because the owner
   * performed a missed workout late. Distinct from (and orthogonal to)
   * `started_at`: this session is still a normal LIVE session with a
   * real-time `started_at`, never backdated -- only "Log Past Workout"
   * backdates `started_at`/`completed_at` (see `planned_completed_at`
   * above). Null for Freestyle/Quick Workouts (no program day at all) and
   * for a "Do Again" rerun of an already-completed occurrence: leaving it
   * unset there is what tells `resolveOccurrenceCompletion` not to touch
   * the occurrence a prior session already completed. See
   * docs/DATA_MODEL.md "Scheduled vs. performed date."
   */
  scheduled_date?: string | null;
  /**
   * Copied from the template/program day at session start — never a live
   * reference. Editing or deleting the program later must not rewrite this
   * session's history, so this snapshot is the session's own permanent record
   * of what was planned.
   */
  planned_snapshot: PlannedExercise[];
  /** Snapshotted alongside planned_snapshot, same reason: editing the
   * template's groups later must not rewrite this session's history. */
  groups: ExerciseGroup[];
  performed_sets: PerformedSet[];
  /** 1:1 with the session, so it lives here rather than as a separate entity. */
  session_note: string | null;
  /** Null when no rest/exercise timer is currently running. */
  active_timer: TimerState | null;
  /** Per-exercise skips within an otherwise in-progress session; undoable before finish. */
  skipped_exercises: SkippedExercise[];
  /** Only set when status is 'skipped' -- the whole workout was declined, not started. */
  skip_reason: string | null;
  replacements: ExerciseReplacement[];
  /** v0.2.0. Fully logged, fully eligible for PRs -- this only tells
   * progression-baseline lookup to skip this session when finding "the
   * last normal session to progress from" (see
   * `packages/program-engine/src/progressionDecision.ts`). Absent/false
   * on every session before this field existed and on every normal
   * session going forward. */
  is_deload?: boolean;
  /** v0.2.0. Most-specific tier of the rest hierarchy -- set for the
   * remainder of this one session only, never written back to the
   * template/program. See docs/DATA_MODEL.md "Rest hierarchy." */
  rest_override_seconds?: number | null;
  /** v0.2.5. Execution mode for this session -- 'paired' runs superset/circuit
   * groups round-by-round (the pre-v0.2.5 and default behavior); 'normal'
   * runs the same planned exercises one at a time even when the Program
   * authoring defines A1/A2 blocks, without deleting or rewriting the
   * group metadata. Absent = 'paired' (see `executionModeOf`). Logged sets
   * are keyed by exercise_id, so switching modes mid-workout never loses
   * work. */
  execution_mode?: 'normal' | 'paired';
  /** vNext Handoff 02. Which `TrainingLocation` this session happened at,
   * when known -- session-level granularity (matches real gym usage: one
   * location for the whole session), not per-set. Absent/null for every
   * session before this field existed and for any session where the owner
   * never recorded one. Drives equipment-scoped PR/rep-at-load series (see
   * docs/PRS.md); a session with no location simply falls into the
   * legacy/unscoped series alongside all pre-existing history, exactly like
   * "no equipment data" is never treated as "at max" in the Handoff 01
   * progression work. */
  training_location_id?: string | null;
}

export interface PerformedSet {
  id: string;
  exercise_id: string;
  set_index: number;
  set_type: SetType;
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: number | null;
  rir: number | null;
  completed_at: string;
  notes: string | null;
  /** v0.2.0. See the `SetPhase` doc comment above for the migration story.
   * Read via `setPhaseOf()`, never this field directly, so a pre-v0.2.0
   * set (which has none) is classified correctly. */
  phase?: SetPhase;
  /** v0.2.0. Added load for a weighted bodyweight movement (e.g. a dip
   * belt on a weighted pull-up) -- kept separate from `weight`, which
   * means something different (a barbell/dumbbell/machine load for a
   * `reps_weight` exercise) and must never be conflated with it. Null for
   * every `reps_weight` set and for an unweighted `reps_bodyweight` set.
   * See docs/PROGRESSION.md "Bodyweight." */
  external_load?: number | null;
  /** vNext Handoff 02 (research pack v2 §6/§22). How `weight` should be
   * interpreted -- absent/null means "unknown, treat as displayed/total
   * load" (every set logged before this field existed, and any set logged
   * without an opinion). Never inferred or backfilled from exercise name;
   * only ever set when something upstream actually knows. Comparison logic
   * (PR series, e1RM eligibility) treats two sets with differing non-null
   * semantics as incompatible rather than silently merging or doubling
   * either value. */
  load_semantics?: LoadSemantics | null;
}

/** `dumbbell_per_hand`: `weight` is the load in ONE hand, never doubled for
 * display or comparison. `assistance_load`: lower is better (an assisted
 * pull-up/dip machine) -- inverted-direction comparison, not yet consumed
 * by pr-engine (no assisted `MeasurementType` exists yet, see
 * docs/PRS.md "Deferred: assisted bodyweight"). */
export type LoadSemantics =
  | 'barbell_total'
  | 'dumbbell_per_hand'
  | 'machine_displayed'
  | 'cable_displayed'
  | 'added_bodyweight'
  | 'assistance_load';
