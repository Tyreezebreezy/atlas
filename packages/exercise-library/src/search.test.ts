import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { listBodyParts, listEquipment, searchExercises } from './search';

function makeExercise(overrides: Partial<Exercise>): Exercise {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: 'test',
    deleted_at: null,
    name: 'Test Exercise',
    aliases: [],
    category: 'chest',
    equipment: ['barbell'],
    target_muscle: 'chest',
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

const bench = makeExercise({ name: 'Bench Press', category: 'chest', equipment: ['barbell'] });
const squat = makeExercise({ name: 'Back Squat', category: 'upper legs', equipment: ['barbell'] });
const pushup = makeExercise({ name: 'Push-Up', category: 'chest', equipment: ['body weight'] });
const all = [bench, squat, pushup];

describe('searchExercises', () => {
  it('filters by name substring, case-insensitively', () => {
    expect(searchExercises(all, { query: 'bench' })).toEqual([bench]);
    expect(searchExercises(all, { query: 'PUSH' })).toEqual([pushup]);
  });

  it('filters by body part', () => {
    expect(searchExercises(all, { bodyPart: 'chest' })).toEqual([bench, pushup]);
  });

  it('filters by equipment', () => {
    expect(searchExercises(all, { equipment: 'body weight' })).toEqual([pushup]);
  });

  it('combines filters', () => {
    expect(searchExercises(all, { bodyPart: 'chest', equipment: 'barbell' })).toEqual([bench]);
  });

  it('returns everything with no filter', () => {
    expect(searchExercises(all, {})).toEqual(all);
  });
});

describe('listBodyParts / listEquipment', () => {
  it('returns distinct sorted values', () => {
    expect(listBodyParts(all)).toEqual(['chest', 'upper legs']);
    expect(listEquipment(all)).toEqual(['barbell', 'body weight']);
  });
});
