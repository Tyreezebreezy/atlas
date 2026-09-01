import { newId } from '@atlas/core';
import type { PlannedExercise } from '@atlas/data-model';

export function createPlannedExercise(exerciseId: string, order: number): PlannedExercise {
  return {
    id: newId(),
    exercise_id: exerciseId,
    order,
    target_sets: null,
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
