import type { Exercise } from '@atlas/data-model';

export interface WorkoutGuideFrameAttribution {
  creator: string;
  creatorUrl: string;
  license: string;
  licenseUrl: string;
  source?: { name: string; url: string; license: string; licenseUrl: string; changes: string };
}

export interface WorkoutGuideFrame {
  index: number;
  path: string;
  width: number;
  height: number;
  format: string;
  attribution: WorkoutGuideFrameAttribution;
}

export interface WorkoutGuideEntry {
  id: string;
  slug: string;
  name: string;
  exerciseType: string;
  equipment: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  isStretch: boolean;
  frames: WorkoutGuideFrame[];
  attribution: WorkoutGuideFrameAttribution;
}

export type MediaMatchTier = 'exact' | 'normalized' | 'alias' | 'explicit';

export interface MediaMatch {
  workoutGuideSlug: string;
  atlasExerciseId: string;
  tier: MediaMatchTier;
}

export interface MediaMappingReport {
  sourceExerciseCount: number;
  matched: MediaMatch[];
  /** A workout-guide name that normalized-matched more than one ATLAS
   * exercise (e.g. the source dataset's own known duplicate rows, see
   * docs/EXERCISE_DATA.md) -- never auto-resolved, per "do not guess
   * ambiguous matches." */
  ambiguous: { workoutGuideSlug: string; workoutGuideName: string; atlasExerciseIds: string[] }[];
  unresolved: { workoutGuideSlug: string; workoutGuideName: string }[];
  atlasWithoutMediaCount: number;
}

