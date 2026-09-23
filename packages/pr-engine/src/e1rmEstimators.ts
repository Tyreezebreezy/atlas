import { estimated1RM as epleyFormula, E1RM_REP_CUTOFF } from './estimate1RM';

/**
 * vNext Handoff 02 (research pack v2 §9). Versioned so a future formula
 * change is a recorded fact (`PersonalRecord.estimator_id`/`estimator_version`)
 * rather than a silent rewrite -- see docs/PRS.md "Estimated 1RM."
 */
export interface E1RMEstimator {
  id: string;
  version: string;
  supported_rep_min: number;
  supported_rep_max: number;
  supports(weight: number, reps: number): boolean;
  /** Null when out of the supported range or the inputs aren't a valid working set -- never a wrong-looking number. */
  estimate(weight: number, reps: number): number | null;
}

/**
 * Brzycki: `weight * 36 / (37 - reps)`. Unlike Epley, this already resolves
 * to exactly `weight * 1.0` at reps=1 -- no special case needed. The new
 * default per the research pack (2-10 rep support; cited as more accurate
 * than Epley in that region for compatible lifts).
 */
export const brzyckiEstimator: E1RMEstimator = {
  id: 'brzycki',
  version: 'v1',
  supported_rep_min: 1,
  supported_rep_max: 10,
  supports: (weight, reps) => weight > 0 && Number.isInteger(reps) && reps >= 1 && reps <= 10,
  estimate: (weight, reps) => {
    if (weight <= 0 || !Number.isInteger(reps) || reps < 1 || reps > 10) return null;
    return (weight * 36) / (37 - reps);
  },
};

/**
 * The pre-existing v0.0.6 formula, wrapped as a registered estimator so
 * already-stored `estimated_1rm` PersonalRecord rows (computed before this
 * file existed, or before an exercise's history is next touched) remain
 * attributable, and so a caller can still ask for it explicitly. No longer
 * the default -- see `DEFAULT_E1RM_ESTIMATOR`.
 */
export const epleyEstimator: E1RMEstimator = {
  id: 'epley',
  version: 'v1',
  supported_rep_min: 1,
  supported_rep_max: E1RM_REP_CUTOFF,
  supports: (weight, reps) =>
    weight > 0 && Number.isInteger(reps) && reps >= 1 && reps <= E1RM_REP_CUTOFF,
  estimate: (weight, reps) => (weight > 0 ? epleyFormula(weight, reps) : null),
};

export const E1RM_ESTIMATORS: readonly E1RMEstimator[] = [brzyckiEstimator, epleyEstimator];

/**
 * vNext Handoff 02: switched from Epley to Brzycki per explicit owner
 * decision (research pack recommendation). This is the ONE place a future
 * default change happens. `calculatePRs` recomputes `estimated_1rm` from
 * full history every time it runs (no incremental state -- see
 * docs/PRS.md "Historical recalculation"), so an already-stored row is not
 * proactively rewritten by this change; it recomputes under the new
 * default, with provenance attached, the next time that exercise's history
 * is touched (a session finishes, a backfill runs). This is the
 * "intentional, provenance-tracked recalculation" the research pack asks
 * for (§7.4), not a silent mutation.
 */
export const DEFAULT_E1RM_ESTIMATOR = brzyckiEstimator;
