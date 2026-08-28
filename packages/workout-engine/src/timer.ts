import type { Exercise, PlannedExercise, TimerState, WorkoutSession } from '@atlas/data-model';

/** Tier 3 of the rest-duration hierarchy: used only when neither the workout nor the exercise specifies one. */
export const DEFAULT_REST_SECONDS = 90;

/**
 * Rest-duration priority: workout-specific override (this template's planned
 * rest for this slot) -> exercise library default -> global fallback. Higher
 * tiers win outright rather than blending, so the source of a given rest
 * duration is always unambiguous.
 */
export function resolveRestSeconds(
  planned: PlannedExercise,
  exercise: Exercise | undefined,
): number {
  return planned.rest_seconds ?? exercise?.default_rest_seconds ?? DEFAULT_REST_SECONDS;
}

function timerFrom(
  kind: TimerState['kind'],
  exerciseId: string,
  durationSeconds: number,
  now: Date,
): TimerState {
  const started_at = now.toISOString();
  const ends_at = new Date(now.getTime() + durationSeconds * 1000).toISOString();
  return { kind, exercise_id: exerciseId, started_at, duration_seconds: durationSeconds, ends_at };
}

export function startRestTimer(
  session: WorkoutSession,
  exerciseId: string,
  durationSeconds: number,
  now: Date = new Date(),
): WorkoutSession {
  return {
    ...session,
    active_timer: timerFrom('rest', exerciseId, durationSeconds, now),
    updated_at: now.toISOString(),
    version: session.version + 1,
  };
}

export function startExerciseTimer(
  session: WorkoutSession,
  exerciseId: string,
  durationSeconds: number,
  now: Date = new Date(),
): WorkoutSession {
  return {
    ...session,
    active_timer: timerFrom('exercise', exerciseId, durationSeconds, now),
    updated_at: now.toISOString(),
    version: session.version + 1,
  };
}

/**
 * +15/-15 etc: shifts `ends_at` by delta without moving `started_at`, so
 * elapsed time stays correct regardless of when the adjustment happens. A
 * delta that pushes `ends_at` into the past is allowed -- `remainingSeconds`
 * naturally clamps that to 0, which is exactly "end the timer now" with no
 * separate clamping logic required.
 */
export function adjustActiveTimer(session: WorkoutSession, deltaSeconds: number): WorkoutSession {
  const timer = session.active_timer;
  if (!timer) return session;
  const newDuration = Math.max(0, timer.duration_seconds + deltaSeconds);
  const newEndsAt = new Date(new Date(timer.ends_at).getTime() + deltaSeconds * 1000).toISOString();
  return {
    ...session,
    active_timer: { ...timer, duration_seconds: newDuration, ends_at: newEndsAt },
    ...touch(session),
  };
}

export function clearActiveTimer(session: WorkoutSession): WorkoutSession {
  if (!session.active_timer) return session;
  return { ...session, active_timer: null, ...touch(session) };
}

export function remainingSeconds(timer: TimerState, now: Date = new Date()): number {
  return Math.max(0, Math.round((new Date(timer.ends_at).getTime() - now.getTime()) / 1000));
}

export function isTimerComplete(timer: TimerState, now: Date = new Date()): boolean {
  return remainingSeconds(timer, now) <= 0;
}

function touch(session: WorkoutSession): Pick<WorkoutSession, 'updated_at' | 'version'> {
  return { updated_at: new Date().toISOString(), version: session.version + 1 };
}
