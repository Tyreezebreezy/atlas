import type { Exercise, PlannedExercise, Program, WorkoutTemplate } from '@atlas/data-model';
import { createCustomExercise } from '@atlas/exercise-library';
import { createProgram, createProgramDay, createProgramWeek } from '@atlas/program-engine';
import type { AtlasStorage } from '@atlas/storage';
import { createPlannedExercise, createWorkoutTemplate } from '@atlas/workout-engine';
import type {
  ImportPreviewExercise,
  ImportPreviewWorkout,
  ImportPreview,
  ImportResolutions,
} from './types';

export interface ApplyImportResult {
  created_exercises: Exercise[];
  workout_template: WorkoutTemplate | null;
  program: Program | null;
}

function resolveExerciseId(
  entry: ImportPreviewExercise,
  resolutions: ImportResolutions,
  createdExercises: Exercise[],
): string | null {
  if (entry.match.confidence !== 'unresolved' && entry.match.matched_exercise) {
    return entry.match.matched_exercise.id;
  }
  const resolution = resolutions[entry.key];
  if (!resolution || resolution.action === 'skip') return null;
  if (resolution.action === 'use_match') return resolution.exercise_id;
  const created = createCustomExercise({
    name: entry.planned.exercise_name,
    category: null,
    equipment: [],
    targetMuscle: null,
    secondaryMuscles: [],
    instructions: [],
    measurementType: entry.planned.target_duration_seconds !== null ? 'time' : 'reps_weight',
  });
  createdExercises.push(created);
  return created.id;
}

function buildTemplate(
  preview: ImportPreviewWorkout,
  resolutions: ImportResolutions,
  createdExercises: Exercise[],
  isQuickWorkout: boolean,
): WorkoutTemplate {
  const template = createWorkoutTemplate(preview.name, isQuickWorkout);
  const exercises: PlannedExercise[] = [];
  let order = 1;
  for (const entry of preview.exercises) {
    const exerciseId = resolveExerciseId(entry, resolutions, createdExercises);
    if (!exerciseId) continue; // skipped, intentionally dropped rather than blocking the import
    const planned = createPlannedExercise(exerciseId, order);
    order += 1;
    exercises.push({
      ...planned,
      target_sets: entry.planned.target_sets,
      target_reps_min: entry.planned.target_reps_min,
      target_reps_max: entry.planned.target_reps_max,
      target_weight: entry.planned.target_weight,
      target_rpe: entry.planned.target_rpe,
      target_rir: entry.planned.target_rir,
      target_duration_seconds: entry.planned.target_duration_seconds,
      target_distance_meters: entry.planned.target_distance_meters,
      rest_seconds: entry.planned.rest_seconds,
      notes: entry.planned.notes,
    });
  }
  return { ...template, exercises };
}

/** Writes an approved (and possibly resolution-edited) preview to storage.
 * Nothing here runs until the user has explicitly approved the preview --
 * see docs/IMPORT_FORMAT.md's pipeline. Persists directly (storage-accepting
 * package function, same pattern as ensureExercisesSeeded/setActiveProgram)
 * so a resolved "create custom exercise" exists before the template that
 * references it is written. */
export async function applyImport(
  preview: ImportPreview,
  resolutions: ImportResolutions,
  storage: AtlasStorage,
): Promise<ApplyImportResult> {
  const createdExercises: Exercise[] = [];

  if (preview.kind === 'workout') {
    // A standalone workout import has no Program to attach to -- without
    // is_quick_workout: true it would be an orphan template unreachable from
    // any screen (see docs/DATA_MODEL.md on how a template becomes visible).
    // Confirmed by manual testing, not assumed.
    const template = buildTemplate(preview.workout, resolutions, createdExercises, true);
    for (const exercise of createdExercises) await storage.exercises.put(exercise);
    await storage.workoutTemplates.put(template);
    return { created_exercises: createdExercises, workout_template: template, program: null };
  }

  const program = createProgram(preview.program.name, preview.program.description);
  const weeks = [];
  for (const [weekIndex, week] of preview.program.weeks.entries()) {
    const programWeek = createProgramWeek(weekIndex + 1, week.label);
    const days = [];
    for (const [dayIndex, day] of week.days.entries()) {
      // Each day's template is reached through its ProgramDay, so it must
      // NOT also show up in the Quick Workout library.
      const template = buildTemplate(day.workout, resolutions, createdExercises, false);
      await storage.workoutTemplates.put(template);
      days.push(createProgramDay(dayIndex + 1, day.label, template.id));
    }
    weeks.push({ ...programWeek, days });
  }
  const finalProgram: Program = { ...program, weeks };
  for (const exercise of createdExercises) await storage.exercises.put(exercise);
  await storage.programs.put(finalProgram);

  return { created_exercises: createdExercises, workout_template: null, program: finalProgram };
}
