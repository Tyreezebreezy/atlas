import type { ExerciseReplacement, WorkoutSession, WorkoutTemplate } from '@atlas/data-model';

function touch(session: WorkoutSession): Pick<WorkoutSession, 'updated_at' | 'version'> {
  return { updated_at: new Date().toISOString(), version: session.version + 1 };
}

/**
 * Swaps which exercise fulfills a planned slot for the rest of this session.
 * Sets already logged under the original exercise_id are separate
 * PerformedSet records and are never touched here, so history keeps showing
 * exactly what was actually done -- only the not-yet-performed remainder of
 * the slot points at the replacement from here on.
 */
export function replaceExercise(
  session: WorkoutSession,
  originalExerciseId: string,
  replacementExerciseId: string,
  reason: string | null,
  scope: ExerciseReplacement['scope'],
): WorkoutSession {
  const entry: ExerciseReplacement = {
    original_exercise_id: originalExerciseId,
    replacement_exercise_id: replacementExerciseId,
    reason: reason || null,
    scope,
    replaced_at: new Date().toISOString(),
  };
  return {
    ...session,
    planned_snapshot: session.planned_snapshot.map((planned) =>
      planned.exercise_id === originalExerciseId
        ? { ...planned, exercise_id: replacementExerciseId }
        : planned,
    ),
    replacements: [...session.replacements, entry],
    ...touch(session),
  };
}

/** 'Update Program' scope only -- future sessions started from this template pick up the swap; past sessions keep their own planned_snapshot copy untouched. */
export function applyExerciseReplacementToTemplate(
  template: WorkoutTemplate,
  originalExerciseId: string,
  replacementExerciseId: string,
): WorkoutTemplate {
  return {
    ...template,
    exercises: template.exercises.map((planned) =>
      planned.exercise_id === originalExerciseId
        ? { ...planned, exercise_id: replacementExerciseId }
        : planned,
    ),
    updated_at: new Date().toISOString(),
    version: template.version + 1,
  };
}
