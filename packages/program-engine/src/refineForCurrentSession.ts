import type { PerformedSet, ProgressionPolicy, ProgressionRecommendation } from '@atlas/data-model';

/** Restrained default -- ordinary set-to-set variance of a rep or two should never trigger a mid-session adjustment. */
const DEFAULT_SHORTFALL_REPS = 3;

/**
 * vNext Handoff 02 (research pack v2 §9/§11). Extends the EXISTING
 * `recommendProgression()` path -- this is not a new progression call path,
 * it post-processes a recommendation that already went through the full
 * equipment-aware decision (see `recommendProgression.ts`) using sets
 * completed so far in the CURRENT, still-in-progress session. Equipment
 * constraints already baked into `recommendation.target_load` are never
 * touched here (only `target_reps` can change), so a refined target can
 * never exceed available load, and no set is ever added -- `target_reps` is
 * the only field this function is allowed to change.
 *
 * Deliberately one-directional (only reduces a target that's now
 * unrealistic): the research pack notes strong first-set performance "may
 * permit" a conservative upward adjustment, but gives no concrete
 * threshold for it, unlike the clear downward-adjustment example -- adding
 * an unfounded upward-nudge heuristic here would be guessing at a rule the
 * research pack doesn't actually specify.
 */
export function refineForCurrentSession(
  recommendation: ProgressionRecommendation,
  completedSetsThisSession: PerformedSet[],
  policy: ProgressionPolicy,
): ProgressionRecommendation {
  if (completedSetsThisSession.length === 0) return recommendation;
  if (recommendation.target_reps == null) return recommendation;

  const lastSet = completedSetsThisSession[completedSetsThisSession.length - 1];
  if (!lastSet || lastSet.reps == null) return recommendation;

  const shortfallThreshold = policy.current_session_shortfall_reps ?? DEFAULT_SHORTFALL_REPS;
  const shortfall = recommendation.target_reps - lastSet.reps;
  if (shortfall < shortfallThreshold) return recommendation;

  const revisedReps = Math.max(1, lastSet.reps);
  return {
    ...recommendation,
    action: 'hold',
    reason_code: 'CURRENT_SESSION_BELOW_TARGET',
    target_reps: revisedReps,
    constraint_applied: `Reduced from this session's own performance (${lastSet.reps} reps last set, ${shortfall} short of plan).`,
  };
}
