import type { SyncMeta } from './sync';

export type SetType = 'working' | 'warmup' | 'drop' | 'amrap' | 'failure';

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

/** The planned side: a target prescription, never a performed value. */
export interface PlannedExercise {
  id: string;
  exercise_id: string;
  order: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight: number | null;
  target_rpe: number | null;
  target_rir: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
  rest_seconds: number | null;
  notes: string | null;
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
}

export type WorkoutSessionStatus = 'in_progress' | 'completed' | 'discarded' | 'skipped';

export interface WorkoutSession extends SyncMeta {
  name: string;
  status: WorkoutSessionStatus;
  started_at: string;
  completed_at: string | null;
  program_id: string | null;
  program_day_id: string | null;
  template_id: string | null;
  /**
   * Copied from the template/program day at session start — never a live
   * reference. Editing or deleting the program later must not rewrite this
   * session's history, so this snapshot is the session's own permanent record
   * of what was planned.
   */
  planned_snapshot: PlannedExercise[];
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
}
