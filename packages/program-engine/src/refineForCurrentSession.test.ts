import { describe, expect, it } from 'vitest';
import { createPerformedSet, type LogSetInput } from '@atlas/workout-engine';
import type { PerformedSet, ProgressionPolicy, ProgressionRecommendation } from '@atlas/data-model';
import { NO_PROGRESSION } from '@atlas/data-model';
import { refineForCurrentSession } from './refineForCurrentSession';

function set(input: Partial<LogSetInput> = {}): PerformedSet {
  return createPerformedSet({
    exerciseId: 'ex-1',
    setIndex: 0,
    setType: 'normal',
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    rir: null,
    notes: null,
    ...input,
  });
}

function recommendation(overrides: Partial<ProgressionRecommendation> = {}): ProgressionRecommendation {
  return {
    strategy_id: 'double_progression',
    target_load: 80,
    target_reps: 15,
    target_duration: null,
    target_distance: null,
    action: 'hold',
    reason_code: 'WITHIN_REP_RANGE',
    data_state: 'normal',
    constraint_applied: null,
    ...overrides,
  };
}

describe('refineForCurrentSession', () => {
  it('is a no-op when no sets have been completed yet this session', () => {
    const base = recommendation();
    expect(refineForCurrentSession(base, [], NO_PROGRESSION)).toBe(base);
  });

  it('is a no-op when the most recent set is within the shortfall threshold (ordinary variance)', () => {
    const base = recommendation({ target_reps: 15 });
    const result = refineForCurrentSession(base, [set({ weight: 80, reps: 14 })], NO_PROGRESSION);
    expect(result).toBe(base);
  });

  it('reduces target_reps to demonstrated capacity when a set falls meaningfully short (research pack §9 example)', () => {
    // Planned 80x15, 80x14, 80x13 -- Set 1 actually comes in at 80x10 (5 short).
    const base = recommendation({ target_load: 80, target_reps: 14 });
    const result = refineForCurrentSession(base, [set({ weight: 80, reps: 10 })], NO_PROGRESSION);
    expect(result.action).toBe('hold');
    expect(result.reason_code).toBe('CURRENT_SESSION_BELOW_TARGET');
    expect(result.target_reps).toBe(10);
  });

  it('never changes target_load -- equipment constraints already baked into the base recommendation are untouched', () => {
    const base = recommendation({ target_load: 80, target_reps: 14 });
    const result = refineForCurrentSession(base, [set({ weight: 80, reps: 5 })], NO_PROGRESSION);
    expect(result.target_load).toBe(80);
  });

  it('never adds a set -- there is no field to add one, and the function only ever narrows target_reps', () => {
    const base = recommendation({ target_reps: 14 });
    const result = refineForCurrentSession(base, [set({ weight: 80, reps: 3 })], NO_PROGRESSION);
    expect(result).not.toHaveProperty('target_sets');
  });

  it('only looks at the LAST completed set this session, not an average', () => {
    const base = recommendation({ target_reps: 14 });
    const result = refineForCurrentSession(
      base,
      [set({ weight: 80, reps: 2 }), set({ weight: 80, reps: 13 })],
      NO_PROGRESSION,
    );
    // Last set (13) is only 1 short of target 14 -- below the default threshold, so no-op.
    expect(result).toBe(base);
  });

  it('respects a policy-configured shortfall threshold instead of the default', () => {
    const policy: ProgressionPolicy = { ...NO_PROGRESSION, current_session_shortfall_reps: 1 };
    const base = recommendation({ target_reps: 14 });
    const result = refineForCurrentSession(base, [set({ weight: 80, reps: 13 })], policy);
    expect(result.reason_code).toBe('CURRENT_SESSION_BELOW_TARGET');
    expect(result.target_reps).toBe(13);
  });

  it('never reduces target_reps below 1', () => {
    const base = recommendation({ target_reps: 14 });
    const result = refineForCurrentSession(base, [set({ weight: 80, reps: 0 })], NO_PROGRESSION);
    expect(result.target_reps).toBe(1);
  });

  it('is a no-op when the base recommendation has no rep target at all (e.g. a duration-only exercise)', () => {
    const base = recommendation({ target_reps: null, target_duration: 60 });
    const result = refineForCurrentSession(base, [set({ durationSeconds: 30 })], NO_PROGRESSION);
    expect(result).toBe(base);
  });
});
