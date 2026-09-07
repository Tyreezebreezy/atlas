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

export type ExerciseMediaKind = 'image' | 'gif' | 'video' | 'frame-sequence';

/**
 * v0.1.5: which external media source populated this exercise's media,
 * distinguishing it in code from the media LICENSE (also present per-record
 * via `attribution`, but this is what selection/reporting logic keys off
 * of). See docs/EXERCISE_MEDIA.md "Provider model."
 */
export type ExerciseMediaProvider = 'workout-guide' | 'free-exercise-db';

/**
 * Added in v0.1.2 (Stage 5) as an abstraction only -- no exercise in the
 * seeded library had this populated at the time. `url`/`thumbnail_url`
 * point into a local or remote media pack, never an inlined data URI --
 * see docs/EXERCISE_MEDIA.md.
 *
 * `frame-sequence` (v0.1.3) is a lightweight demonstration loop over a
 * handful of static frames (`frames`, ordered) instead of a single image
 * or a real video -- see docs/EXERCISE_MEDIA.md's Workout Guide
 * integration. `url` is still required for this kind too: it's the first
 * frame, used as the reduced-motion-safe static fallback and before any
 * animation logic has run. v0.1.5 reuses this same kind (not a new
 * "two-state" kind) for Free Exercise DB's start/end pose pairs -- a
 * `frames` array of length 2 cycles `start → end → start → end` through
 * the identical rendering code, since nothing about that loop assumes
 * exactly 3 frames.
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
  /** `frame-sequence` only, ordered, `frames[0] === url`. */
  frames?: string[];
  thumbnail_url: string | null;
  attribution: string | null;
  /** v0.1.5. Optional for the same reason as the rest of this interface --
   * absent on any media created before this field existed, and nothing
   * reads it with a required fallback. `provider_source_id` is that
   * provider's own upstream identifier for this exercise (a Workout Guide
   * `slug` or a Free Exercise DB `id`), kept so a mapping can be traced
   * back to its source without re-deriving it. */
  provider?: ExerciseMediaProvider;
  provider_source_id?: string;
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
