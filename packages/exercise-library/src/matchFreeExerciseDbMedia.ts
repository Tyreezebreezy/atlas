import type { Exercise } from '@atlas/data-model';
import { disambiguateByPredicates, fuzzyKey, normalize } from './mediaMatching';

export interface FreeExerciseDbEntry {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  /** Relative paths, e.g. "3_4_Sit-Up/0.jpg" -- 0 = start pose, 1 = end
   * pose. 873 of the upstream 876 entries have exactly 2; 3 have 0 (see
   * docs/EXERCISE_MEDIA.md) and are simply unmatchable, not a bug. */
  images: string[];
}

export type FedMediaMatchTier =
  'exact' | 'normalized' | 'fuzzy' | 'metadata' | 'equipment-superset' | 'alias' | 'explicit';

export interface FedMediaMatch {
  freeExerciseDbId: string;
  atlasExerciseId: string;
  tier: FedMediaMatchTier;
}

export interface FedMediaMappingReport {
  sourceExerciseCount: number;
  matched: FedMediaMatch[];
  ambiguous: { freeExerciseDbId: string; name: string; atlasExerciseIds: string[] }[];
  unresolved: { freeExerciseDbId: string; name: string }[];
  atlasWithoutMediaCount: number;
}

// Free Exercise DB's own equipment vocabulary (schema.json) mapped to the
// closest ATLAS equipment term, for disambiguation only -- an imperfect or
// missing mapping just means that signal can't narrow a tie, never a wrong
// match (see disambiguateByPredicates).
const FED_EQUIPMENT_ALIASES: Record<string, string> = {
  'body only': 'body weight',
  bands: 'band',
  kettlebells: 'kettlebell',
  'e-z curl bar': 'ez barbell',
  'exercise ball': 'stability ball',
  'foam roll': 'roller',
};

function equipmentToken(value: string): string {
  const v = value.toLowerCase().trim();
  return FED_EQUIPMENT_ALIASES[v] ?? v;
}

// ATLAS's own equipment vocabulary (the Library equipment filter), tokenized.
// Free Exercise DB cleanly separates equipment into its own field, so its
// exercise *names* are frequently a strict subset of ATLAS's -- ATLAS just
// prepends the equipment word ("Good Morning" -> "barbell good morning").
// Recognizing that pattern is safe specifically because the equipment is
// independently confirmed against the entry's own `equipment` field, never
// guessed: the extra token(s) must be equipment words AND must include the
// entry's own (normalized) equipment, so a plain "barbell" entry can't
// silently absorb a more specific/different implement's exercise (e.g. an
// EZ-curl-bar variant) just because "ez" happens to be in this set too.
const EQUIPMENT_TOKEN_SET = new Set([
  'assisted',
  'band',
  'barbell',
  'body',
  'weight',
  'bosu',
  'ball',
  'cable',
  'dumbbell',
  'elliptical',
  'machine',
  'hammer',
  'kettlebell',
  'leverage',
  'medicine',
  'olympic',
  'resistance',
  'roller',
  'rope',
  'skierg',
  'sled',
  'smith',
  'stability',
  'stationary',
  'bike',
  'stepmill',
  'tire',
  'trap',
  'upper',
  'ergometer',
  'weighted',
  'wheel',
]);

/** "Good Morning" (Barbell) -> ATLAS's "barbell good morning": every token
 * of the Free Exercise DB name appears in the ATLAS candidate's name, and
 * the *only* extra token(s) are equipment words that include the entry's
 * own confirmed equipment -- never a position/movement word, which is
 * exactly the distinction that keeps this safe (see the tier's own doc
 * comment above). Unlike `disambiguateByMetadata`, this can also produce
 * the initial unique candidate, not just break a tie -- the equipment
 * check here is load-bearing precision, not just a tiebreaker, precisely
 * because it must independently confirm the match before accepting it. */
