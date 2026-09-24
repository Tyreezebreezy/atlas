import { describe, expect, it } from 'vitest';
import type { RecentProgressItem } from '@atlas/progress-engine';
import {
  describeDaysAgo,
  describePerformanceCounts,
  describeProgressDelta,
  pluralize,
} from './formatProgress';

const item = (overrides: Partial<RecentProgressItem>): RecentProgressItem => ({
  exercise_id: 'x',
  metric: 'max_load',
  unit: ' lb',
  from: 100,
  to: 105,
  delta: 5,
  date: '2026-09-20T18:00:00.000Z',
  ...overrides,
});

describe('describeProgressDelta', () => {
  it('phrases a fixed-load rep gain as reps at that load', () => {
    expect(describeProgressDelta(item({ metric: 'reps_at_load', load: 170, delta: 3, unit: ' reps' }))).toBe(
      '+3 reps at 170 lb',
    );
    expect(describeProgressDelta(item({ metric: 'reps_at_load', load: 170, delta: 1, unit: ' reps' }))).toBe(
      '+1 rep at 170 lb',
    );
  });

  it('labels weight and estimated-1RM gains distinctly so the two are never confused', () => {
    expect(describeProgressDelta(item({ metric: 'max_load', delta: 5 }))).toBe('+5 lb best weight');
    expect(describeProgressDelta(item({ metric: 'e1rm', delta: 7.6 }))).toBe('+8 lb est. 1RM');
  });

  it('handles bodyweight, timed and distance movements', () => {
    expect(describeProgressDelta(item({ metric: 'reps', delta: 2, unit: ' reps' }))).toBe('+2 reps');
    expect(describeProgressDelta(item({ metric: 'duration', delta: 15, unit: '' }))).toBe('+0:15 longer');
    expect(describeProgressDelta(item({ metric: 'distance', delta: 250, unit: ' m' }))).toBe('+250 m');
  });
});

describe('pluralize', () => {
  it('only pluralizes when the count is not one', () => {
    expect(pluralize(1, 'set')).toBe('1 set');
    expect(pluralize(0, 'set')).toBe('0 sets');
    expect(pluralize(12, 'workout')).toBe('12 workouts');
  });
});

describe('describeDaysAgo', () => {
  const now = new Date(2026, 8, 24, 9, 30); // Sep 24, mid-morning, local

  it('counts calendar days in the device timezone, not 24-hour blocks', () => {
    expect(describeDaysAgo(new Date(2026, 8, 24, 0, 5).toISOString(), now)).toBe('today');
    // Late last night is "yesterday" even though it was under 24 hours ago.
    expect(describeDaysAgo(new Date(2026, 8, 23, 23, 50).toISOString(), now)).toBe('yesterday');
    expect(describeDaysAgo(new Date(2026, 8, 19, 18, 0).toISOString(), now)).toBe('5 days ago');
  });
});

describe('describePerformanceCounts', () => {
  it('lists only the non-zero states, most attention-worthy first', () => {
    expect(
      describePerformanceCounts({ progressing: 2, stable: 0, stalled: 1, insufficient_data: 0 }),
    ).toBe('1 stalled · 2 progressing');
    expect(
      describePerformanceCounts({ progressing: 0, stable: 0, stalled: 0, insufficient_data: 3 }),
    ).toBe('3 not enough data');
  });
});
