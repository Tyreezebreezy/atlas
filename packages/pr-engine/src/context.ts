import type { WorkoutSession } from '@atlas/data-model';
import { exerciseEquipmentIdOf } from '@atlas/workout-engine';

/**
 * vNext Handoff 04B. The comparable context a performance belongs to: the
 * training location AND the actual machine/implement the exercise was done on.
 *
 * "Same gym" is not "same resistance". Two chest-press machines at one gym, or
 * one machine's 170 and another's 170, are different series, so PRs, headline
 * PR events, stall detection, the Strength chart and the first-exposure
 * baseline all scope by this context -- never by the location alone. History
 * recorded before equipment was captured has `null` for both parts (or just
 * `gym_equipment_id` null), which is its own valid context: it is never
 * assigned a gym or a machine after the fact.
 *
 * This is the only place a session is turned into a context; every consumer
 * calls `performanceContextOf` / `performanceContextKey`.
 */
export interface PerformanceContext {
  training_location_id: string | null;
  gym_equipment_id: string | null;
}

/** Anything carrying the two parts of a context -- a session's, a stored record's, an event's. */
export interface PerformanceContextParts {
  training_location_id?: string | null;
  gym_equipment_id?: string | null;
}

/** The context one exercise ran in during one session: the session's location, and the actual machine recorded for this exercise (null when none was). */
export function performanceContextOf(
  session: WorkoutSession,
  exerciseId: string,
): PerformanceContext {
  return {
    training_location_id: session.training_location_id ?? null,
    gym_equipment_id: exerciseEquipmentIdOf(session, exerciseId),
  };
}

/** A stable string identity for a context (two contexts are the same series iff their keys are equal). */
export function performanceContextKey(context: PerformanceContextParts): string {
  return JSON.stringify([context.training_location_id ?? null, context.gym_equipment_id ?? null]);
}

/** `performanceContextKey(performanceContextOf(...))`, for grouping a session's sets. */
export function sessionContextKey(session: WorkoutSession, exerciseId: string): string {
  return performanceContextKey(performanceContextOf(session, exerciseId));
}

/** The context with no location and no equipment: all history from before either was recorded. */
export const UNSPECIFIED_CONTEXT_KEY = performanceContextKey({});

/**
 * The sessions an exercise should be compared with when it is about to be done
 * in `context` -- for "Last time" and for the progression baseline.
 *
 * - If the exercise has already been done in THIS context (this machine, at this
 *   place), compare with those: 170 on Chest Press #1 is measured against the
 *   last time on Chest Press #1, not against a lighter machine across town.
 * - If it has not, fall back to every session. A new machine, or a gym the
 *   owner is trying for the first time, still gets a starting point from the
 *   same program rather than a blank page -- the second gym with heavier
 *   dumbbells can carry on from where the first left off.
 *
 * Records, headline PRs and the Strength chart are stricter and never fall back;
 * this is only a convenience for choosing what to show and progress from.
 */
export function sessionsPreferringContext(
  sessions: WorkoutSession[],
  exerciseId: string,
  context: PerformanceContextParts,
): WorkoutSession[] {
  const key = performanceContextKey(context);
  const same = sessions.filter(
    (session) =>
      session.status === 'completed' &&
      session.performed_sets.some((set) => set.exercise_id === exerciseId) &&
      sessionContextKey(session, exerciseId) === key,
  );
  return same.length > 0 ? same : sessions;
}