function normalize(name: string): string {
  // Punctuation becomes a space, not deleted outright -- "Pull-Up" and
  // "pull up" must normalize identically, which deleting the hyphen
  // outright would break ("Pull-Up" -> "pullup" vs "pull up" unchanged).
  return name
    .toLowerCase()
    .replace(/[.,'’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hand-resolved pairs for workout-guide slugs that don't auto-resolve
 * against ATLAS's naming, reviewed individually against the real
 * unresolved list produced by a first pass of this matcher -- never
 * guessed ahead of seeing it. Keyed by workout-guide `slug`, valued by the
 * exact ATLAS `Exercise.name` (all-lowercase in the seed data) to pair it
 * with. See docs/EXERCISE_MEDIA.md.
 *
 * Two groups:
 * 1. Equipment-corroborated unique matches -- the ATLAS name uniquely
 *    contains the workout-guide name as a prefix/suffix AND the
 *    equipment agrees (e.g. "Straight-Arm Pulldown" (Cable) ->
 *    "cable straight arm pulldown"). A same set of candidates that
 *    disagreed on equipment (e.g. "Pistol Squat" (Bodyweight) only
 *    candidate being "kettlebell pistol squat") was deliberately left
 *    unresolved instead, since that's a different exercise, not a naming
 *    variant of the same one.
 * 2. Canonical-default picks for common *unqualified* lift names that
 *    matched dozens of ATLAS equipment/angle variants (e.g. plain
 *    "Squat" against ~60 ATLAS squat variants) -- resolved to the single
 *    variant most people mean by the unqualified name, the same kind of
 *    judgment call curatedEnrichment.ts already makes for its own ~33
 *    entries (reusing its exact picks where it already covers the same
 *    movement, e.g. overhead press). Every other multi-candidate
 *    workout-guide entry was left unresolved rather than guessed --
 *    see the mapping report in docs/EXERCISE_MEDIA.md for the full list.
 */
export const EXPLICIT_MEDIA_MAPPING: Record<string, string> = {
  'straight-arm-pulldown': 'cable straight arm pulldown',
  'seated-leg-curl': 'lever seated leg curl',
  'tricep-pushdown': 'cable one arm tricep pushdown',
  'skull-crusher': 'barbell lying triceps extension skull crusher',
  'pendlay-row': 'barbell pendlay row',
  'assisted-chin-up': 'lever assisted chin-up',
  'rack-pull': 'barbell rack pull',
  'sumo-deadlift': 'barbell sumo deadlift',
  'lying-leg-curl': 'lever lying leg curl',
  'cable-pull-through': 'cable pull through (with rope)',
  'reverse-hyperextension': 'lever reverse hyperextension',
  'lying-leg-raise': 'lying leg raise flat bench',
  'bench-press': 'barbell bench press',
  squat: 'barbell full squat',
  deadlift: 'barbell deadlift',
  'barbell-row': 'barbell bent over row',
  'bicep-curl': 'barbell curl',
  'overhead-press': 'barbell seated overhead press',
};

/**
 * Matches the ~302 Workout Guide entries against the ATLAS library.
 * Deterministic, order-sensitive: exact name -> normalized name -> known
 * ATLAS alias -> explicit mapping table -> unresolved. ATLAS has no
 * enrichment-level alias field distinct from `Exercise.aliases` (the
 * handoff's "ATLAS enrichment alias" tier), so that tier is a documented
 * no-op rather than an invented field. Never auto-resolves an ambiguous
 * match (a workout-guide name matching more than one ATLAS exercise at
 * the same tier).
 */
export function matchWorkoutGuideMedia(
  atlasExercises: Exercise[],
  workoutGuideEntries: WorkoutGuideEntry[],
): MediaMappingReport {
  const matched: MediaMatch[] = [];
  const ambiguous: MediaMappingReport['ambiguous'] = [];
  const unresolved: MediaMappingReport['unresolved'] = [];

  for (const entry of workoutGuideEntries) {
    const normalizedName = normalize(entry.name);

    const exact = atlasExercises.filter((e) => e.name === entry.name);
    if (exact.length === 1 && exact[0]) {
      matched.push({ workoutGuideSlug: entry.slug, atlasExerciseId: exact[0].id, tier: 'exact' });
      continue;
    }
    if (exact.length > 1) {
      ambiguous.push({
        workoutGuideSlug: entry.slug,
        workoutGuideName: entry.name,
        atlasExerciseIds: exact.map((e) => e.id),
      });
      continue;
    }

    const normalized = atlasExercises.filter((e) => normalize(e.name) === normalizedName);
    if (normalized.length === 1 && normalized[0]) {
      matched.push({
        workoutGuideSlug: entry.slug,
        atlasExerciseId: normalized[0].id,
        tier: 'normalized',
      });
      continue;
    }
    if (normalized.length > 1) {
      ambiguous.push({
        workoutGuideSlug: entry.slug,
        workoutGuideName: entry.name,
        atlasExerciseIds: normalized.map((e) => e.id),
      });
      continue;
    }

    const alias = atlasExercises.filter((e) =>
      e.aliases.some((a) => normalize(a) === normalizedName),
    );
    if (alias.length === 1 && alias[0]) {
      matched.push({ workoutGuideSlug: entry.slug, atlasExerciseId: alias[0].id, tier: 'alias' });
      continue;
    }
    if (alias.length > 1) {
      ambiguous.push({
        workoutGuideSlug: entry.slug,
        workoutGuideName: entry.name,
        atlasExerciseIds: alias.map((e) => e.id),
      });
      continue;
    }

    // Tier 4 (ATLAS enrichment alias) has no corresponding field to check --
    // falls through to the explicit table.

    const explicitName = EXPLICIT_MEDIA_MAPPING[entry.slug];
    const explicitMatch = explicitName
      ? atlasExercises.find((e) => e.name === explicitName)
      : undefined;
    if (explicitMatch) {
      matched.push({
        workoutGuideSlug: entry.slug,
        atlasExerciseId: explicitMatch.id,
        tier: 'explicit',
      });
      continue;
    }

    unresolved.push({ workoutGuideSlug: entry.slug, workoutGuideName: entry.name });
  }

  const matchedAtlasIds = new Set(matched.map((m) => m.atlasExerciseId));
  return {
    sourceExerciseCount: workoutGuideEntries.length,
    matched,
    ambiguous,
    unresolved,
    atlasWithoutMediaCount: atlasExercises.length - matchedAtlasIds.size,
  };
}
