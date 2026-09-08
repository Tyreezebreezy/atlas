import { describe, expect, it } from 'vitest';
import type { Milestone, PersonalRecord } from '@atlas/data-model';
import { createMilestone } from './createMilestone';
import { describeMilestoneProgress } from './describeMilestoneProgress';

function pr(overrides: Partial<PersonalRecord>): PersonalRecord {
  return {
    id: 'pr-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'device-1',
    deleted_at: null,
    exercise_id: 'ex-1',
    kind: 'max_load',
    value: 0,
    reps: null,
    achieved_at: '2026-01-01T00:00:00.000Z',
    source_session_id: 'sess-1',
    source_set_id: 'set-1',
    ...overrides,
  };
}

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    ...createMilestone({
      title: 'Test',
      exerciseId: 'ex-1',
      dimension: 'weight',
      targetWeight: 225,
    }),
    ...overrides,
  };
}

describe('describeMilestoneProgress', () => {
  it('reports honest reps-remaining text for a reps milestone', () => {
    const m = milestone({ dimension: 'reps', target_reps: 10, target_weight: null });
    const progress = describeMilestoneProgress(m, [pr({ kind: 'bodyweight', value: 8 })]);
    expect(progress.current).toBe(8);
    expect(progress.remaining).toBe(2);
    expect(progress.text).toBe('2 reps to goal');
  });

  it('reports honest seconds-remaining text for a duration milestone', () => {
    const m = milestone({
      dimension: 'duration',
      target_duration_seconds: 180,
      target_weight: null,
    });
    const progress = describeMilestoneProgress(m, [pr({ kind: 'timed', value: 165 })]);
    expect(progress.remaining).toBe(15);
    expect(progress.text).toBe('15 sec to goal');
  });

  it('reports honest weight-remaining text for a same-rep-count weight_and_reps milestone', () => {
    const m = milestone({ dimension: 'weight_and_reps', target_weight: 225, target_reps: 5 });
    const progress = describeMilestoneProgress(m, [
      pr({ kind: 'rep_range', value: 205, reps: 5 }),
      pr({ kind: 'rep_range', value: 245, reps: 3 }), // different rep count -- must not be used
    ]);
    expect(progress.current).toBe(205);
    expect(progress.remaining).toBe(20);
    expect(progress.text).toBe('20 lb to goal');
  });

  it('does not compare a weight_and_reps target against a PR at a different rep count', () => {
    const m = milestone({ dimension: 'weight_and_reps', target_weight: 225, target_reps: 5 });
    const progress = describeMilestoneProgress(m, [pr({ kind: 'rep_range', value: 245, reps: 3 })]);
    expect(progress.current).toBeNull();
    expect(progress.remaining).toBeNull();
    expect(progress.text).toBe('Not enough data yet to show progress.');
  });

  it('reports honest weight-remaining text for a plain weight milestone', () => {
    const m = milestone({ dimension: 'weight', target_weight: 225 });
    const progress = describeMilestoneProgress(m, [pr({ kind: 'max_load', value: 205 })]);
    expect(progress.remaining).toBe(20);
    expect(progress.text).toBe('20 lb to goal');
  });

  it('never invents a percentage for a distance milestone', () => {
    const m = milestone({
      dimension: 'distance',
      target_weight: null,
      target_distance_meters: 5000,
    });
    const progress = describeMilestoneProgress(m, [pr({ kind: 'distance', value: 3000 })]);
    expect(progress.remaining).toBeNull();
    expect(progress.text).toBe('Not enough data yet to show progress.');
  });

  it('never invents a percentage for a bodyweight_multiplier milestone', () => {
    const m = milestone({
      dimension: 'bodyweight_multiplier',
      target_weight: null,
      multiplier: 1.5,
    });
    const progress = describeMilestoneProgress(m, [pr({ kind: 'max_load', value: 200 })]);
    expect(progress.remaining).toBeNull();
    expect(progress.text).toBe('Not enough data yet to show progress.');
  });

  it('reports "Not enough data yet" when there is no relevant PR at all', () => {
    const m = milestone({ dimension: 'weight', target_weight: 225 });
    const progress = describeMilestoneProgress(m, []);
    expect(progress.current).toBeNull();
    expect(progress.remaining).toBeNull();
    expect(progress.text).toBe('Not enough data yet to show progress.');
  });

  it('reports "Goal reached" rather than a negative remainder once current meets target', () => {
    const m = milestone({ dimension: 'weight', target_weight: 225 });
    const progress = describeMilestoneProgress(m, [pr({ kind: 'max_load', value: 245 })]);
    expect(progress.remaining).toBe(0);
    expect(progress.text).toBe('Goal reached.');
  });
});
