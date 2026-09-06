import type { Exercise } from '@atlas/data-model';
import { matchExercise } from './matchExercise';
import type {
  ImportPreview,
  ImportPreviewExercise,
  ImportPreviewWorkout,
  ImportWarning,
  PlanExerciseTarget,
  PlanProgram,
  PlanWorkout,
} from './types';

export type ParsedPlanInput =
  { kind: 'workout'; workout: PlanWorkout } | { kind: 'program'; program: PlanProgram };

function exerciseWarnings(
  planned: PlanExerciseTarget,
  duplicateNames: Set<string>,
): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  const hasReps = planned.target_reps_min !== null || planned.target_reps_max !== null;
  const hasSets = planned.target_sets !== null;
  const hasDuration = planned.target_duration_seconds !== null;
  const hasDistance = planned.target_distance_meters !== null;
  if (!hasSets && !hasReps && !hasDuration && !hasDistance) {
    warnings.push({
      message: 'No sets, reps, duration, or distance found for this exercise.',
      severity: 'warning',
    });
  } else if (hasSets && !hasReps && !hasDuration && !hasDistance) {
    warnings.push({ message: 'Sets found but no reps, duration, or distance.', severity: 'info' });
  }
  if (duplicateNames.has(planned.exercise_name.toLowerCase())) {
    warnings.push({
      message: 'This exercise name appears more than once in this workout.',
      severity: 'info',
    });
  }
  return warnings;
}

function findDuplicateNames(exercises: PlanExerciseTarget[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const exercise of exercises) {
    const key = exercise.exercise_name.toLowerCase();
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return duplicates;
}

function previewWorkout(
  workout: PlanWorkout,
  library: Exercise[],
  keyPrefix: string,
): ImportPreviewWorkout {
  const duplicateNames = findDuplicateNames(workout.exercises);
  const previewExercises: ImportPreviewExercise[] = workout.exercises.map((planned, index) => {
    // A same-install export/reimport round trip carries exercise_id -- trust it
    // directly rather than re-matching by name when the id still resolves.
    const byId = planned.exercise_id
      ? library.find((e) => e.id === planned.exercise_id)
      : undefined;
    const match = byId
      ? {
          input_name: planned.exercise_name,
          matched_exercise: byId,
          confidence: 'exact' as const,
          candidates: [],
        }
      : matchExercise(planned.exercise_name, library);
    return {
      key: `${keyPrefix}${index}`,
      planned,
      match,
      warnings: exerciseWarnings(planned, duplicateNames),
    };
  });

  const workoutWarnings: ImportWarning[] = [];
  const unresolvedCount = previewExercises.filter(
    (e) => e.match.confidence === 'unresolved',
  ).length;
  if (unresolvedCount > 0) {
    workoutWarnings.push({
      message: `${unresolvedCount} exercise${unresolvedCount === 1 ? '' : 's'} could not be matched to the exercise library.`,
      severity: 'warning',
    });
  }
  if (workout.exercises.length === 0) {
    workoutWarnings.push({ message: 'This workout has no exercises.', severity: 'warning' });
  }

  return {
    name: workout.name,
    is_quick_workout: workout.is_quick_workout,
    exercises: previewExercises,
    warnings: workoutWarnings,
    groups: workout.groups,
  };
}

/** Turns a validated/parsed plan into a review-ready preview: matches every
 * exercise against the current library and surfaces warnings, but writes
 * nothing -- nothing is saved until the user approves (see applyImport). */
export function buildImportPreview(input: ParsedPlanInput, library: Exercise[]): ImportPreview {
  if (input.kind === 'workout') {
    return { kind: 'workout', workout: previewWorkout(input.workout, library, '') };
  }
  const weeks = input.program.weeks.map((week, weekIndex) => ({
    label: week.label,
    days: week.days.map((day, dayIndex) => ({
      label: day.label,
      workout: previewWorkout(day.workout, library, `${weekIndex}.${dayIndex}.`),
    })),
  }));
  const programWarnings: ImportWarning[] = [];
  const totalDays = weeks.reduce((sum, week) => sum + week.days.length, 0);
  if (totalDays === 0) {
    programWarnings.push({ message: 'This program has no days.', severity: 'warning' });
  }
  return {
    kind: 'program',
    program: {
      name: input.program.name,
      description: input.program.description,
      weeks,
      warnings: programWarnings,
    },
  };
}
