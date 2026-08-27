import type { Exercise } from '@atlas/data-model';

export interface ExerciseFilter {
  query?: string;
  bodyPart?: string;
  equipment?: string;
}

export function searchExercises(exercises: Exercise[], filter: ExerciseFilter): Exercise[] {
  const query = filter.query?.trim().toLowerCase();
  return exercises.filter((exercise) => {
    if (query && !exercise.name.toLowerCase().includes(query)) return false;
    if (filter.bodyPart && exercise.category !== filter.bodyPart) return false;
    if (filter.equipment && !exercise.equipment.includes(filter.equipment)) return false;
    return true;
  });
}

export function listBodyParts(exercises: Exercise[]): string[] {
  const values = exercises.map((e) => e.category).filter((c): c is string => c !== null);
  return [...new Set(values)].sort();
}

export function listEquipment(exercises: Exercise[]): string[] {
  return [...new Set(exercises.flatMap((e) => e.equipment))].sort();
}
