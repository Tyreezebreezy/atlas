import { getOrCreateDeviceId, newId, normalizeExerciseText } from '@atlas/core';
import type { ExerciseAlias, ExerciseAliasSource } from '@atlas/data-model';

export interface CreateExerciseAliasInput {
  exerciseId: string;
  displayAlias: string;
  source: ExerciseAliasSource;
}

export function createExerciseAlias(input: CreateExerciseAliasInput): ExerciseAlias {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    exercise_id: input.exerciseId,
    normalized_alias: normalizeExerciseText(input.displayAlias),
    display_alias: input.displayAlias.trim(),
    source: input.source,
  };
}

/**
 * vNext Handoff 01 (§4): "alias collision handling must be explicit... do
 * not silently map ambiguous names." Returns every OTHER exercise this
 * normalized alias already points to -- empty means no collision. Callers
 * (an import review screen, a "rename/add alias" UI) must check this
 * before persisting a new alias and surface a real conflict to the owner
 * rather than silently overwriting or picking one.
 */
export function findAliasCollisions(
  aliases: ExerciseAlias[],
  displayAlias: string,
  excludeExerciseId?: string,
): string[] {
  const normalized = normalizeExerciseText(displayAlias);
  const exerciseIds = new Set(
    aliases
      .filter((a) => a.normalized_alias === normalized && a.exercise_id !== excludeExerciseId)
      .map((a) => a.exercise_id),
  );
  return [...exerciseIds];
}

export type AliasResolution =
  | { status: 'resolved'; exerciseId: string }
  | { status: 'ambiguous'; exerciseIds: string[] }
  | { status: 'not_found' };

/**
 * Resolves an input name against the alias table alone (the caller is
 * expected to have already tried an exact/normalized name match against
 * the exercise library itself, e.g. via `@atlas/import-export`'s
 * `matchExercise` -- aliases are the fallback layer, not a replacement for
 * matching on the canonical name first). Never silently prefers one
 * exercise over another: if the SAME normalized alias was ever registered
 * for two different exercises (a collision that should have been caught by
 * `findAliasCollisions` at write time but wasn't, e.g. old data), this
 * returns `ambiguous` rather than guessing.
 */
export function resolveAlias(aliases: ExerciseAlias[], inputName: string): AliasResolution {
  const normalized = normalizeExerciseText(inputName);
  const exerciseIds = new Set(
    aliases.filter((a) => a.normalized_alias === normalized).map((a) => a.exercise_id),
  );
  if (exerciseIds.size === 0) return { status: 'not_found' };
  if (exerciseIds.size > 1) return { status: 'ambiguous', exerciseIds: [...exerciseIds] };
  return { status: 'resolved', exerciseId: [...exerciseIds][0]! };
}
