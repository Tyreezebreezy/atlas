import { describe, expect, it } from 'vitest';
import type { PerformedSet, PlannedExercise } from '@atlas/data-model';
import { createPlannedExercise } from './createPlannedExercise';
import {
  exerciseIsComplete,
  exerciseSlotComplete,
  isOptionalExercise,
  orGroupMembers,
  requiredSlotStats,
  setsDoneFor,
} from './slotCompletion';

function set(exerciseId: string, index = 0): PerformedSet {
  return {
    id: `set-${exerciseId}-${index}`,
    exercise_id: exerciseId,
    set_index: index,
    set_type: 'normal',
    weight: null,
    reps: null,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    rir: null,
    completed_at: new Date().toISOString(),
    notes: null,
  };
}

function planned(
  exerciseId: string,
  targetSets: number | null,
  patch: Partial<PlannedExercise> = {},
): PlannedExercise {
  return { ...createPlannedExercise(exerciseId, 1), target_sets: targetSets, ...patch };
}

describe('isOptionalExercise', () => {
  it('is false for a normal exercise and true only when the flag is set', () => {
    expect(isOptionalExercise(planned('a', 3))).toBe(false);
    expect(isOptionalExercise(planned('a', 3, { is_optional: true }))).toBe(true);
    expect(isOptionalExercise(planned('a', 3, { is_optional: false }))).toBe(false);
  });
});

describe('orGroupMembers / exerciseSlotComplete', () => {
  it('treats a normal exercise slot as complete only when its own target sets are logged', () => {
    const a = planned('a', 3);
    expect(exerciseSlotComplete(a, [a], [set('a'), set('a')])).toBe(false);
    expect(exerciseSlotComplete(a, [a], [set('a'), set('a'), set('a')])).toBe(true);
  });

  it('satisfies an OR slot when ANY member is complete, not requiring all', () => {
    const pullUp = planned('pull-up', 3, { or_group: 'vert' });
    const pulldown = planned('pulldown', 3, { or_group: 'vert' });
    const all = [pullUp, pulldown];

    expect(orGroupMembers(all, 'vert')).toHaveLength(2);
    expect(exerciseSlotComplete(pullUp, all, [])).toBe(false);
    expect(
      exerciseSlotComplete(pullUp, all, [set('pulldown'), set('pulldown'), set('pulldown')]),
    ).toBe(true);
    expect(
      exerciseSlotComplete(pulldown, all, [set('pull-up'), set('pull-up'), set('pull-up')]),
    ).toBe(true);
  });

  it('does not confuse an OR member with an unrelated exercise', () => {
    const pullUp = planned('pull-up', 3, { or_group: 'vert' });
    const dip = planned('dip', 3, { or_group: 'press' });
    expect(exerciseSlotComplete(pullUp, [pullUp, dip], [set('dip'), set('dip'), set('dip')])).toBe(
      false,
    );
  });
});

describe('requiredSlotStats', () => {
  it('excludes optional exercises entirely', () => {
    const required = planned('a', 3);
    const optional = planned('b', 2, { is_optional: true });
    const stats = requiredSlotStats(
      [required, optional],
      [set('a'), set('a'), set('a')],
      new Set(),
    );
    expect(stats).toEqual({ total: 1, complete: 1 });
  });

  it('collapses an OR group into one slot that completes when one member does', () => {
    const pullUp = planned('pull-up', 3, { or_group: 'vert' });
    const pulldown = planned('pulldown', 3, { or_group: 'vert' });
    const stats = requiredSlotStats(
      [pullUp, pulldown],
      [set('pull-up'), set('pull-up'), set('pull-up')],
      new Set(),
    );
    expect(stats).toEqual({ total: 1, complete: 1 });
  });

  it('counts a skipped OR member as completing the slot', () => {
    const pullUp = planned('pull-up', 3, { or_group: 'vert' });
    const pulldown = planned('pulldown', 3, { or_group: 'vert' });
    const stats = requiredSlotStats([pullUp, pulldown], [], new Set(['pull-up']));
    expect(stats).toEqual({ total: 1, complete: 1 });
  });

  it('keeps two distinct OR groups as two slots', () => {
    const pullUp = planned('pull-up', 3, { or_group: 'vert' });
    const pulldown = planned('pulldown', 3, { or_group: 'vert' });
    const dip = planned('dip', 3, { or_group: 'press' });
    const pushUp = planned('push-up', 3, { or_group: 'press' });
    const stats = requiredSlotStats(
      [pullUp, pulldown, dip, pushUp],
      [set('pulldown'), set('pulldown'), set('pulldown')],
      new Set(),
    );
    expect(stats).toEqual({ total: 2, complete: 1 });
  });
});

describe('setsDoneFor / exerciseIsComplete', () => {
  it('defaults the target to one set when unset', () => {
    expect(exerciseIsComplete(planned('a', null), [set('a')])).toBe(true);
    expect(exerciseIsComplete(planned('a', null), [])).toBe(false);
  });

  it('counts only the given exercise', () => {
    expect(setsDoneFor([set('a'), set('a'), set('b')], 'a')).toBe(2);
  });
});
