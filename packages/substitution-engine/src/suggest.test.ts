import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { suggestSubstitutes } from './suggest';

let counter = 0;
function makeExercise(overrides: Partial<Exercise>): Exercise {
  counter += 1;
  return {
    id: overrides.id ?? `ex-${counter}`,
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: `Exercise ${counter}`,
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
    ...overrides,
  };
}

describe('suggestSubstitutes: scoring', () => {
  it('ranks a same-pattern, same-muscle candidate above an unrelated one', () => {
    const target = makeExercise({
      id: 'target',
      movement_pattern: 'horizontal_push',
      target_muscle: 'chest',
    });
    const close = makeExercise({
      id: 'close',
      name: 'Close match',
      movement_pattern: 'horizontal_push',
      target_muscle: 'chest',
    });
    const unrelated = makeExercise({ id: 'unrelated', name: 'Unrelated', target_muscle: 'calves' });

    const results = suggestSubstitutes(target, [close, unrelated]);
    expect(results[0]?.exercise.id).toBe('close');
    expect(results[0]?.reasons).toContain('Same movement pattern');
    expect(results[0]?.reasons).toContain('Same target muscle');
  });

  it('a known_substitute_ids match adds on top of, and outranks, pattern/muscle overlap alone', () => {
    // A real curated substitute normally also shares pattern/muscle (that's
    // usually *why* it was curated as a substitute) -- known_substitute_ids
    // is an additional strong signal on top of that, not a replacement for it.
    const known = makeExercise({
      id: 'known',
      name: 'Known sub',
      movement_pattern: 'squat',
      target_muscle: 'quadriceps',
    });
    const target = makeExercise({
      id: 'target',
      movement_pattern: 'squat',
      target_muscle: 'quadriceps',
      enrichment: {
        movement_pattern: null,
        movement_family: null,
        is_unilateral: null,
        is_axial_loading: null,
        purpose: null,
        difficulty: null,
        known_substitute_ids: ['known'],
        avoid_if: [],
      },
    });
    const patternOnly = makeExercise({
      id: 'pattern-only',
      name: 'Pattern only',
      movement_pattern: 'squat',
      target_muscle: 'quadriceps',
    });

    const results = suggestSubstitutes(target, [known, patternOnly]);
    expect(results[0]?.exercise.id).toBe('known');
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it('caps the shared-secondary-muscle bonus rather than scaling unbounded', () => {
    // measurement_type deliberately differs so the (reason-less) same-type
    // bonus can't leak into this score, isolating the capped bonus itself.
    const target = makeExercise({
      id: 'target',
      secondary_muscles: ['a', 'b', 'c', 'd', 'e'],
      measurement_type: 'reps_weight',
    });
    const candidate = makeExercise({
      id: 'cand',
      secondary_muscles: ['a', 'b', 'c', 'd', 'e'],
      measurement_type: 'time',
    });
    const results = suggestSubstitutes(target, [candidate]);
    expect(results[0]?.score).toBe(15);
  });
});

describe('suggestSubstitutes: exclusion filtering', () => {
  it('never suggests the target itself', () => {
    const target = makeExercise({ id: 'target', target_muscle: 'chest' });
    const results = suggestSubstitutes(target, [target]);
    expect(results).toEqual([]);
  });

  it('excludes ids passed via excludeExerciseIds even if they score well', () => {
    const target = makeExercise({ id: 'target', target_muscle: 'chest' });
    const other = makeExercise({ id: 'other', target_muscle: 'chest' });
    const results = suggestSubstitutes(target, [other], { excludeExerciseIds: ['other'] });
    expect(results).toEqual([]);
  });

  it('excludes soft-deleted candidates', () => {
    const target = makeExercise({ id: 'target', target_muscle: 'chest' });
    const deleted = makeExercise({
      id: 'deleted',
      target_muscle: 'chest',
      deleted_at: '2026-08-27T00:00:00.000Z',
    });
    const results = suggestSubstitutes(target, [deleted]);
    expect(results).toEqual([]);
  });
});

describe('suggestSubstitutes: equipment filtering', () => {
  it('excludes candidates requiring equipment outside the available list', () => {
    const target = makeExercise({ id: 'target', target_muscle: 'chest' });
    const needsBarbell = makeExercise({
      id: 'barbell',
      target_muscle: 'chest',
      equipment: ['barbell'],
    });
    const bodyweight = makeExercise({
      id: 'bw',
      target_muscle: 'chest',
      equipment: [],
    });

    const results = suggestSubstitutes(target, [needsBarbell, bodyweight], {
      availableEquipment: ['dumbbell'],
    });
    expect(results.map((r) => r.exercise.id)).toEqual(['bw']);
  });

  it('does not filter by equipment when availableEquipment is omitted', () => {
    const target = makeExercise({ id: 'target', target_muscle: 'chest' });
    const needsBarbell = makeExercise({
      id: 'barbell',
      target_muscle: 'chest',
      equipment: ['barbell'],
    });
    const results = suggestSubstitutes(target, [needsBarbell]);
    expect(results.map((r) => r.exercise.id)).toEqual(['barbell']);
  });
});

describe('suggestSubstitutes: deterministic ordering', () => {
  it('breaks equal scores by name, and produces the same order on repeated calls', () => {
    const target = makeExercise({ id: 'target', target_muscle: 'chest' });
    const b = makeExercise({ id: 'b', name: 'B Exercise', target_muscle: 'chest' });
    const a = makeExercise({ id: 'a', name: 'A Exercise', target_muscle: 'chest' });

    const first = suggestSubstitutes(target, [b, a]);
    const second = suggestSubstitutes(target, [b, a]);
    expect(first.map((r) => r.exercise.id)).toEqual(['a', 'b']);
    expect(second.map((r) => r.exercise.id)).toEqual(['a', 'b']);
  });

  it('respects an explicit limit after sorting', () => {
    const target = makeExercise({ id: 'target', target_muscle: 'chest' });
    const pool = ['c', 'a', 'b'].map((id) =>
      makeExercise({ id, name: id, target_muscle: 'chest' }),
    );
    const results = suggestSubstitutes(target, pool, { limit: 2 });
    expect(results.map((r) => r.exercise.id)).toEqual(['a', 'b']);
  });
});

describe('suggestSubstitutes: no eligible candidates', () => {
  it('returns an empty array when nothing shares any scored signal', () => {
    const target = makeExercise({
      id: 'target',
      target_muscle: 'chest',
      movement_pattern: 'horizontal_push',
    });
    const unrelated = makeExercise({
      id: 'unrelated',
      target_muscle: 'calves',
      movement_pattern: 'hinge',
    });
    expect(suggestSubstitutes(target, [unrelated])).toEqual([]);
  });

  it('returns an empty array for an empty pool', () => {
    const target = makeExercise({ id: 'target' });
    expect(suggestSubstitutes(target, [])).toEqual([]);
  });
});
