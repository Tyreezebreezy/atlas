import type { Exercise } from '@atlas/data-model';
import { disambiguateByPredicates, fuzzyKey, normalize } from './mediaMatching';

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

export type MediaMatchTier = 'exact' | 'normalized' | 'fuzzy' | 'alias' | 'metadata' | 'explicit';

export interface MediaMatch {
  workoutGuideSlug: string;
  atlasExerciseId: string;
  tier: MediaMatchTier;
}

export interface MediaMappingReport {
  sourceExerciseCount: number;
  matched: MediaMatch[];
  /** A workout-guide name that matched more than one ATLAS exercise at the
   * same tier and could not be deterministically narrowed by equipment/
   * muscle metadata either -- never auto-resolved, per "do not guess
   * ambiguous matches." */
  ambiguous: { workoutGuideSlug: string; workoutGuideName: string; atlasExerciseIds: string[] }[];
  unresolved: { workoutGuideSlug: string; workoutGuideName: string }[];
  atlasWithoutMediaCount: number;
}

function equipmentToken(value: string): string {
  const v = value.toLowerCase().trim();
  return v === 'bodyweight' ? 'body weight' : v;
}

/** Workout-Guide-specific wrapper around the shared disambiguator: equipment
 * first, then primary muscle. See `disambiguateByPredicates` for why this
 * is metadata-as-tiebreaker, never metadata-as-primary-signal. */
function disambiguateByMetadata(entry: WorkoutGuideEntry, candidates: Exercise[]): Exercise | null {
  const entryEquipment = equipmentToken(entry.equipment);
  const entryMuscle = entry.primaryMuscle.toLowerCase().trim();
  return disambiguateByPredicates(
    candidates,
    (e) => e.equipment.some((eq) => equipmentToken(eq) === entryEquipment),
    (e) => (e.target_muscle ?? '').toLowerCase().trim() === entryMuscle,
  );
}

