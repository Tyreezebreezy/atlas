import type {
  Exercise,
  ExerciseEnrichment,
  MeasurementType,
  MovementPattern,
} from '@atlas/data-model';

/**
 * Hand-curated metadata for a representative subset of the 1,324-exercise
 * seed (~30 common gym movements), keyed by the dataset's own lowercase
 * `name` string. The source dataset doesn't provide movement pattern,
 * substitute relationships, or rest defaults -- this is what the
 * substitution engine (packages/substitution-engine) and the rest-duration
 * hierarchy (packages/workout-engine's timer.ts) need to have *something*
 * real to work with, not a claim that every exercise is enriched. See
 * docs/EXERCISE_DATA.md and docs/SUBSTITUTIONS.md.
 *
 * `substitutes` names other keys in this same table; unresolved names (a
 * typo, or a substitute that isn't itself curated) are silently dropped
 * rather than thrown on, since a best-effort curated list is expected to be
 * imperfect and a seed-time crash would be a worse failure mode than a
 * shorter substitute list.
 */
interface CuratedEntry {
  movement_pattern: MovementPattern;
  is_unilateral: boolean;
  default_rest_seconds: number;
  movement_family: string;
  is_axial_loading: boolean;
  purpose: string;
  difficulty: NonNullable<ExerciseEnrichment['difficulty']>;
  substitutes: string[];
  /**
   * v0.0.6: corrects a handful of true bodyweight-rep movements that the
   * v0.0.2 import heuristic mapped to `reps_weight` (its heuristic only
   * ever produces 'reps_weight' or 'time' -- see docs/EXERCISE_DATA.md).
   * Deliberately name-matched via this same curated table rather than a
   * separate ID-pinned table: exact seed-data ids aren't stable across a
   * re-import, names are, and this keeps one enrichment mechanism instead
   * of two. See docs/PRS.md "Bodyweight exercise path."
   */
  measurement_type_override?: MeasurementType;
}

