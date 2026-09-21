/**
 * v1.0.0 (H2). Canonical muscle taxonomy. `Muscle`/`MuscleGroup` are static
 * reference data (not synced entities) — they carry no `SyncMeta` and live in
 * `packages/anatomy`, same as the exercise seed data lives in
 * `exercise-library`. The taxonomy is versioned via `MUSCLE_TAXONOMY_VERSION`
 * (packages/anatomy) so an exercise's `ExerciseMuscleMapping` always records
 * which taxonomy produced it.
 */

export type BodyRegion = 'front' | 'back' | 'deep';

/** A single trainable muscle (a leaf in the taxonomy). */
export interface Muscle {
  id: string;
  name: string;
  group_id: string;
  /** Which Body-Map view shows this muscle prominently. 'deep' muscles are
   * not drawn on the surface map and only appear in textual lists. */
  region: BodyRegion;
  /** The Body-Map SVG region this muscle highlights (shared by muscles that
   * occupy the same drawn region, e.g. the three deltoid heads). */
  svg_id: string;
}

/** A parent grouping of muscles ("Chest", "Back", "Shoulders", ...). */
export interface MuscleGroup {
  id: string;
  name: string;
}

export type MuscleMappingProvenance = 'imported' | 'curated' | 'user';

/**
 * v1.0.0 (H2). Structured primary/secondary muscle mapping for one exercise,
 * distinct from the legacy free-form `target_muscle`/`secondary_muscles`
 * strings (which stay for backward compatibility and existing engines).
 * `primary`/`secondary` hold `Muscle.id`s. `stabilizer` is only populated
 * when the source data supports it reliably.
 */
export interface ExerciseMuscleMapping {
  primary: string[];
  secondary: string[];
  stabilizer?: string[];
  provenance: MuscleMappingProvenance;
  taxonomy_version: string;
}
