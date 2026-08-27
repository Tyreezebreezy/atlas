import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { PerformedSet, PlannedExercise, SetType, WorkoutSession } from '@atlas/data-model';

export interface StartSessionInput {
  name: string;
  templateId: string | null;
  programId: string | null;
  programDayId: string | null;
  plannedSnapshot: PlannedExercise[];
}

/**
 * The snapshot is copied at start time, not a live reference -- editing the
 * source template/program afterward must never rewrite this session's history.
 */
export function startWorkoutSession(input: StartSessionInput): WorkoutSession {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name: input.name,
    status: 'in_progress',
    started_at: now,
    completed_at: null,
    program_id: input.programId,
    program_day_id: input.programDayId,
    template_id: input.templateId,
    planned_snapshot: input.plannedSnapshot.map((exercise) => ({ ...exercise })),
    performed_sets: [],
    session_note: null,
  };
}

export interface LogSetInput {
  exerciseId: string;
  setIndex: number;
  setType: SetType;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
  rir: number | null;
  notes: string | null;
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
    set_type: input.setType,
    weight: input.weight,
    reps: input.reps,
    duration_seconds: input.durationSeconds,
    distance_meters: input.distanceMeters,
    rpe: input.rpe,
    rir: input.rir,
    completed_at: new Date().toISOString(),
    notes: input.notes,
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

export function completeWorkoutSession(session: WorkoutSession): WorkoutSession {
  const now = new Date().toISOString();
  return {
    ...session,
    status: 'completed',
    completed_at: now,
    updated_at: now,
    version: session.version + 1,
  };
}

/** Durable status change, not a delete -- keeps abandoned sessions auditable/syncable. */
export function discardWorkoutSession(session: WorkoutSession): WorkoutSession {
  return { ...session, status: 'discarded', ...touch(session) };
}
