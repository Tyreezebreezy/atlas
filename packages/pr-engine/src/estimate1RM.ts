/** Epley is unreliable at high reps -- not computed past this cutoff. Documented in docs/PRS.md. */
export const E1RM_REP_CUTOFF = 12;

/**
 * Epley: weight * (1 + reps / 30). A true 1-rep set is a special case --
 * the raw lift already IS a 1RM, so it returns the load unchanged rather
 * than the formula's ~3.3% inflation (weight * 1.0333) at reps=1.
 * Returns null for reps <= 0 or reps > E1RM_REP_CUTOFF (formula not
 * meaningful there, not computed rather than shown as a wrong number).
 */
export function estimated1RM(weight: number, reps: number): number | null {
  if (reps <= 0 || reps > E1RM_REP_CUTOFF) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}