function equipmentSupersetMatch(
  entry: FreeExerciseDbEntry,
  fedTokens: string[],
  atlasFuzzyTokens: { e: Exercise; tokens: string[] }[],
): Exercise[] {
  if (!entry.equipment) return [];
  const fedEquipToken = equipmentToken(entry.equipment).split(' ').pop();
  const fedTokenSet = new Set(fedTokens);
  const matches: Exercise[] = [];
  for (const { e, tokens: atlasTokens } of atlasFuzzyTokens) {
    if (!fedTokens.every((t) => atlasTokens.includes(t))) continue;
    const extra = atlasTokens.filter((t) => !fedTokenSet.has(t));
    if (extra.length === 0) continue; // identical token sets would already match at the fuzzy tier
    if (!extra.every((t) => EQUIPMENT_TOKEN_SET.has(t))) continue;
    // "ez" is deliberately excluded from EQUIPMENT_TOKEN_SET: an EZ-curl-bar
    // variant is a real mechanical difference (angled vs. straight grip)
    // from Free Exercise DB's generic "barbell" -- found during manual
    // review (Anti-Gravity Press), not theorized. Since "ez" can never
    // appear in `extra` now, an ATLAS "ez barbell X" candidate simply won't
    // pass the `extra.every(...)` check above for a bare-"barbell" entry,
    // correctly leaving it unresolved instead of guessed.
    if (fedEquipToken !== undefined && extra.includes(fedEquipToken)) matches.push(e);
  }
  return matches;
}

function disambiguateByMetadata(
  entry: FreeExerciseDbEntry,
  candidates: Exercise[],
): Exercise | null {
  const entryEquipment = entry.equipment ? equipmentToken(entry.equipment) : null;
  const entryMuscle = entry.primaryMuscles[0]?.toLowerCase().trim() ?? null;
  return disambiguateByPredicates(
    candidates,
    (e) =>
      entryEquipment !== null && e.equipment.some((eq) => equipmentToken(eq) === entryEquipment),
    (e) => entryMuscle !== null && (e.target_muscle ?? '').toLowerCase().trim() === entryMuscle,
  );
}

/**
 * Hand-resolved pairs for Free Exercise DB ids that don't auto-resolve
 * against ATLAS's naming, reviewed individually against the real
 * unresolved list this matcher produces -- never guessed ahead of seeing
 * it, and rejecting far more candidates than it accepted (of ~50
 * high-token-overlap candidates individually reviewed this pass, most
 * were excluded for a real equipment mismatch, an added/changed
 * position or grip qualifier, or a named technique variant -- e.g.
 * "Kettlebell Turkish Get-Up (Lunge style)" was NOT mapped to ATLAS's
 * "(squat style)" entry, and "One-Arm Dumbbell Row" was NOT mapped to
 * "dumbbell one arm upright row" -- a different movement despite the
 * name overlap, the same false-match risk already documented in
 * `matchWorkoutGuideMedia.ts`). Two groups, same convention as that
 * file's `EXPLICIT_MEDIA_MAPPING`:
 * 1. Pure rewording/reordering with zero content change (e.g. "Bench
 *    Press with Neutral Grip" -> "neutral grip bench press") or a name
 *    that itself names a more specific implement than the entry's own
 *    generic `equipment` field does (Free Exercise DB's schema has no
 *    "smith machine" enum value, only generic "machine" -- entries named
 *    "Smith Machine X" are trusted on their own name, same reasoning
 *    `matchWorkoutGuideMedia.ts` already applies).
 * 2. None yet -- no unqualified-name canonical-default picks were needed
 *    for this provider (Free Exercise DB's names are already fairly
 *    specific; that group exists for symmetry with the Workout Guide
 *    table, not because this one is missing something).
 * See docs/EXERCISE_MEDIA.md for the full mapping report.
 */
