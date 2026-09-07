import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from '@atlas/workout-engine';
import type { WorkoutSession } from '@atlas/data-model';
import { computeActivityHeatmap } from './activityHeatmap';

function completedSessionAt(completedAt: string, setCount: number): WorkoutSession {
  let session = startWorkoutSession({
    name: 'S',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
  });
  for (let i = 0; i < setCount; i++) {
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'e1',
        setIndex: i,
        setType: 'normal',
        weight: 100,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
  }
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

/** Local-calendar-date key, exactly matching the module under test's own
 * `localDateKey` -- used so these tests never depend on the test runner's
 * timezone matching UTC (a session `completed_at` of 18:00 UTC lands on a
 * different calendar day in timezones ahead of UTC+6). */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('computeActivityHeatmap', () => {
  const now = new Date('2026-09-07T12:00:00.000Z');
  const twoDaysAgoIso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgoKey = dateKey(new Date(twoDaysAgoIso));

  it('includes every day in the window, even with zero activity, ending on the reference day', () => {
    const result = computeActivityHeatmap([], 'workouts', 7, now);
    expect(result).toHaveLength(7);
    expect(result.every((d) => d.value === 0)).toBe(true);
    expect(result[result.length - 1]?.date).toBe(dateKey(now));
  });

  it('counts a completed workout on its own calendar day', () => {
    const session = completedSessionAt(twoDaysAgoIso, 3);
    const result = computeActivityHeatmap([session], 'workouts', 7, now);
    const day = result.find((d) => d.date === twoDaysAgoKey);
    expect(day?.value).toBe(1);
  });

  it('tallies sets when metric is "sets"', () => {
    const session = completedSessionAt(twoDaysAgoIso, 5);
    const result = computeActivityHeatmap([session], 'sets', 7, now);
    const day = result.find((d) => d.date === twoDaysAgoKey);
    expect(day?.value).toBe(5);
  });

  it('excludes non-completed sessions', () => {
    const session = { ...completedSessionAt(twoDaysAgoIso, 3), status: 'discarded' as const };
    const result = computeActivityHeatmap([session], 'workouts', 7, now);
    expect(result.every((d) => d.value === 0)).toBe(true);
  });
});
