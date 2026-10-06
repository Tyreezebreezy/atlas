import {
  captureLocalTimeContext,
  getOrCreateDeviceId,
  localDateOfInstant,
  newId,
} from '@atlas/core';
import { mergeRepeatedExercises } from './uniqueExercises';
import type {
  ExerciseGroup,
  PerformedSet,
  PlannedExercise,
  SetPhase,
  SetType,
  WorkoutSession,
} from '@atlas/data-model';

export interface StartSessionInput {
  name: string;
  templateId: string | null;
  programId: string | null;
  programDayId: string | null;
  plannedSnapshot: PlannedExercise[];
  /** Optional -- most workouts have no groups. Defaults to []. */
  groups?: ExerciseGroup[];
  /** v0.2.0. Backdates the session for "Log Past Workout" -- omit for a
   * normal session starting now. When set, pass `plannedCompletedAt` too
   * so the eventual `completeWorkoutSession` call also lands on the
   * correct historical date rather than the moment Finish happens to be
   * tapped. */
  startedAt?: string;
  plannedCompletedAt?: string | null;
  /** v0.2.4. The Program occurrence's original date this session
   * fulfills -- orthogonal to `startedAt`/`plannedCompletedAt` above.
   * Starting Monday's missed workout live on Tuesday sets this to
   * Monday's date while `startedAt` stays unset (a normal, real-time
   * session); only Log Past Workout backdates `startedAt`. Omit for
   * Freestyle/Quick Workouts and for a "Do Again" rerun -- see
   * `WorkoutSession.scheduled_date`'s doc comment. */
  scheduledDate?: string | null;
  /** vNext Handoff 04B. The `TrainingLocation` the workout is happening at.
   * Omitted/null = no location recorded (the owner has none set up, or chose
   * not to say) -- never guessed, and never blocks starting. */
  trainingLocationId?: string | null;
  /** vNext Handoff 04B. The calendar day (YYYY-MM-DD) a historical entry
   * counts toward -- for "Log Past Workout" the date the owner picked IS the
   * day. Omit for a live session, which records the device's own date. */
  performedLocalDate?: string | null;
}

/**
 * What a new session records about when it happened. A live session takes the
 * device's clock: its calendar day, its IANA zone and its UTC offset, so the
 * day it counts toward never moves when the viewer later travels. A backdated
 * session (`startedAt` given) was not performed "now", so the zone of this
 * device proves nothing about where it was done: only the calendar day is
 * recorded -- the one the owner picked, or the day `startedAt` falls on here --
 * and the zone fields stay unset rather than invented.
 */
function localTimeFor(input: StartSessionInput): {
  performed_local_date: string;
  time_zone_id: string | null;
  utc_offset_minutes: number | null;
} {
  if (input.performedLocalDate) {
    return {
      performed_local_date: input.performedLocalDate,
      time_zone_id: null,
      utc_offset_minutes: null,
    };
  }
  if (input.startedAt) {
    return {
      performed_local_date: localDateOfInstant(input.startedAt),
      time_zone_id: null,
      utc_offset_minutes: null,
    };
  }
  return captureLocalTimeContext();
}

/**
 * The snapshot is copied at start time, not a live reference -- editing the
 * source template/program afterward must never rewrite this session's history.
 */
export function startWorkoutSession(input: StartSessionInput): WorkoutSession {
  const now = new Date().toISOString();
  // A workout holds one entry per exercise: a template saved with a repeat is folded here (see uniqueExercises.ts).
  const unique = mergeRepeatedExercises(input.plannedSnapshot, input.groups ?? []);
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name: input.name,
    status: 'in_progress',
    started_at: input.startedAt ?? now,
    completed_at: null,
    planned_completed_at: input.plannedCompletedAt ?? null,
    program_id: input.programId,
    program_day_id: input.programDayId,
    template_id: input.templateId,
    scheduled_date: input.scheduledDate ?? null,
    planned_snapshot: unique.planned.map((exercise) => ({ ...exercise })),
    groups: unique.groups.map((group) => ({ ...group })),
    performed_sets: [],
    session_note: null,
    active_timer: null,
    skipped_exercises: [],
    skip_reason: null,
    replacements: [],
    training_location_id: input.trainingLocationId ?? null,
    ...localTimeFor(input),
  };
}