export const FED_EXPLICIT_MEDIA_MAPPING: Record<string, string> = {
  'Extended_Range_One-Arm_Kettlebell_Floor_Press':
    'kettlebell extended range one arm press on floor',
  Calf_Stretch_Hands_Against_Wall: 'calf stretch with hands against wall',
  'Close-Grip_EZ-Bar_Press': 'ez-bar close-grip bench press',
  Dumbbell_Bench_Press_with_Neutral_Grip: 'dumbbell neutral grip bench press',
  // Note: 'Seated_Flat_Bench_Leg_Pull-In' was deliberately NOT also mapped
  // here -- Free Exercise DB's own plain 'Flat_Bench_Leg_Pull-In' entry
  // already fuzzy-matches this same ATLAS exercise, and ATLAS has no
  // separate seated-specific entry to give the "Seated" variant instead;
  // mapping both would be exactly the duplicate-mapping conflict the
  // integrity test rejects (found by that test, not guessed).
  'Wide-Grip_Decline_Barbell_Bench_Press': 'barbell decline wide-grip press',
  'Bent_Over_Two-Dumbbell_Row': 'dumbbell bent over row',
  'Close-Grip_EZ_Bar_Curl': 'ez barbell close-grip curl',
  Decline_EZ_Bar_Triceps_Extension: 'ez barbell decline triceps extension',
  'Dumbbell_Tricep_Extension_-Pronated_Grip': 'dumbbell pronate-grip triceps extension',
  Side_Laterals_to_Front_Raise: 'dumbbell lateral to front raise',
  Smith_Machine_Bent_Over_Row: 'smith bent over row',
  Smith_Machine_Incline_Bench_Press: 'smith incline bench press',
  Smith_Machine_Reverse_Calf_Raises: 'smith reverse calf raises',
  Standing_Barbell_Press_Behind_Neck: 'standing behind neck press',
};

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/**
 * Matches Free Exercise DB's 876 entries against the ATLAS library. Same
 * shared primitives as `matchWorkoutGuideMedia`, plus one tier that
 * dataset needed and this one doesn't yet: exact -> normalized -> fuzzy
 * (metadata-disambiguated) -> equipment-superset (Free-Exercise-DB-specific:
 * safe because this provider always carries a clean, independent
 * `equipment` field to confirm against, which Workout Guide's matcher
 * doesn't have in the same structured way) -> ATLAS alias -> explicit
 * table -> unresolved. Independent of Workout Guide's own mapping --
 * which provider wins when both match the same ATLAS exercise is a
 * seed-time priority decision made in `ensureExercisesSeeded.ts`, not
 * something either matcher needs to know about the other for.
 *
 * All four name-keyed tiers look candidates up in a `Map` built once
 * up front, rather than re-scanning all 1,324 ATLAS exercises per entry
 * (`Array.filter` in a loop over 876 entries) -- 876 was enough for that
 * naive O(entries x atlasExercises) approach to blow past this suite's
 * default per-test timeout in real measurement, not just in theory
 * (Workout Guide's 302 entries never showed the same problem, which is
 * exactly why this wasn't caught until a second, bigger provider arrived).
 */
