import { describe, expect, it } from 'vitest';
import type { Exercise, PerformedSet, PlannedExercise } from '@atlas/data-model';
import { createPlannedExercise } from '@atlas/workout-engine';
import {
  initialDraftValues,
  MAX_SET_LOAD,
  MAX_SET_REPS,
  setEntryProblem,
  type SetEntry,
} from './draftValues';

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

const entry = (patch: Partial<SetEntry>): SetEntry => ({
  weight: '',
  reps: '',
  duration: '',
  distance: '',
  rpe: '',
  rir: '',
  ...patch,
});

describe('setEntryProblem: a logged set must be a possible set', () => {
  it('accepts an ordinary working set, and a bodyweight one with no load typed', () => {
    expect(setEntryProblem('reps_weight', entry({ weight: '135', reps: '8' }))).toBeNull();
    expect(setEntryProblem('reps_weight', entry({ weight: '', reps: '12' }))).toBeNull();
    expect(
      setEntryProblem('reps_weight', entry({ weight: '47.5', reps: '10', rpe: '8.5', rir: '1' })),
    ).toBeNull();
    expect(setEntryProblem('reps_bodyweight', entry({ reps: '15' }))).toBeNull();
  });

  it('refuses a set with no reps -- a "completed" set with nothing in it', () => {
    expect(setEntryProblem('reps_weight', entry({ weight: '135', reps: '' }))).toMatch(/reps/i);
    expect(setEntryProblem('reps_weight', entry({ weight: '135', reps: '0' }))).toMatch(
      /whole number/,
    );
    expect(setEntryProblem('reps', entry({ reps: '   ' }))).toMatch(/reps/i);
  });

  it('refuses fractional, negative and absurd reps and loads', () => {
    expect(setEntryProblem('reps_weight', entry({ weight: '100', reps: '8.5' }))).toMatch(
      /whole number/,
    );
    expect(setEntryProblem('reps_weight', entry({ weight: '100', reps: '-3' }))).toMatch(
      /whole number/,
    );
    expect(
      setEntryProblem('reps_weight', entry({ weight: '100', reps: String(MAX_SET_REPS + 1) })),
    ).toMatch(/whole number/);
    expect(setEntryProblem('reps_weight', entry({ weight: '-5', reps: '8' }))).toMatch(/negative/);
    expect(
      setEntryProblem('reps_weight', entry({ weight: String(MAX_SET_LOAD + 1), reps: '8' })),
    ).toMatch(/between 0 and/);
    expect(
      setEntryProblem('reps_weight', entry({ weight: '999999', reps: '9999' })),
    ).not.toBeNull();
    expect(setEntryProblem('reps_bodyweight', entry({ externalLoad: '-10', reps: '8' }))).toMatch(
      /negative/,
    );
  });

  it('the limits themselves are allowed', () => {
    expect(
      setEntryProblem(
        'reps_weight',
        entry({ weight: String(MAX_SET_LOAD), reps: String(MAX_SET_REPS) }),
      ),
    ).toBeNull();
    expect(setEntryProblem('reps_weight', entry({ weight: '0', reps: '1' }))).toBeNull();
  });

  it('a timed exercise needs a time, a distance exercise a distance, either is enough for time+distance', () => {
    expect(setEntryProblem('time', entry({}))).toMatch(/time/i);
    expect(setEntryProblem('time', entry({ duration: '45' }))).toBeNull();
    expect(setEntryProblem('time', entry({ duration: '-5' }))).toMatch(/between 1/);
    expect(setEntryProblem('distance', entry({}))).toMatch(/distance/i);
    expect(setEntryProblem('distance', entry({ distance: '400' }))).toBeNull();
    expect(setEntryProblem('distance', entry({ distance: '0' }))).toMatch(/above 0/);
    expect(setEntryProblem('distance_time', entry({}))).toMatch(/time or a distance/);
    expect(setEntryProblem('distance_time', entry({ distance: '5000' }))).toBeNull();
    expect(setEntryProblem('distance_time', entry({ duration: '1500' }))).toBeNull();
  });

  it('RPE is 1-10 and RIR is 0-10 when given, and optional when not', () => {
    expect(setEntryProblem('reps_weight', entry({ weight: '100', reps: '8', rpe: '11' }))).toMatch(
      /RPE/,
    );
    expect(setEntryProblem('reps_weight', entry({ weight: '100', reps: '8', rpe: '0' }))).toMatch(
      /RPE/,
    );
    expect(setEntryProblem('reps_weight', entry({ weight: '100', reps: '8', rir: '-1' }))).toMatch(
      /RIR/,
    );
    expect(
      setEntryProblem('reps_weight', entry({ weight: '100', reps: '8', rir: '0' })),
    ).toBeNull();
  });
});
