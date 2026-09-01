import type { SyncMeta } from './sync';

export type MeasurementType =
  'reps' | 'reps_weight' | 'time' | 'distance' | 'distance_time' | 'reps_bodyweight';

export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'carry'
  | 'rotation'
  | 'anti_rotation'
  | 'isolation'
  | 'other';

/**
 * Fields the source dataset doesn't provide but the substitution engine (v0.0.5)
 * needs. Schema exists from v0.0.1; only a representative subset gets populated
 * before then — see docs/EXERCISE_DATA.md.
 */
export interface ExerciseEnrichment {
  movement_pattern: MovementPattern | null;
  movement_family: string | null;
  is_unilateral: boolean | null;
  is_axial_loading: boolean | null;
  purpose: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  known_substitute_ids: string[];
  /** Informational filtering hints only (e.g. 'knee_pain') — never a diagnosis. */
  avoid_if: string[];
}

export type ExerciseMediaKind = 'image' | 'gif' | 'video';

/**
 * Added in v0.1.2 (Stage 5) as an abstraction only -- no exercise in the
 * seeded library has this populated. The source dataset's own media
 * (images/GIFs) is © Gym Visual under its own terms, not the MIT text data
 * ATLAS actually imported, and was deliberately never downloaded (see
 * docs/EXERCISE_DATA.md). `url`/`thumbnail_url` point into a local or
 * remote media pack, never an inlined data URI -- see docs/EXERCISE_MEDIA.md.
 *
 * Optional (not required + null like most other whole-document additions)
 * because unlike `groups`/`progression_mode`, nothing derives a fallback
 * from its absence -- the one read site is a plain `exercise.media?.url`
 * guard, so forcing every existing `Exercise` literal across the test
 * suite to spell out `media: null` would be ripple with no real payoff.
 */
export interface ExerciseMedia {
  kind: ExerciseMediaKind;
  url: string;
  thumbnail_url: string | null;
  attribution: string | null;
}

export interface Exercise extends SyncMeta {
  name: string;
  aliases: string[];
  category: string | null;
  equipment: string[];
  target_muscle: string | null;
  secondary_muscles: string[];
  instructions: string[];
  movement_pattern: MovementPattern | null;
  is_unilateral: boolean | null;
  measurement_type: MeasurementType;
  default_rest_seconds: number | null;
  is_custom: boolean;
  source: string | null;
  source_id: string | null;
  user_notes: string | null;
  enrichment: ExerciseEnrichment | null;
  media?: ExerciseMedia | null;
}
