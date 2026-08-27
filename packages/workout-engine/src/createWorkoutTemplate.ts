import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { WorkoutTemplate } from '@atlas/data-model';

export function createWorkoutTemplate(name: string, isQuickWorkout: boolean): WorkoutTemplate {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name,
    exercises: [],
    is_quick_workout: isQuickWorkout,
  };
}

export function duplicateWorkoutTemplate(template: WorkoutTemplate): WorkoutTemplate {
  const now = new Date().toISOString();
  return {
    ...template,
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name: `${template.name} (Copy)`,
    exercises: template.exercises.map((exercise) => ({ ...exercise, id: newId() })),
  };
}
