import type { TrainingLocation } from '@atlas/data-model';
import type {
  ImportCompatibilityReport,
  ImportPreview,
  ImportPreviewExercise,
  ImportPreviewWorkout,
  ImportWarning,
} from './types';

function flattenWorkout(workout: ImportPreviewWorkout): {
  exercises: ImportPreviewExercise[];
  warnings: ImportWarning[];
} {
  return { exercises: workout.exercises, warnings: workout.warnings };
}

function flattenPreview(preview: ImportPreview): {
  exercises: ImportPreviewExercise[];
  warnings: ImportWarning[];
} {
  if (preview.kind === 'workout') return flattenWorkout(preview.workout);
  const exercises: ImportPreviewExercise[] = [];
  const warnings: ImportWarning[] = [...preview.program.warnings];
  for (const week of preview.program.weeks) {
    for (const day of week.days) {
      const flat = flattenWorkout(day.workout);
      exercises.push(...flat.exercises);
      warnings.push(...flat.warnings);
    }
  }
  return { exercises, warnings };
}

/** True when EVERY equipment string the exercise needs is present at the
 * active location -- an exercise needing no equipment at all is always
 * compatible. */
function equipmentCovered(exerciseEquipment: string[], locationEquipment: string[]): boolean {
  const available = new Set(locationEquipment.map((e) => e.toLowerCase()));
  return exerciseEquipment.every((need) => available.has(need.toLowerCase()));
}

/**
 * vNext Handoff 01 (§11). Summarizes an already-built `ImportPreview` --
 * itself unchanged, the review/resolve/approve pipeline it feeds into
 * (`applyImport` + `ImportResolutions`) is untouched -- into one flat
 * report. `activeLocation` is optional: omit it (or pass one with no
 * equipment configured) to skip the equipment-compatibility check
 * entirely rather than reporting everything as missing.
 */
export function buildImportCompatibilityReport(
  preview: ImportPreview,
  activeLocation: TrainingLocation | null = null,
): ImportCompatibilityReport {
  const { exercises, warnings } = flattenPreview(preview);

  const matched_exercises = exercises.filter((e) => e.match.matched_exercise != null);
  const alias_matches = matched_exercises.filter((e) => e.match.confidence === 'alias');
  const unresolved_exercises = exercises.filter((e) => e.match.matched_exercise == null);

  const missing_equipment: ImportCompatibilityReport['missing_equipment'] = [];
  if (activeLocation) {
    for (const entry of matched_exercises) {
      const exercise = entry.match.matched_exercise!;
      if (exercise.equipment.length === 0) continue;
      if (!equipmentCovered(exercise.equipment, activeLocation.equipment)) {
        const missing = exercise.equipment.filter(
          (need) => !activeLocation.equipment.some((have) => have.toLowerCase() === need.toLowerCase()),
        );
        missing_equipment.push({ exercise_name: exercise.name, equipment: missing });
      }
    }
  }

  const incompatible_measurement_types: ImportCompatibilityReport['incompatible_measurement_types'] = [];
  for (const entry of matched_exercises) {
    const exercise = entry.match.matched_exercise!;
    const planned = entry.planned;
    const type = exercise.measurement_type;
    if (planned.target_duration_seconds != null && type !== 'time' && type !== 'distance_time') {
      incompatible_measurement_types.push({
        exercise_name: exercise.name,
        reason: `Plan specifies a duration target, but ${exercise.name} is not a timed exercise.`,
      });
    } else if (
      planned.target_weight != null &&
      type !== 'reps_weight' &&
      planned.target_external_load == null
    ) {
      incompatible_measurement_types.push({
        exercise_name: exercise.name,
        reason: `Plan specifies a weight target, but ${exercise.name} doesn't log weight.`,
      });
    }
  }

  return {
    matched_exercises,
    alias_matches,
    unresolved_exercises,
    missing_equipment,
    incompatible_measurement_types,
    warnings,
  };
}
