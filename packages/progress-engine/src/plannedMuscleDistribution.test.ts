import { describe, expect, it } from 'vitest';
import type { Exercise, PlannedExercise } from '@atlas/data-model';
import { plannedMuscleDistribution } from './plannedMuscleDistribution';

function makeExercise(id: string, category: string): Exercise {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: id,
    aliases: [],
    category,
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

function makePlanned(exerciseId: string, targetSets: number | null): PlannedExercise {
  return {
    id: `pe-${exerciseId}`,
    exercise_id: exerciseId,
    order: 0,
    target_sets: targetSets,
    target_reps_min: null,
    target_reps_max: null,
    target_weight: null,
    target_rpe: null,
    target_rir: null,
    target_duration_seconds: null,
    target_distance_meters: null,
    rest_seconds: null,
    notes: null,
    group_id: null,
  };
}

describe('plannedMuscleDistribution', () => {
  it('tallies planned sets per muscle group from target_sets', () => {
    const exercisesById = new Map([
      ['bench', makeExercise('bench', 'chest')],
      ['row', makeExercise('row', 'back')],
      ['incline', makeExercise('incline', 'chest')],
    ]);
    const planned = [makePlanned('bench', 4), makePlanned('row', 3), makePlanned('incline', 4)];
    const result = plannedMuscleDistribution(planned, exercisesById);
    expect(result).toEqual([
      { label: 'chest', workingSets: 8 },
      { label: 'back', workingSets: 3 },
    ]);
  });

  it('defaults to 1 set when target_sets is not configured', () => {
    const exercisesById = new Map([['bench', makeExercise('bench', 'chest')]]);
    const result = plannedMuscleDistribution([makePlanned('bench', null)], exercisesById);
    expect(result).toEqual([{ label: 'chest', workingSets: 1 }]);
  });

  it('buckets an unresolvable exercise as Uncategorized rather than dropping it', () => {
    const result = plannedMuscleDistribution([makePlanned('ghost', 3)], new Map());
    expect(result).toEqual([{ label: 'Uncategorized', workingSets: 3 }]);
  });
});
