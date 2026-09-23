import { describe, expect, it } from 'vitest';
import {
  createExerciseAlias,
  findAliasCollisions,
  resolveAlias,
} from './exerciseAlias';

describe('createExerciseAlias', () => {
  it('normalizes the display alias for matching while preserving the original text', () => {
    const alias = createExerciseAlias({
      exerciseId: 'ex-1',
      displayAlias: '  DB Incline Bench  ',
      source: 'user',
    });
    expect(alias.display_alias).toBe('DB Incline Bench');
    expect(alias.normalized_alias).toBe('db incline bench');
    expect(alias.exercise_id).toBe('ex-1');
    expect(alias.source).toBe('user');
  });
});

describe('resolveAlias', () => {
  it('resolves an alias to its canonical exercise', () => {
    const aliases = [
      createExerciseAlias({ exerciseId: 'ex-1', displayAlias: 'DB Incline Press', source: 'user' }),
    ];
    expect(resolveAlias(aliases, 'db incline press')).toEqual({
      status: 'resolved',
      exerciseId: 'ex-1',
    });
  });

  it('matches case- and whitespace-insensitively via the same normalization used everywhere', () => {
    const aliases = [
      createExerciseAlias({ exerciseId: 'ex-1', displayAlias: 'Incline DB Press', source: 'curated' }),
    ];
    expect(resolveAlias(aliases, '  incline   db   press  ')).toMatchObject({ status: 'resolved' });
  });

  it('returns not_found for an alias that was never registered', () => {
    expect(resolveAlias([], 'Nonexistent Move')).toEqual({ status: 'not_found' });
  });

  it('does NOT silently choose when the same alias was registered for two different exercises', () => {
    const aliases = [
      createExerciseAlias({ exerciseId: 'ex-1', displayAlias: 'Incline Press', source: 'user' }),
      createExerciseAlias({ exerciseId: 'ex-2', displayAlias: 'incline press', source: 'import' }),
    ];
    const result = resolveAlias(aliases, 'Incline Press');
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.exerciseIds.sort()).toEqual(['ex-1', 'ex-2']);
    }
  });
});

describe('findAliasCollisions', () => {
  it('reports no collision for a genuinely new alias', () => {
    const aliases = [
      createExerciseAlias({ exerciseId: 'ex-1', displayAlias: 'Incline DB Press', source: 'user' }),
    ];
    expect(findAliasCollisions(aliases, 'Flat DB Press')).toEqual([]);
  });

  it('reports the other exercise when the same normalized alias already points elsewhere', () => {
    const aliases = [
      createExerciseAlias({ exerciseId: 'ex-1', displayAlias: 'Incline Press', source: 'user' }),
    ];
    expect(findAliasCollisions(aliases, 'incline press')).toEqual(['ex-1']);
  });

  it('excludes the alias being edited from its own collision check', () => {
    const aliases = [
      createExerciseAlias({ exerciseId: 'ex-1', displayAlias: 'Incline Press', source: 'user' }),
    ];
    expect(findAliasCollisions(aliases, 'incline press', 'ex-1')).toEqual([]);
  });
});
