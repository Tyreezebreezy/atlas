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
}