export interface LogSetInput {
  exerciseId: string;
  setIndex: number;
  /** Defaults to 'work' when omitted -- only a handful of pre-v0.2.0
   * callers (tests, mainly) construct this without an opinion on phase. */
  phase?: SetPhase;
  setType: SetType;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
  rir: number | null;
  notes: string | null;
  /** v0.2.0. Weighted-bodyweight added load -- see PerformedSet's doc comment. */
  externalLoad?: number | null;
  /** v0.2.0. Overrides the real-time "now" stamp -- pass the session's
   * `planned_completed_at` for a Log Past Workout session so this set's
   * chronology (PR attribution, cross-session ordering) reflects the
   * backdated date instead of the moment it was actually typed in. Unset
   * for every live session, so this is a no-op for normal logging. */
  completedAt?: string;
}

/**
 * Nothing is persisted until this is called -- a set being typed into is pure
 * UI state (a "draft"), not a durable record, until the user marks it done.
 */
export function createPerformedSet(input: LogSetInput): PerformedSet {
  return {
    id: newId(),
    exercise_id: input.exerciseId,
    set_index: input.setIndex,
    phase: input.phase ?? 'work',
    set_type: input.setType,
    weight: input.weight,
    reps: input.reps,
    duration_seconds: input.durationSeconds,
    distance_meters: input.distanceMeters,
    rpe: input.rpe,
    rir: input.rir,
    completed_at: input.completedAt ?? new Date().toISOString(),
    notes: input.notes,
    external_load: input.externalLoad ?? null,
  };
}

function touch(session: WorkoutSession): Pick<WorkoutSession, 'updated_at' | 'version'> {
  return { updated_at: new Date().toISOString(), version: session.version + 1 };
}

export function addPerformedSet(session: WorkoutSession, set: PerformedSet): WorkoutSession {
  return { ...session, performed_sets: [...session.performed_sets, set], ...touch(session) };
}

/** Only meant for uncompleted drafts in the UI layer -- removing a completed set is a deliberate, separately-confirmed action there, not a distinct engine function. */
export function removePerformedSet(session: WorkoutSession, setId: string): WorkoutSession {
  return {
    ...session,
    performed_sets: session.performed_sets.filter((s) => s.id !== setId),
    ...touch(session),
  };
}

export function setSessionNote(session: WorkoutSession, note: string): WorkoutSession {
  return { ...session, session_note: note || null, ...touch(session) };
}

/** Uses `session.planned_completed_at` (a historical entry's intended
 * completion date, see `StartSessionInput`) when present, instead of the
 * moment Finish happens to be tapped -- unset for every normal session, so
 * this is a no-op change for the pre-v0.2.0 behavior. */
export function completeWorkoutSession(session: WorkoutSession): WorkoutSession {
  const now = new Date().toISOString();
  return {
    ...session,
    status: 'completed',
    completed_at: session.planned_completed_at ?? now,
    planned_completed_at: null,
    active_timer: null,
    updated_at: now,
    version: session.version + 1,
  };
}

/** Durable status change, not a delete -- keeps abandoned sessions auditable/syncable. */
export function discardWorkoutSession(session: WorkoutSession): WorkoutSession {
  return { ...session, status: 'discarded', active_timer: null, ...touch(session) };
}

/**
 * v0.2.5. Resolves the session's execution mode, defaulting to 'paired' --
 * a session from before the field existed, or one whose mode was never set,
 * runs superset/circuit groups round-by-round exactly as it always did.
 */
export function executionModeOf(
  session: Pick<WorkoutSession, 'execution_mode'>,
): 'normal' | 'paired' {
  return session.execution_mode ?? 'paired';
}

/** v0.2.5. Sets the execution mode without touching any logged sets --
 * `performed_sets` are keyed by exercise_id, so switching Normal <-> Paired
 * mid-workout is a pure view change over the same data. The Program's group
 * metadata is never modified (this lives on the session only). */
export function setExecutionMode(
  session: WorkoutSession,
  mode: 'normal' | 'paired',
): WorkoutSession {
  return { ...session, execution_mode: mode, ...touch(session) };
}

export interface ExerciseGoal {
  goal_reps?: number | null;
  goal_duration_seconds?: number | null;
}

/**
 * v0.2.5. Persists the owner's editable per-set GOAL onto this exercise's
 * plan slot, separately from any ACTUAL logged sets (which live in
 * `performed_sets`). Only the supplied fields change -- a reps goal doesn't
 * clobber a duration goal and vice versa. The goal is a plan-slot value, so
 * it's snapshotted with the session and never mutates the template/program.
 */
export function setExerciseGoal(
  session: WorkoutSession,
  exerciseId: string,
  goal: ExerciseGoal,
): WorkoutSession {
  return {
    ...session,
    planned_snapshot: session.planned_snapshot.map((p) =>
      p.exercise_id === exerciseId ? { ...p, ...goal } : p,
    ),
    ...touch(session),
  };
}
