import type { Exercise } from '@atlas/data-model';

export interface ExerciseFilter {
  query?: string;
  bodyPart?: string;
  equipment?: string;
}

/**
 * Favorites sort first (v0.2.0) -- a stable sort, so within "favorite" and
 * "not favorite" the existing relative order (whatever the caller's source
 * list order already was) is preserved rather than re-shuffled. This is
 * the one shared choke-point every exercise list/picker in the app already
 * filters through (Library, Add Exercise, Replace Exercise, the Program
 * builder's picker), so favorites rising everywhere falls out of one
 * change here rather than four separate ones.
 */
export function searchExercises(exercises: Exercise[], filter: ExerciseFilter): Exercise[] {
  const query = filter.query?.trim().toLowerCase();
  const filtered = exercises.filter((exercise) => {
    if (query && !exercise.name.toLowerCase().includes(query)) return false;
    if (filter.bodyPart && exercise.category !== filter.bodyPart) return false;
    if (filter.equipment && !exercise.equipment.includes(filter.equipment)) return false;
    return true;
  });
  return filtered
    .map((exercise, index) => ({ exercise, index }))
    .sort((a, b) => {
      const favA = a.exercise.is_favorite ?? false;
      const favB = b.exercise.is_favorite ?? false;
      if (favA !== favB) return favA ? -1 : 1;
      return a.index - b.index; // stable: preserve original relative order
    })
    .map(({ exercise }) => exercise);
}

export function listBodyParts(exercises: Exercise[]): string[] {
  const values = exercises.map((e) => e.category).filter((c): c is string => c !== null);
  return [...new Set(values)].sort();
}

export function listEquipment(exercises: Exercise[]): string[] {
  return [...new Set(exercises.flatMap((e) => e.equipment))].sort();
}
