import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { applyCuratedEnrichment } from './curatedEnrichment';

function makeExercise(id: string, name: string): Exercise {
  return {
    id,
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name,
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
  };
}

describe('applyCuratedEnrichment', () => {
  it('leaves exercises with no curated entry untouched', () => {
    const uncurated = makeExercise('u-1', 'some obscure movement nobody curated');
    const [result] = applyCuratedEnrichment([uncurated]);
    expect(result).toEqual(uncurated);
  });

  it('matches by name case-insensitively and fills in top-level and enrichment fields', () => {
    const exercise = makeExercise('e-1', 'Barbell Bench Press');
    const [result] = applyCuratedEnrichment([exercise]);
    expect(result?.movement_pattern).toBe('horizontal_push');
    expect(result?.default_rest_seconds).toBe(150);
    expect(result?.enrichment?.movement_pattern).toBe('horizontal_push');
    expect(result?.enrichment?.difficulty).toBe('intermediate');
  });

  it('resolves substitute names to the ids of other exercises in the same pool', () => {
    const bench = makeExercise('bench-id', 'barbell bench press');
    const dbBench = makeExercise('db-bench-id', 'dumbbell bench press');
    const [resultBench] = applyCuratedEnrichment([bench, dbBench]);
    expect(resultBench?.enrichment?.known_substitute_ids).toContain('db-bench-id');
  });

  it('drops substitute names that are not present in the given pool instead of throwing', () => {
    const bench = makeExercise('bench-id', 'barbell bench press');
    // dumbbell bench press / lever chest press deliberately absent from the pool
    expect(() => applyCuratedEnrichment([bench])).not.toThrow();
    const [result] = applyCuratedEnrichment([bench]);
    expect(result?.enrichment?.known_substitute_ids).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const bench = makeExercise('bench-id', 'barbell bench press');
    applyCuratedEnrichment([bench]);
    expect(bench.enrichment).toBeNull();
  });
});