export const CURATED_ENRICHMENT: Record<string, CuratedEntry> = {
  'barbell bench press': {
    movement_pattern: 'horizontal_push',
    is_unilateral: false,
    default_rest_seconds: 150,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'primary_compound',
    difficulty: 'intermediate',
    substitutes: ['dumbbell bench press', 'lever chest press'],
  },
  'dumbbell bench press': {
    movement_pattern: 'horizontal_push',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['barbell bench press', 'lever chest press'],
  },
  'barbell incline bench press': {
    movement_pattern: 'horizontal_push',
    is_unilateral: false,
    default_rest_seconds: 150,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'primary_compound',
    difficulty: 'intermediate',
    substitutes: ['dumbbell incline bench press'],
  },
  'dumbbell incline bench press': {
    movement_pattern: 'horizontal_push',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['barbell incline bench press'],
  },
  'lever chest press': {
    movement_pattern: 'horizontal_push',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['barbell bench press', 'dumbbell bench press'],
  },
  'barbell seated overhead press': {
    movement_pattern: 'vertical_push',
    is_unilateral: false,
    default_rest_seconds: 150,
    movement_family: 'press',
    is_axial_loading: true,
    purpose: 'primary_compound',
    difficulty: 'intermediate',
    substitutes: ['dumbbell standing overhead press'],
  },
  'dumbbell standing overhead press': {
    movement_pattern: 'vertical_push',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'intermediate',
    substitutes: ['barbell seated overhead press'],
  },
  'dumbbell lateral raise': {
    movement_pattern: 'isolation',
    is_unilateral: false,
    default_rest_seconds: 60,
    movement_family: 'raise',
    is_axial_loading: false,
    purpose: 'isolation',
    difficulty: 'beginner',
    substitutes: [],
  },
  'pull-up': {
    movement_pattern: 'vertical_pull',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'pull',
    is_axial_loading: false,
    purpose: 'primary_compound',
    difficulty: 'intermediate',
    substitutes: ['cable lat pulldown full range of motion', 'chin-up'],
    measurement_type_override: 'reps_bodyweight',
  },
  'chin-up': {
    movement_pattern: 'vertical_pull',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'pull',
    is_axial_loading: false,
    purpose: 'primary_compound',
    difficulty: 'intermediate',
    substitutes: ['pull-up', 'cable lat pulldown full range of motion'],
    measurement_type_override: 'reps_bodyweight',
  },
  'cable lat pulldown full range of motion': {
    movement_pattern: 'vertical_pull',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'pull',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['pull-up'],
  },
  'barbell bent over row': {
    movement_pattern: 'horizontal_pull',
    is_unilateral: false,
    default_rest_seconds: 120,
    movement_family: 'pull',
    is_axial_loading: true,
    purpose: 'primary_compound',
    difficulty: 'intermediate',
    substitutes: ['cable seated row'],
  },
  'cable seated row': {
    movement_pattern: 'horizontal_pull',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'pull',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['barbell bent over row'],
  },
  'inverted row': {
    movement_pattern: 'horizontal_pull',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'pull',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['cable seated row'],
    measurement_type_override: 'reps_bodyweight',
  },
  'barbell full squat': {
    movement_pattern: 'squat',
    is_unilateral: false,
    default_rest_seconds: 180,
    movement_family: 'squat',
    is_axial_loading: true,
    purpose: 'primary_compound',
    difficulty: 'advanced',
    substitutes: ['barbell front squat', 'dumbbell goblet squat', 'lever horizontal one leg press'],
  },
  'barbell front squat': {
    movement_pattern: 'squat',
    is_unilateral: false,
    default_rest_seconds: 150,
    movement_family: 'squat',
    is_axial_loading: true,
    purpose: 'primary_compound',
    difficulty: 'intermediate',
    substitutes: ['barbell full squat', 'dumbbell goblet squat'],
  },
  'barbell hack squat': {
    movement_pattern: 'squat',
    is_unilateral: false,
    default_rest_seconds: 150,
    movement_family: 'squat',
    is_axial_loading: true,
    purpose: 'accessory_compound',
    difficulty: 'advanced',
    substitutes: ['lever horizontal one leg press'],
  },
  'lever horizontal one leg press': {
    movement_pattern: 'squat',
    is_unilateral: true,
    default_rest_seconds: 90,
    movement_family: 'squat',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['barbell full squat', 'dumbbell goblet squat'],
  },
  'dumbbell goblet squat': {
    movement_pattern: 'squat',
    is_unilateral: false,
    default_rest_seconds: 60,
    movement_family: 'squat',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['barbell full squat', 'lever horizontal one leg press'],
  },
  'dumbbell single leg split squat': {
    movement_pattern: 'squat',
    is_unilateral: true,
    default_rest_seconds: 90,
    movement_family: 'squat',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'intermediate',
    substitutes: ['barbell single leg split squat'],
  },
  'barbell single leg split squat': {
    movement_pattern: 'squat',
    is_unilateral: true,
    default_rest_seconds: 120,
    movement_family: 'squat',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'advanced',
    substitutes: ['dumbbell single leg split squat'],
  },
  'barbell romanian deadlift': {
    movement_pattern: 'hinge',
    is_unilateral: false,
    default_rest_seconds: 150,
    movement_family: 'hinge',
    is_axial_loading: true,
    purpose: 'primary_compound',
    difficulty: 'intermediate',
    substitutes: ['dumbbell romanian deadlift', 'barbell deadlift'],
  },
  'dumbbell romanian deadlift': {
    movement_pattern: 'hinge',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'hinge',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['barbell romanian deadlift'],
  },
  'barbell deadlift': {
    movement_pattern: 'hinge',
    is_unilateral: false,
    default_rest_seconds: 180,
    movement_family: 'hinge',
    is_axial_loading: true,
    purpose: 'primary_compound',
    difficulty: 'advanced',
    substitutes: ['barbell romanian deadlift'],
  },
  'lever seated leg curl': {
    movement_pattern: 'isolation',
    is_unilateral: false,
    default_rest_seconds: 60,
    movement_family: 'curl',
    is_axial_loading: false,
    purpose: 'isolation',
    difficulty: 'beginner',
    substitutes: [],
  },
  'lever leg extension': {
    movement_pattern: 'isolation',
    is_unilateral: false,
    default_rest_seconds: 60,
    movement_family: 'extension',
    is_axial_loading: false,
    purpose: 'isolation',
    difficulty: 'beginner',
    substitutes: [],
  },
  'barbell curl': {
    movement_pattern: 'isolation',
    is_unilateral: false,
    default_rest_seconds: 60,
    movement_family: 'curl',
    is_axial_loading: false,
    purpose: 'isolation',
    difficulty: 'intermediate',
    substitutes: ['dumbbell biceps curl', 'dumbbell alternate biceps curl'],
  },
  'dumbbell biceps curl': {
    movement_pattern: 'isolation',
    is_unilateral: false,
    default_rest_seconds: 60,
    movement_family: 'curl',
    is_axial_loading: false,
    purpose: 'isolation',
    difficulty: 'beginner',
    substitutes: ['barbell curl', 'dumbbell alternate biceps curl'],
  },
  'dumbbell alternate biceps curl': {
    movement_pattern: 'isolation',
    is_unilateral: true,
    default_rest_seconds: 60,
    movement_family: 'curl',
    is_axial_loading: false,
    purpose: 'isolation',
    difficulty: 'beginner',
    substitutes: ['dumbbell biceps curl', 'barbell curl'],
  },
  'cable triceps pushdown (v-bar)': {
    movement_pattern: 'isolation',
    is_unilateral: false,
    default_rest_seconds: 60,
    movement_family: 'pushdown',
    is_axial_loading: false,
    purpose: 'isolation',
    difficulty: 'beginner',
    substitutes: ['triceps dip'],
  },
  'chest dip': {
    movement_pattern: 'vertical_push',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'intermediate',
    substitutes: ['push-up'],
    measurement_type_override: 'reps_bodyweight',
  },
  'triceps dip': {
    movement_pattern: 'vertical_push',
    is_unilateral: false,
    default_rest_seconds: 90,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'intermediate',
    substitutes: ['cable triceps pushdown (v-bar)'],
    measurement_type_override: 'reps_bodyweight',
  },
  'push-up': {
    movement_pattern: 'horizontal_push',
    is_unilateral: false,
    default_rest_seconds: 60,
    movement_family: 'press',
    is_axial_loading: false,
    purpose: 'accessory_compound',
    difficulty: 'beginner',
    substitutes: ['chest dip', 'dumbbell bench press'],
    measurement_type_override: 'reps_bodyweight',
  },
  'weighted front plank': {
    movement_pattern: 'anti_rotation',
    is_unilateral: false,
    default_rest_seconds: 45,
    movement_family: 'core',
    is_axial_loading: false,
    purpose: 'core_stability',
    difficulty: 'beginner',
    substitutes: [],
    // v0.0.7: EXERCISE_DATA.md already flags planks as a known import-
    // heuristic miss ("timed core exercises... still come in as
    // reps_weight"). This is the closest exact dataset name to a plain
    // plank -- the "weighted" in its name is a dataset-naming artifact,
    // not a statement that added weight is required; no weight field
    // shows once this is 'time' (see ExerciseLogger's showsWeight gate).
    measurement_type_override: 'time',
  },
  'hanging leg raise': {
    movement_pattern: 'isolation',
    is_unilateral: false,
    default_rest_seconds: 45,
    movement_family: 'core',
    is_axial_loading: false,
    purpose: 'core_stability',
    difficulty: 'advanced',
    substitutes: [],
  },
};

/** Applied once at first-seed time -- see ensureExercisesSeeded.ts. Not a migration for already-seeded installs; see docs/EXERCISE_DATA.md. */
export function applyCuratedEnrichment(exercises: Exercise[]): Exercise[] {
  const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e]));

  return exercises.map((exercise) => {
    const curated = CURATED_ENRICHMENT[exercise.name.toLowerCase()];
    if (!curated) return exercise;

    const known_substitute_ids = curated.substitutes
      .map((name) => byName.get(name.toLowerCase())?.id)
      .filter((id): id is string => id != null);

    return {
      ...exercise,
      movement_pattern: curated.movement_pattern,
      is_unilateral: curated.is_unilateral,
      default_rest_seconds: curated.default_rest_seconds,
      measurement_type: curated.measurement_type_override ?? exercise.measurement_type,
      enrichment: {
        movement_pattern: curated.movement_pattern,
        movement_family: curated.movement_family,
        is_unilateral: curated.is_unilateral,
        is_axial_loading: curated.is_axial_loading,
        purpose: curated.purpose,
        difficulty: curated.difficulty,
        known_substitute_ids,
        avoid_if: [],
      },
    };
  });
}
