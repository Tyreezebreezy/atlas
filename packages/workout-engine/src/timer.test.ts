import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import { startWorkoutSession } from './session';
import {
  DEFAULT_REST_SECONDS,
  adjustActiveTimer,
  clearActiveTimer,
  isTimerComplete,
  remainingSeconds,
  resolveRestSeconds,
  startExerciseTimer,
  startRestTimer,
} from './timer';
import type { Exercise } from '@atlas/data-model';

function makeSession() {
  return startWorkoutSession({
    name: 'Push Day',
    templateId: 't-1',
    programId: null,
    programDayId: null,
    plannedSnapshot: [createPlannedExercise('ex-1', 0)],
  });
}

describe('resolveRestSeconds', () => {
  it('prefers the workout-specific override over everything else', () => {
    const planned = { ...createPlannedExercise('ex-1', 0), rest_seconds: 45 };
    const exercise = { default_rest_seconds: 120 } as Exercise;
    expect(resolveRestSeconds(planned, exercise)).toBe(45);
  });

  it('falls back to the exercise default when the workout has none', () => {
    const planned = createPlannedExercise('ex-1', 0);
    const exercise = { default_rest_seconds: 120 } as Exercise;
    expect(resolveRestSeconds(planned, exercise)).toBe(120);
  });

  it('falls back to the global default when neither is set', () => {
    const planned = createPlannedExercise('ex-1', 0);
    expect(resolveRestSeconds(planned, undefined)).toBe(DEFAULT_REST_SECONDS);
  });
});

describe('rest and exercise timers', () => {
  it('startRestTimer computes ends_at from duration', () => {
    const now = new Date('2026-08-27T10:00:00.000Z');
    const session = startRestTimer(makeSession(), 'ex-1', 90, now);
    expect(session.active_timer?.kind).toBe('rest');
    expect(session.active_timer?.ends_at).toBe('2026-08-27T10:01:30.000Z');
  });

  it('startExerciseTimer replaces any existing timer', () => {
    const now = new Date('2026-08-27T10:00:00.000Z');
    let session = startRestTimer(makeSession(), 'ex-1', 90, now);
    session = startExerciseTimer(session, 'ex-2', 60, now);
    expect(session.active_timer?.kind).toBe('exercise');
    expect(session.active_timer?.exercise_id).toBe('ex-2');
  });

  it('remainingSeconds derives from ends_at, never a stored countdown', () => {
    const start = new Date('2026-08-27T10:00:00.000Z');
    const session = startRestTimer(makeSession(), 'ex-1', 90, start);
    const timer = session.active_timer!;
    expect(remainingSeconds(timer, new Date('2026-08-27T10:00:30.000Z'))).toBe(60);
    expect(remainingSeconds(timer, new Date('2026-08-27T10:05:00.000Z'))).toBe(0);
  });

  it('isTimerComplete is true once now passes ends_at', () => {
    const start = new Date('2026-08-27T10:00:00.000Z');
    const session = startRestTimer(makeSession(), 'ex-1', 10, start);
    const timer = session.active_timer!;
    expect(isTimerComplete(timer, new Date('2026-08-27T10:00:05.000Z'))).toBe(false);
    expect(isTimerComplete(timer, new Date('2026-08-27T10:00:11.000Z'))).toBe(true);
  });

  it('adjustActiveTimer shifts ends_at without moving started_at', () => {
    const start = new Date('2026-08-27T10:00:00.000Z');
    let session = startRestTimer(makeSession(), 'ex-1', 90, start);
    session = adjustActiveTimer(session, 15);
    expect(session.active_timer?.started_at).toBe(start.toISOString());
    expect(session.active_timer?.duration_seconds).toBe(105);
    expect(session.active_timer?.ends_at).toBe('2026-08-27T10:01:45.000Z');

    session = adjustActiveTimer(session, -30);
    expect(session.active_timer?.duration_seconds).toBe(75);
  });

  it('adjustActiveTimer on a session with no active timer is a no-op', () => {
    const session = makeSession();
    expect(adjustActiveTimer(session, 15)).toBe(session);
  });

  it('clearActiveTimer removes the timer', () => {
    const session = startRestTimer(makeSession(), 'ex-1', 90);
    const cleared = clearActiveTimer(session);
    expect(cleared.active_timer).toBeNull();
  });
});
