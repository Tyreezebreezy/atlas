import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import { startWorkoutSession } from './session';
import {
  DEFAULT_REST_SECONDS,
  adjustActiveTimer,
  clearActiveTimer,
  isTimerComplete,
  remainingSeconds,
  resolveGroupRestSeconds,
  resolveRestSeconds,
  resolveWorkTimerSeconds,
  restTimerEnabled,
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
  it('a session override wins over everything else', () => {
    const planned = { ...createPlannedExercise('ex-1', 0), rest_seconds: 45 };
    expect(
      resolveRestSeconds({
        planned,
        session: { rest_override_seconds: 10 },
        exercise: { default_rest_seconds: 120 },
        program: { default_rest_seconds: 60 },
      }),
    ).toBe(10);
  });

  it('the plan slot rest wins over the group, exercise, and program tiers', () => {
    const planned = { ...createPlannedExercise('ex-1', 0), rest_seconds: 45 };
    const exercise = { default_rest_seconds: 120 } as Exercise;
    expect(resolveRestSeconds({ planned, group: { member_rest_seconds: 20 }, exercise })).toBe(45);
  });

  it('falls back to the group member rest (mid-round) before the exercise/program tiers', () => {
    const planned = createPlannedExercise('ex-1', 0);
    expect(
      resolveRestSeconds({
        planned,
        group: { member_rest_seconds: 30 },
        exercise: { default_rest_seconds: 120 },
      }),
    ).toBe(30);
  });

  it('falls back to the exercise default when nothing more specific is set', () => {
    const planned = createPlannedExercise('ex-1', 0);
    const exercise = { default_rest_seconds: 120 } as Exercise;
    expect(resolveRestSeconds({ planned, exercise })).toBe(120);
  });

  it('falls back to the program default below the exercise library default', () => {
    const planned = createPlannedExercise('ex-1', 0);
    expect(resolveRestSeconds({ planned, program: { default_rest_seconds: 75 } })).toBe(75);
  });

  it('falls back to the global default when nothing is set at any tier', () => {
    const planned = createPlannedExercise('ex-1', 0);
    expect(resolveRestSeconds({ planned })).toBe(DEFAULT_REST_SECONDS);
  });
});

describe('resolveGroupRestSeconds', () => {
  it('uses the group’s own configured rest_after_seconds when set', () => {
    expect(resolveGroupRestSeconds({ group: { rest_after_seconds: 45 }, members: [] })).toBe(45);
  });

  it('falls back to the longest member rest_seconds when the group has none configured', () => {
    const members = [
      { ...createPlannedExercise('a', 0), rest_seconds: 20 },
      { ...createPlannedExercise('b', 1), rest_seconds: 40 },
    ];
    expect(resolveGroupRestSeconds({ group: { rest_after_seconds: null }, members })).toBe(40);
  });

  it('falls through to the program default when neither the group nor any member has a rest value', () => {
    const members = [createPlannedExercise('a', 0), createPlannedExercise('b', 1)];
    expect(
      resolveGroupRestSeconds({
        group: { rest_after_seconds: null },
        members,
        program: { default_rest_seconds: 60 },
      }),
    ).toBe(60);
  });

  it('falls all the way back to the global default', () => {
    const members = [createPlannedExercise('a', 0)];
    expect(resolveGroupRestSeconds({ group: { rest_after_seconds: null }, members })).toBe(
      DEFAULT_REST_SECONDS,
    );
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

describe('restTimerEnabled', () => {
  it('defaults to true for a plan without the field', () => {
    expect(restTimerEnabled(createPlannedExercise('ex-1', 0))).toBe(true);
  });

  it('is false only when explicitly disabled', () => {
    expect(
      restTimerEnabled({ ...createPlannedExercise('ex-1', 0), rest_timer_enabled: false }),
    ).toBe(false);
    expect(
      restTimerEnabled({ ...createPlannedExercise('ex-1', 0), rest_timer_enabled: true }),
    ).toBe(true);
  });
});

describe('resolveWorkTimerSeconds', () => {
  it('returns null for an ordinary exercise with no timed target', () => {
    expect(resolveWorkTimerSeconds(createPlannedExercise('ex-1', 0))).toBeNull();
  });

  it('falls back to target_duration_seconds for a timed exercise without an explicit toggle', () => {
    const planned = { ...createPlannedExercise('ex-1', 0), target_duration_seconds: 30 };
    expect(resolveWorkTimerSeconds(planned)).toBe(30);
  });

  it('prefers work_timer_seconds when a work timer is explicitly enabled', () => {
    const planned = {
      ...createPlannedExercise('ex-1', 0),
      target_duration_seconds: 40,
      work_timer_enabled: true,
      work_timer_seconds: 30,
    };
    expect(resolveWorkTimerSeconds(planned)).toBe(30);
  });

  it('a disabled work timer still yields the timed target (pre-existing timed behavior)', () => {
    const planned = {
      ...createPlannedExercise('ex-1', 0),
      target_duration_seconds: 30,
      work_timer_enabled: false,
    };
    expect(resolveWorkTimerSeconds(planned)).toBe(30);
  });
});
