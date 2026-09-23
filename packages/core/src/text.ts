/**
 * The one exercise-name normalization scheme used for matching anywhere in
 * ATLAS -- import matching (`@atlas/import-export`'s `matchExercise`) and
 * canonical-alias matching (`@atlas/exercise-library`'s `resolveAlias`,
 * vNext Handoff 01 §4) share this so "DB Incline Bench" normalizes
 * identically no matter which of the two ever sees it first.
 */
export function normalizeExerciseText(name: string): string {
  return name.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}
