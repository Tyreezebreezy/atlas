import { compareByName } from '@atlas/core';
import type { Exercise } from '@atlas/data-model';
import { repairExerciseName } from './formatExerciseName';

export interface ExerciseFilter {
  query?: string;
  bodyPart?: string;
  equipment?: string;
}

/**
 * Favorites sort first (v0.2.0), alphabetical within each group (v0.2.2 --
 * "Do not let favorites make the rest of the list random"). This is the one
 * shared choke-point every exercise list/picker in the app already filters
 * through (Library, Add Exercise, Replace Exercise, the Program builder's
 * picker, Freestyle's Add Exercise), so both favorites-first AND A-Z fall
 * out of one change here rather than five separate ones. Custom exercises
 * are not segregated -- they sort alphabetically alongside everything else,
 * same as any other exercise.
 */
export function searchExercises(exercises: Exercise[], filter: ExerciseFilter): Exercise[] {
  const query = filter.query?.trim().toLowerCase();
  const bodyPart = filter.bodyPart?.toLowerCase();
  const filtered = exercises.filter((exercise) => {
    if (query && !repairExerciseName(exercise.name).toLowerCase().includes(query)) return false;
    // Case-insensitive: "Shoulders" and "shoulders" are one body part, however the row spelled it.
    if (bodyPart && exercise.category?.toLowerCase() !== bodyPart) return false;
    if (filter.equipment && !exercise.equipment.includes(filter.equipment)) return false;
    return true;
  });
  return [...filtered].sort((a, b) => {
    const favA = a.is_favorite ?? false;
    const favB = b.is_favorite ?? false;
    if (favA !== favB) return favA ? -1 : 1;
    return compareByName(a, b);
  });
}

export function listBodyParts(exercises: Exercise[]): string[] {
  // One entry per body part however it is cased (the first spelling met); `searchExercises` matches them all.
  const bySpelling = new Map<string, string>();
  for (const { category } of exercises) {
    if (category !== null && !bySpelling.has(category.toLowerCase()))
      bySpelling.set(category.toLowerCase(), category);
  }
  return [...bySpelling.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

export function listEquipment(exercises: Exercise[]): string[] {
  return [...new Set(exercises.flatMap((e) => e.equipment))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}
