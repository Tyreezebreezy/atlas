import { describe, expect, it } from 'vitest';
import {
  ESTABLISHED_MIN_WORKOUTS,
  progressOverviewState,
  recentProgress,
} from './progressOverview';
import { daysBefore, makeExercise, makeSession } from './testFixtures';

const NOW = new Date('2026-09-24T12:00:00.000Z');
const PRESS = makeExercise({ id: 'machine-press', name: 'Machine Chest Press' });
const BENCH = makeExercise({ id: 'bench', name: 'Bench Press' });
const EXERCISES = new Map([PRESS, BENCH].map((e) => [e.id, e]));

const session = (exerciseId: string, weight: number, reps: number, daysAgo: number) =>
  makeSession([{ exerciseId, weight, reps }], daysBefore(NOW, daysAgo));

describe('progressOverviewState', () => {
  it('is empty with no completed workouts, early until the threshold, then established', () => {
    expect(progressOverviewState(0)).toBe('empty');
    expect(progressOverviewState(1)).toBe('early');
    expect(progressOverviewState(ESTABLISHED_MIN_WORKOUTS - 1)).toBe('early');
    expect(progressOverviewState(ESTABLISHED_MIN_WORKOUTS)).toBe('established');
    expect(progressOverviewState(200)).toBe('established');
  });
});

describe('recentProgress', () => {
  it('reports fixed-load rep gains as reps at that load, never as an invented e1RM', () => {
    const sessions = [
      session('machine-press', 170, 12, 21),
      session('machine-press', 170, 14, 14),
      session('machine-press', 170, 16, 7),
      session('machine-press', 170, 18, 2),
    ];
    const [item] = recentProgress(sessions, EXERCISES, { now: NOW });
    expect(item).toMatchObject({
      exercise_id: 'machine-press',
      metric: 'reps_at_load',
      load: 170,
      unit: ' reps',
      from: 16,
      to: 18,
      delta: 2,
      date: daysBefore(NOW, 2),
    });
  });

  it('reports a climbing barbell lift by estimated 1RM', () => {
    const sessions = [session('bench', 100, 5, 14), session('bench', 110, 5, 3)];
    const [item] = recentProgress(sessions, EXERCISES, { now: NOW });
    expect(item?.metric).toBe('e1rm');
    expect(item?.delta).toBeGreaterThan(0);
    expect(item?.to).toBeGreaterThan(item?.from ?? Infinity);
  });

  it('skips exercises with a single exposure, or whose last record is outside the window', () => {
    const sessions = [
      session('bench', 100, 5, 3), // one exposure -> nothing to compare
      session('machine-press', 170, 12, 80),
      session('machine-press', 170, 14, 70), // record is 70 days old
      session('machine-press', 170, 14, 2), // trained recently but no new best
    ];
    expect(recentProgress(sessions, EXERCISES, { now: NOW })).toEqual([]);
  });

  it('orders the newest improvement first and honors the limit', () => {
    const sessions = [
      session('bench', 100, 5, 20),
      session('bench', 110, 5, 10),
      session('machine-press', 170, 12, 9),
      session('machine-press', 170, 15, 1),
    ];
    const items = recentProgress(sessions, EXERCISES, { now: NOW });
    expect(items.map((i) => i.exercise_id)).toEqual(['machine-press', 'bench']);
    expect(recentProgress(sessions, EXERCISES, { now: NOW, limit: 1 })).toHaveLength(1);
  });

  it('ignores exercises that are not in the library lookup', () => {
    const sessions = [session('ghost', 100, 5, 9), session('ghost', 110, 5, 2)];
    expect(recentProgress(sessions, EXERCISES, { now: NOW })).toEqual([]);
  });
});