/**
 * Hand-resolved pairs for workout-guide slugs that don't auto-resolve
 * against ATLAS's naming, reviewed individually against the real
 * unresolved list produced by this matcher -- never guessed ahead of
 * seeing it. Keyed by workout-guide `slug`, valued by the exact ATLAS
 * `Exercise.name` (all-lowercase in the seed data). See
 * docs/EXERCISE_MEDIA.md.
 *
 * Three groups:
 * 1. Equipment-corroborated unique matches -- the ATLAS name uniquely
 *    contains the workout-guide name as a prefix/suffix AND the equipment
 *    agrees (e.g. "Straight-Arm Pulldown" (Cable) -> "cable straight arm
 *    pulldown"). A same set of candidates that disagreed on equipment
 *    (e.g. "Pistol Squat" (Bodyweight) only candidate being "kettlebell
 *    pistol squat") was deliberately left unresolved instead, since
 *    that's a different exercise, not a naming variant of the same one --
 *    this applies just as much to the newer entries below (e.g. "Lateral
 *    Raise" (Dumbbell) was left unresolved despite a "cable lateral
 *    raise" candidate existing, for the identical reason).
 * 2. Canonical-default picks for common *unqualified* lift names that
 *    matched dozens of ATLAS equipment/angle variants (e.g. plain
 *    "Squat" against ~60 ATLAS squat variants) -- resolved to the single
 *    variant most people mean by the unqualified name, the same kind of
 *    judgment call curatedEnrichment.ts already makes for its own ~33
 *    entries (reusing its exact picks where it already covers the same
 *    movement, e.g. overhead press).
 * 3. (v0.1.4) Same-movement naming variants the automated `fuzzy` tier
 *    can't reach because ATLAS's name is a strict superset of the
 *    workout-guide name (an added equipment prefix, e.g. "Close-Grip
 *    Bench Press" -> "barbell close-grip bench press") rather than a
 *    reordering/pluralization/spelling difference -- reviewed the same
 *    way as group 1, equipment/name corroborated by hand, one at a time.
 * Every other multi-candidate or no-candidate workout-guide entry was
 * left unresolved rather than guessed -- see the mapping report in
 * docs/EXERCISE_MEDIA.md for the full list.
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
  // Group 3, added v0.1.4 (equipment-prefix superset the `fuzzy` tier can't bridge):
  'close-grip-bench-press': 'barbell close-grip bench press',
  't-bar-row': 'lever t bar row',
  'decline-dumbbell-press': 'dumbbell decline bench press',
  'smith-machine-bench-press': 'smith bench press',
  'standing-dumbbell-press': 'dumbbell standing overhead press',
  'cable-standing-hip-adduction': 'cable hip adduction',
  'arnold-press': 'dumbbell arnold press',
  'rear-delt-fly': 'dumbbell rear fly',
  'upright-row': 'barbell upright row',
  'romanian-deadlift': 'barbell romanian deadlift',
  'front-squat': 'barbell front squat',
  'leg-extension': 'lever leg extension',
  'good-morning': 'barbell good morning',
  'hammer-curl': 'dumbbell hammer curl',
  'reverse-curl': 'barbell reverse curl',
  'cable-crunch': 'cable kneeling crunch',
  'goblet-squat': 'dumbbell goblet squat',
  'ez-bar-curl': 'ez barbell curl',
  'drag-curl': 'barbell drag curl',
  'wide-push-up': 'wide hand push up',
  'l-sit-pull-up': 'l-pull-up',
  'forward-lunge': 'forward lunge (male)',
  'plank-shoulder-tap': 'shoulder tap',
  'single-leg-glute-bridge': 'single leg bridge with outstretched leg',
  'smith-machine-split-squat': 'smith single leg split squat',
  // Note: 'smith-machine-bulgarian-split-squat' was deliberately NOT also
  // mapped here -- it fuzzy-candidates to this same ATLAS exercise, but a
  // rear-foot-elevated Bulgarian split squat is a real enough form
  // difference from a plain split squat (and the media-integrity test
  // rejects two source slugs claiming one ATLAS id as a conflict) that
  // it's left unresolved rather than sharing this animation.
};

/**
 * Matches the ~302 Workout Guide entries against the ATLAS library.
 * Deterministic, order-sensitive: exact name -> normalized name -> fuzzy
 * (order/plural/compound-word/equipment-shorthand-insensitive) name,
 * disambiguated by equipment/muscle metadata when the fuzzy tier alone is
 * ambiguous -> known ATLAS alias (same fuzzy comparison) -> explicit
 * mapping table -> unresolved.
 *
 * Two of the handoff's twelve conceptual tiers are documented no-ops
 * rather than invented fields: "ATLAS enrichment alias" (no such field
 * exists distinct from `Exercise.aliases`) and "ATLAS enrichment data"
 * (`curatedEnrichment.ts`'s `movement_family` etc. are categorical
 * training metadata for the substitution engine, not name variants --
 * too generic, shared by dozens of exercises, to identify one). "Workout
 * Guide metadata" is real, not a no-op, but only as a disambiguator (see
 * `disambiguateByMetadata`), never a primary match signal.
 *
 * Never auto-resolves an ambiguous match (a workout-guide name matching
 * more than one ATLAS exercise at the same tier that metadata can't
 * narrow to exactly one).
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
    const fuzzyName = fuzzyKey(entry.name);

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

    const fuzzy = atlasExercises.filter((e) => fuzzyKey(e.name) === fuzzyName);
    if (fuzzy.length === 1 && fuzzy[0]) {
      matched.push({ workoutGuideSlug: entry.slug, atlasExerciseId: fuzzy[0].id, tier: 'fuzzy' });
      continue;
    }
    if (fuzzy.length > 1) {
      const resolved = disambiguateByMetadata(entry, fuzzy);
      if (resolved) {
        matched.push({
          workoutGuideSlug: entry.slug,
          atlasExerciseId: resolved.id,
          tier: 'metadata',
        });
        continue;
      }
      ambiguous.push({
        workoutGuideSlug: entry.slug,
        workoutGuideName: entry.name,
        atlasExerciseIds: fuzzy.map((e) => e.id),
      });
      continue;
    }

    const alias = atlasExercises.filter((e) => e.aliases.some((a) => fuzzyKey(a) === fuzzyName));
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
