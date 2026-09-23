import type { SyncMeta } from './sync';

/**
 * vNext Handoff 01 (Section 4). A named alternate spelling for a canonical
 * `Exercise`, kept as its own entity (not a bare string on `Exercise`,
 * which already has a simpler `aliases: string[]` used internally by
 * media/import name-matching — this is deliberately a SEPARATE, additive
 * layer, not a replacement for it; consolidating the two is future work,
 * not this handoff).
 *
 * `normalized_alias` is the lowercased/trimmed form used for matching
 * (see `@atlas/core`'s `normalizeExerciseText`); `display_alias` is what
 * the owner or an import actually typed, preserved verbatim. Two aliases
 * with the same `normalized_alias` pointing at DIFFERENT exercises is a
 * collision — resolution code must surface that explicitly, never pick
 * one silently (see `resolveAlias` in `@atlas/exercise-library`).
 */
export type ExerciseAliasSource = 'import' | 'user' | 'curated';

export interface ExerciseAlias extends SyncMeta {
  exercise_id: string;
  normalized_alias: string;
  display_alias: string;
  source: ExerciseAliasSource;
}
