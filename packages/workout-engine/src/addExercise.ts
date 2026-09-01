import type { WorkoutSession, WorkoutTemplate } from '@atlas/data-model';
import { createPlannedExercise } from './createPlannedExercise';

function touch(session: WorkoutSession): Pick<WorkoutSession, 'updated_at' | 'version'> {
  return { updated_at: new Date().toISOString(), version: session.version + 1 };
}

/** Appends a new exercise to the end of this session's remaining slots --
 * same conceptual model as replaceExercise: this session's
 * planned_snapshot is always updated; the source template is only
 * touched separately, for 'program' scope. Inserting anywhere but the end
 * isn't supported yet ("do not overcomplicate reorder UX initially"). */
export function addExerciseToSession(session: WorkoutSession, exerciseId: string): WorkoutSession {
  const planned = createPlannedExercise(exerciseId, session.planned_snapshot.length);
  return {
    ...session,
    planned_snapshot: [...session.planned_snapshot, planned],
    ...touch(session),
  };
}

/** 'Update Program' scope only -- future sessions started from this
 * template pick up the addition; a session already started keeps its own
 * planned_snapshot copy untouched, same as applyExerciseReplacementToTemplate. */
export function addExerciseToTemplate(
  template: WorkoutTemplate,
  exerciseId: string,
): WorkoutTemplate {
  const planned = createPlannedExercise(exerciseId, template.exercises.length);
  return {
    ...template,
    exercises: [...template.exercises, planned],
    updated_at: new Date().toISOString(),
    version: template.version + 1,
  };
}
