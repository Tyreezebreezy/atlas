import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { matchExercise } from './matchExercise';

function exercise(overrides: Partial<Exercise> & { name: string }): Exercise {
  return {
    id: `ex-${overrides.name}`,
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
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

describe('matchExercise', () => {
  const library = [
    exercise({ name: 'Barbell Bench Press' }),
    exercise({ name: 'Incline Dumbbell Bench Press' }),
    exercise({ name: 'Pull-Up' }),
    exercise({ name: 'Chin-Up', aliases: ['Underhand Pull-Up'] }),
  ];

  it('matches an exact name', () => {
    const result = matchExercise('Barbell Bench Press', library);
    expect(result.confidence).toBe('exact');
    expect(result.matched_exercise?.name).toBe('Barbell Bench Press');
  });

  it('matches case/whitespace/punctuation differences as normalized, not exact', () => {
    const result = matchExercise('  barbell   bench press.  ', library);
    expect(result.confidence).toBe('normalized');
    expect(result.matched_exercise?.name).toBe('Barbell Bench Press');
  });

  it('matches a known alias', () => {
    const result = matchExercise('Underhand Pull-Up', library);
    expect(result.confidence).toBe('alias');
    expect(result.matched_exercise?.name).toBe('Chin-Up');
  });

  it('never silently maps an ambiguous name -- it comes back unresolved with ranked candidates', () => {
    const result = matchExercise('DB Incline Bench', library);
    expect(result.confidence).toBe('unresolved');
    expect(result.matched_exercise).toBeNull();
    expect(result.candidates[0]?.name).toBe('Incline Dumbbell Bench Press');
  });

  it('returns no candidates for a name sharing no tokens with anything', () => {
    const result = matchExercise('Zzyzx Contraption', library);
    expect(result.confidence).toBe('unresolved');
    expect(result.candidates).toEqual([]);
  });
});
