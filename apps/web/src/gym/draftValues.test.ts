import { describe, expect, it } from 'vitest';
import type { Exercise, PerformedSet, PlannedExercise } from '@atlas/data-model';
import { createPlannedExercise } from '@atlas/workout-engine';
import { initialDraftValues } from './draftValues';

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex',
    name: 'Machine chest press',
    aliases: [],
    category: 'chest',
    equipment: [],
    target_muscle: 'chest',
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: true,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
    created_at: '',
    updated_at: '',
    version: 1,
    device_id: '',
    deleted_at: null,
    ...overrides,
  };
}

function set(exerciseId: string, weight: number | null, reps: number | null): PerformedSet {
  return {
    id: `${exerciseId}-set`,
    exercise_id: exerciseId,
    set_index: 0,
    set_type: 'normal',
    weight,
    reps,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    rir: null,
    completed_at: new Date().toISOString(),
    notes: null,
  };
}

function planned(exerciseId: string, targetWeight: number | null): PlannedExercise {
  return {
    ...createPlannedExercise(exerciseId, 1),
    target_weight: targetWeight,
    target_reps_min: 8,
  };
}

describe('initialDraftValues (cross-exercise carryover regression)', () => {
  it('derives weight from THIS exercise plan target, never another movement', () => {
    // The bug: typing 170x8 on Chest Press, then moving to Pull-Up, left
    // 170x8 visible. This proves the prefill is parameterized by the passed
    // plan alone -- a different exercise's plan target wins, not stale state.
    const chestPress = exercise({ id: 'chest-press', name: 'Machine chest press' });
    const pullUp = exercise({
      id: 'pull-up',
      name: 'Assisted pull-up',
      measurement_type: 'reps_bodyweight',
    });

    const chest = planned('chest-press', 170);
    const pull = planned('pull-up', null);

    const chestDraft = initialDraftValues(chestPress, chest, [], []);
    const pullDraft = initialDraftValues(pullUp, pull, [], []);

    expect(chestDraft.weight).toBe('170');
    expect(pullDraft.weight).toBe('');
    expect(pullDraft.externalLoad).toBe('');
  });

  it('prefers the current-session last completed set for the same exercise', () => {
    const e = exercise();
    const p = planned('ex', 170);
    const draft = initialDraftValues(e, p, [set('ex', 175, 8)], []);
    expect(draft.weight).toBe('175');
  });

  it('prefers previous-history when the current session has no completed set yet', () => {
    const e = exercise();
    const p = planned('ex', 170);
    const draft = initialDraftValues(e, p, [], [set('ex', 160, 9)]);
    expect(draft.weight).toBe('160');
  });

  it('is empty for a different exercise with no target and no history (no cross-movement leakage)', () => {
    // The invariant: the prefill is derived solely from the plan/history it
    // is GIVEN. Cross-exercise leakage is prevented upstream -- the caller
    // filters `previousSets`/`performedSets` to THIS exercise, and the `key`
    // on ExerciseLogger remounts it per movement -- so a bodyweight pull-up
    // with no target weight pre-fills nothing, never a stale 170 from a
    // chest press.
    const pullUp = exercise({ id: 'pull-up', measurement_type: 'reps_bodyweight' });
    const p = planned('pull-up', null);
    const draft = initialDraftValues(pullUp, p, [], []);
    expect(draft.weight).toBe('');
    expect(draft.externalLoad).toBe('');
  });
});
