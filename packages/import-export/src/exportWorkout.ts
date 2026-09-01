import type { Exercise, WorkoutTemplate } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import {
  ATLAS_PLAN_FORMAT,
  type AtlasWorkoutDocument,
  type PlanExerciseTarget,
  type PlanWorkout,
} from './types';

export function templateToPlanWorkout(template: WorkoutTemplate, library: Exercise[]): PlanWorkout {
  const byId = new Map(library.map((exercise) => [exercise.id, exercise] as const));
  const exercises: PlanExerciseTarget[] = template.exercises.map((planned) => ({
    order: planned.order,
    exercise_id: planned.exercise_id,
    exercise_name: byId.get(planned.exercise_id)?.name ?? 'Unknown exercise',
    target_sets: planned.target_sets,
    target_reps_min: planned.target_reps_min,
    target_reps_max: planned.target_reps_max,
    target_weight: planned.target_weight,
    target_rpe: planned.target_rpe,
    target_rir: planned.target_rir,
    target_duration_seconds: planned.target_duration_seconds,
    target_distance_meters: planned.target_distance_meters,
    rest_seconds: planned.rest_seconds,
    notes: planned.notes,
  }));
  return { name: template.name, is_quick_workout: template.is_quick_workout, exercises };
}

/** Exports a single WorkoutTemplate (or Quick Workout -- same shape) as a
 * portable atlas-plan-v1 document. `exercise_id` is kept as a same-install
 * hint; `exercise_name` is always populated as the cross-install fallback. */
export async function exportWorkout(
  templateId: string,
  storage: AtlasStorage,
): Promise<AtlasWorkoutDocument> {
  const template = await storage.workoutTemplates.get(templateId);
  if (!template) throw new Error(`Workout template ${templateId} not found.`);
  const library = await storage.exercises.getAll();
  return {
    format: ATLAS_PLAN_FORMAT,
    kind: 'workout',
    exported_at: new Date().toISOString(),
    workout: templateToPlanWorkout(template, library),
  };
}
