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
    groups: [],
  };
}

export function duplicateWorkoutTemplate(template: WorkoutTemplate): WorkoutTemplate {
  const now = new Date().toISOString();
  // Group ids must stay linked to their members after both get new ids --
  // build the old->new group id map first, then remap both sides with it.
  const groupIdMap = new Map(template.groups.map((group) => [group.id, newId()] as const));
  return {
    ...template,
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name: `${template.name} (Copy)`,
    exercises: template.exercises.map((exercise) => ({
      ...exercise,
      id: newId(),
      group_id: exercise.group_id ? (groupIdMap.get(exercise.group_id) ?? null) : null,
    })),
    groups: template.groups.map((group) => ({ ...group, id: groupIdMap.get(group.id)! })),
  };
}
