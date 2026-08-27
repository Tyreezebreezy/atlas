import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { Exercise } from '@atlas/data-model';

export interface CustomExerciseInput {
  name: string;
  category: string | null;
  equipment: string[];
  targetMuscle: string | null;
  secondaryMuscles: string[];
  instructions: string[];
  measurementType: Exercise['measurement_type'];
}

export function createCustomExercise(input: CustomExerciseInput): Exercise {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name: input.name,
    aliases: [],
    category: input.category,
    equipment: input.equipment,
    target_muscle: input.targetMuscle,
    secondary_muscles: input.secondaryMuscles,
    instructions: input.instructions,
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: input.measurementType,
    default_rest_seconds: null,
    is_custom: true,
    source: 'user',
    source_id: null,
    user_notes: null,
    enrichment: null,
  };
}