export function matchFreeExerciseDbMedia(
  atlasExercises: Exercise[],
  entries: FreeExerciseDbEntry[],
): FedMediaMappingReport {
  const matched: FedMediaMatch[] = [];
  const ambiguous: FedMediaMappingReport['ambiguous'] = [];
  const unresolved: FedMediaMappingReport['unresolved'] = [];

  const byExactName = groupBy(atlasExercises, (e) => e.name);
  const byNormalizedName = groupBy(atlasExercises, (e) => normalize(e.name));
  const byFuzzyName = groupBy(atlasExercises, (e) => fuzzyKey(e.name));
  const byAliasFuzzyKey = new Map<string, Exercise[]>();
  for (const e of atlasExercises) {
    for (const alias of e.aliases) {
      const k = fuzzyKey(alias);
      const bucket = byAliasFuzzyKey.get(k);
      if (bucket) bucket.push(e);
      else byAliasFuzzyKey.set(k, [e]);
    }
  }
  // Precomputed once, reused for every entry that reaches the
  // equipment-superset tier, instead of recomputing fuzzyKey(ex.name) for
  // all 1,324 exercises on every one of those entries.
  const atlasFuzzyTokens = atlasExercises.map((e) => ({ e, tokens: fuzzyKey(e.name).split(' ') }));

  for (const entry of entries) {
    if (entry.images.length === 0) {
      unresolved.push({ freeExerciseDbId: entry.id, name: entry.name });
      continue;
    }

    const normalizedName = normalize(entry.name);
    const fuzzyName = fuzzyKey(entry.name);

    const exact = byExactName.get(entry.name) ?? [];
    if (exact.length === 1 && exact[0]) {
      matched.push({ freeExerciseDbId: entry.id, atlasExerciseId: exact[0].id, tier: 'exact' });
      continue;
    }
    if (exact.length > 1) {
      ambiguous.push({
        freeExerciseDbId: entry.id,
        name: entry.name,
        atlasExerciseIds: exact.map((e) => e.id),
      });
      continue;
    }

    const normalized = byNormalizedName.get(normalizedName) ?? [];
    if (normalized.length === 1 && normalized[0]) {
      matched.push({
        freeExerciseDbId: entry.id,
        atlasExerciseId: normalized[0].id,
        tier: 'normalized',
      });
      continue;
    }
    if (normalized.length > 1) {
      ambiguous.push({
        freeExerciseDbId: entry.id,
        name: entry.name,
        atlasExerciseIds: normalized.map((e) => e.id),
      });
      continue;
    }

    const fuzzy = byFuzzyName.get(fuzzyName) ?? [];
    if (fuzzy.length === 1 && fuzzy[0]) {
      matched.push({ freeExerciseDbId: entry.id, atlasExerciseId: fuzzy[0].id, tier: 'fuzzy' });
      continue;
    }
    if (fuzzy.length > 1) {
      const resolved = disambiguateByMetadata(entry, fuzzy);
      if (resolved) {
        matched.push({
          freeExerciseDbId: entry.id,
          atlasExerciseId: resolved.id,
          tier: 'metadata',
        });
        continue;
      }
      ambiguous.push({
        freeExerciseDbId: entry.id,
        name: entry.name,
        atlasExerciseIds: fuzzy.map((e) => e.id),
      });
      continue;
    }

    const equipSuperset = equipmentSupersetMatch(entry, fuzzyName.split(' '), atlasFuzzyTokens);
    if (equipSuperset.length === 1 && equipSuperset[0]) {
      matched.push({
        freeExerciseDbId: entry.id,
        atlasExerciseId: equipSuperset[0].id,
        tier: 'equipment-superset',
      });
      continue;
    }
    if (equipSuperset.length > 1) {
      ambiguous.push({
        freeExerciseDbId: entry.id,
        name: entry.name,
        atlasExerciseIds: equipSuperset.map((e) => e.id),
      });
      continue;
    }

    const alias = byAliasFuzzyKey.get(fuzzyName) ?? [];
    if (alias.length === 1 && alias[0]) {
      matched.push({ freeExerciseDbId: entry.id, atlasExerciseId: alias[0].id, tier: 'alias' });
      continue;
    }
    if (alias.length > 1) {
      ambiguous.push({
        freeExerciseDbId: entry.id,
        name: entry.name,
        atlasExerciseIds: alias.map((e) => e.id),
      });
      continue;
    }

    const explicitName = FED_EXPLICIT_MEDIA_MAPPING[entry.id];
    const explicitMatch = explicitName ? (byExactName.get(explicitName)?.[0] ?? null) : null;
    if (explicitMatch) {
      matched.push({
        freeExerciseDbId: entry.id,
        atlasExerciseId: explicitMatch.id,
        tier: 'explicit',
      });
      continue;
    }

    unresolved.push({ freeExerciseDbId: entry.id, name: entry.name });
  }

  const matchedAtlasIds = new Set(matched.map((m) => m.atlasExerciseId));
  return {
    sourceExerciseCount: entries.length,
    matched,
    ambiguous,
    unresolved,
    atlasWithoutMediaCount: atlasExercises.length - matchedAtlasIds.size,
  };
}
