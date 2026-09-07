import { describe, expect, it } from 'vitest';
import type { PerformedSet } from '@atlas/data-model';
import { setPhaseOf, setTypeOf } from './setClassification';

function rawSet(overrides: Partial<PerformedSet> = {}): PerformedSet {
  return {
    id: 's1',
    exercise_id: 'e1',
    set_index: 0,
    set_type: 'normal',
    weight: null,
    reps: null,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    rir: null,
    completed_at: '2026-01-01T00:00:00.000Z',
    notes: null,
    ...overrides,
  };
}

describe('setPhaseOf', () => {
  it('reads the phase field directly when present', () => {
    expect(setPhaseOf(rawSet({ phase: 'warmup' }))).toBe('warmup');
    expect(setPhaseOf(rawSet({ phase: 'work' }))).toBe('work');
  });

  it('falls back to the pre-v0.2.0 convention when phase is absent: a raw stored set_type of "warmup" is still a warm-up', () => {
    // Simulates a genuine pre-v0.2.0 stored record -- no `phase` field at
    // runtime despite the required TypeScript type, and `set_type` holding
    // the old literal value the type no longer permits new code to write.
    const legacy = { ...rawSet(), set_type: 'warmup' as PerformedSet['set_type'] };
    delete (legacy as { phase?: unknown }).phase;
    expect(setPhaseOf(legacy)).toBe('warmup');
  });

  it('falls back to "work" for every other pre-v0.2.0 set_type, including the old "working" default', () => {
    const legacyWorking = { ...rawSet(), set_type: 'working' as PerformedSet['set_type'] };
    delete (legacyWorking as { phase?: unknown }).phase;
    expect(setPhaseOf(legacyWorking)).toBe('work');

    const legacyDrop = { ...rawSet(), set_type: 'drop' as PerformedSet['set_type'] };
    delete (legacyDrop as { phase?: unknown }).phase;
    expect(setPhaseOf(legacyDrop)).toBe('work');
  });
});

describe('setTypeOf', () => {
  it('passes new-shape values through unchanged', () => {
    expect(setTypeOf(rawSet({ set_type: 'amrap' }))).toBe('amrap');
    expect(setTypeOf(rawSet({ set_type: 'rest_pause' }))).toBe('rest_pause');
  });

  it('normalizes both pre-v0.2.0 phase-carrying values to "normal"', () => {
    expect(setTypeOf(rawSet({ set_type: 'working' as PerformedSet['set_type'] }))).toBe('normal');
    expect(setTypeOf(rawSet({ set_type: 'warmup' as PerformedSet['set_type'] }))).toBe('normal');
  });
});
