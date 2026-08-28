import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { WorkoutSession } from '@atlas/data-model';
import type { StartSessionInput } from './session';

function touch(session: WorkoutSession): Pick<WorkoutSession, 'updated_at' | 'version'> {
  return { updated_at: new Date().toISOString(), version: session.version + 1 };
}

/** Adds a per-exercise skip; the planned slot stays in planned_snapshot untouched, just marked skipped. */
export function skipExerciseInSession(
  session: WorkoutSession,
  exerciseId: string,
  reason: string | null,
): WorkoutSession {
  if (session.skipped_exercises.some((s) => s.exercise_id === exerciseId)) return session;
  const entry = {
    exercise_id: exerciseId,
    reason: reason || null,
    skipped_at: new Date().toISOString(),
  };
  return {
    ...session,
    skipped_exercises: [...session.skipped_exercises, entry],
    ...touch(session),
  };
}

/** Undo before finish -- just removes the skip marker, nothing else was mutated. */
export function unskipExerciseInSession(
  session: WorkoutSession,
  exerciseId: string,
): WorkoutSession {
  return {
    ...session,
    skipped_exercises: session.skipped_exercises.filter((s) => s.exercise_id !== exerciseId),
    ...touch(session),
  };
}

export interface SkipWorkoutInput extends StartSessionInput {
  reason: string | null;
}

/**
 * A whole-workout skip recorded from Today, before Gym Mode is ever entered
 * -- distinct from discardWorkoutSession, which abandons a session already
 * in progress. Reuses WorkoutSession/'skipped' rather than a separate entity
 * so it shows up wherever sessions are already queried.
 */
export function skipWorkoutSession(input: SkipWorkoutInput): WorkoutSession {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name: input.name,
    status: 'skipped',
    started_at: now,
    completed_at: null,
    program_id: input.programId,
    program_day_id: input.programDayId,
    template_id: input.templateId,
    planned_snapshot: input.plannedSnapshot.map((exercise) => ({ ...exercise })),
    performed_sets: [],
    session_note: null,
    active_timer: null,
    skipped_exercises: [],
    skip_reason: input.reason || null,
    replacements: [],
  };
}
