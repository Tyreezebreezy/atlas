import type {
  Exercise,
  ExerciseGroup,
  PlannedExercise,
  Program,
  TimerState,
  WorkoutSession,
} from '@atlas/data-model';

/** Weakest tier of the rest-duration hierarchy: used only when nothing more specific applies anywhere. */
export const DEFAULT_REST_SECONDS = 90;

export interface RestContext {
  /** Most specific tier -- set for the remainder of one session only. */
  session?: Pick<WorkoutSession, 'rest_override_seconds'> | null;
  planned: PlannedExercise;
  /** When resolving rest for a member mid-round (not after the round ends,
   * which uses `resolveGroupRestSeconds` instead), pass the group so its
   * `member_rest_seconds` tier applies between the exercise tier and the
   * program/library tiers. Omit for an ungrouped exercise. */
  group?: Pick<ExerciseGroup, 'member_rest_seconds'> | null;
  exercise?: Pick<Exercise, 'default_rest_seconds'> | null;
  program?: Pick<Program, 'default_rest_seconds'> | null;
}

/**
 * Rest-duration priority, most specific wins outright (no blending): a
 * session-only override for right now -> this plan slot's own rest ->
 * (mid-round only) the group's intra-round member rest -> the exercise
 * library's default -> the active program's default -> a global fallback.
 * See docs/DATA_MODEL.md "Rest hierarchy."
 */
export function resolveRestSeconds(ctx: RestContext): number {
  return (
    ctx.session?.rest_override_seconds ??
    ctx.planned.rest_seconds ??
    ctx.group?.member_rest_seconds ??
    ctx.exercise?.default_rest_seconds ??
    ctx.program?.default_rest_seconds ??
    DEFAULT_REST_SECONDS
  );
}

/**
 * Rest after a superset/circuit's full round (after its last member), not
 * between members within one -- see `ExerciseGroup.rest_after_seconds`'s
 * doc comment. When the group itself has no explicit value, falls back to
 * the longest of its members' own `rest_seconds` rather than picking
 * arbitrarily or defaulting to none -- the deterministic rule the v0.2.0
 * handoff asks for when members disagree ("preferred default: longest
 * relevant member rest"). Falls through the same session/exercise/program
 * tiers as `resolveRestSeconds` only once no group-level or member-level
 * value exists at all.
 */
export function resolveGroupRestSeconds(
  ctx: Omit<RestContext, 'planned' | 'group'> & {
    group: Pick<ExerciseGroup, 'rest_after_seconds'>;
    members: PlannedExercise[];
  },
): number {
  if (ctx.group.rest_after_seconds != null) return ctx.group.rest_after_seconds;
  const memberRests = ctx.members.map((m) => m.rest_seconds).filter((r): r is number => r != null);
  if (memberRests.length > 0) return Math.max(...memberRests);
  return (
    ctx.session?.rest_override_seconds ??
    ctx.exercise?.default_rest_seconds ??
    ctx.program?.default_rest_seconds ??
    DEFAULT_REST_SECONDS
  );
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
