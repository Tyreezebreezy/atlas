import type { Exercise } from '@atlas/data-model';

export interface SubstitutionCandidate {
  exercise: Exercise;
  score: number;
  reasons: string[];
}

export interface SubstitutionOptions {
  /** When provided, candidates requiring equipment outside this list are excluded. Omit to skip equipment filtering entirely. */
  availableEquipment?: string[];
  /** Exercise ids to never suggest, e.g. others already planned in the same workout. */
  excludeExerciseIds?: string[];
  /** How many ranked candidates to return. */
  limit?: number;
}

/**
 * Deterministic, offline, point-based scoring -- no LLM, no randomness.
 * Each signal fires independently and adds a fixed weight; ties break on
 * name so results are stable across runs. Tuned by feel, not measured
 * against real usage yet -- revisit the weights once real substitution
 * choices give something to compare against.
 */
const WEIGHTS = {
  KNOWN_SUBSTITUTE: 50,
  SAME_MOVEMENT_PATTERN: 40,
  SAME_TARGET_MUSCLE: 30,
  SAME_MOVEMENT_FAMILY: 15,
  SHARED_SECONDARY_MUSCLE: 5,
  SHARED_SECONDARY_MUSCLE_CAP: 15,
  SAME_MEASUREMENT_TYPE: 10,
  SAME_UNILATERAL: 5,
} as const;

function scoreCandidate(
  target: Exercise,
  candidate: Exercise,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (target.enrichment?.known_substitute_ids.includes(candidate.id)) {
    score += WEIGHTS.KNOWN_SUBSTITUTE;
    reasons.push('Known substitute');
  }
  if (target.movement_pattern && target.movement_pattern === candidate.movement_pattern) {
    score += WEIGHTS.SAME_MOVEMENT_PATTERN;
    reasons.push('Same movement pattern');
  }
  if (target.target_muscle && target.target_muscle === candidate.target_muscle) {
    score += WEIGHTS.SAME_TARGET_MUSCLE;
    reasons.push('Same target muscle');
  }
  if (
    target.enrichment?.movement_family &&
    target.enrichment.movement_family === candidate.enrichment?.movement_family
  ) {
    score += WEIGHTS.SAME_MOVEMENT_FAMILY;
    reasons.push('Same movement family');
  }
  const sharedSecondary = target.secondary_muscles.filter((m) =>
    candidate.secondary_muscles.includes(m),
  ).length;
  if (sharedSecondary > 0) {
    score += Math.min(
      sharedSecondary * WEIGHTS.SHARED_SECONDARY_MUSCLE,
      WEIGHTS.SHARED_SECONDARY_MUSCLE_CAP,
    );
    reasons.push('Overlapping secondary muscles');
  }
  // Deliberately reason-less: these two are tie-breaker weight only. Most of
  // the library shares 'reps_weight', so if this alone could qualify a
  // candidate, two anatomically unrelated exercises (e.g. chest fly vs. calf
  // raise) would "match" on nothing but that. Qualification is gated on
  // reasons.length below, so these can only ever pad the score of a
  // candidate that already matched on something real.
  if (target.measurement_type === candidate.measurement_type) {
    score += WEIGHTS.SAME_MEASUREMENT_TYPE;
  }
  if (target.is_unilateral != null && target.is_unilateral === candidate.is_unilateral) {
    score += WEIGHTS.SAME_UNILATERAL;
  }

  return { score, reasons };
}

function hasAvailableEquipment(exercise: Exercise, available: string[]): boolean {
  if (exercise.equipment.length === 0) return true;
  return exercise.equipment.every((eq) => available.includes(eq));
}

export function suggestSubstitutes(
  target: Exercise,
  pool: Exercise[],
  options: SubstitutionOptions = {},
): SubstitutionCandidate[] {
  const excluded = new Set([target.id, ...(options.excludeExerciseIds ?? [])]);
  let candidates = pool.filter((e) => !excluded.has(e.id) && e.deleted_at === null);
  if (options.availableEquipment) {
    const available = options.availableEquipment;
    candidates = candidates.filter((e) => hasAvailableEquipment(e, available));
  }

  const scored = candidates
    .map((exercise) => ({ exercise, ...scoreCandidate(target, exercise) }))
    // A candidate must have at least one real, explainable reason -- not just
    // the reason-less tie-breaker bonuses above -- to qualify as a suggestion.
    .filter((c) => c.reasons.length > 0)
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));

  return options.limit != null ? scored.slice(0, options.limit) : scored;
}
