import { availableLoads, hasEquipmentData, hasLoadList, maximumLoad, nextAvailableLoad } from '@atlas/equipment-engine';
import type {
  Exercise,
  GymEquipmentInstance,
  ProgressionAction,
  ProgressionDecision,
  ProgressionPolicy,
  ProgressionReasonCode,
  ProgressionRecommendation,
  ProgressionTargetSnapshot,
  WorkoutSession,
} from '@atlas/data-model';
import { computeProgressionDecision, loadValue, progressableLoadField, withLoad } from './progressionDecision';

export interface ProgressionContext {
  exercise: Exercise;
  policy: ProgressionPolicy;
  currentTarget: ProgressionTargetSnapshot;
  previousSession: WorkoutSession | null;
  /** The equipment instance backing this exercise right now, or null when
   * none is configured. Null must fall back to the unconstrained decision
   * -- never treated as "at max" (research pack §3.3: the owner isn't
   * forced to configure a gym before training). */
  equipment: GymEquipmentInstance | null;
}

function baseTranslation(decision: ProgressionDecision): {
  action: ProgressionAction;
  reason_code: ProgressionReasonCode;
} {
  switch (decision.previous_result) {
    case 'first_time':
      return { action: 'establish_baseline', reason_code: 'FIRST_EXPOSURE' };
    case 'held':
      return { action: 'hold', reason_code: 'WITHIN_REP_RANGE' };
    case 'failed_held':
      return { action: 'hold', reason_code: 'BELOW_TARGET_RANGE' };
    case 'deload_excluded':
      return { action: 'hold', reason_code: 'CURRENT_SESSION_FATIGUE' };
    case 'advanced':
      return { action: 'increase_load', reason_code: 'NEXT_LOAD_AVAILABLE' };
    case 'suggest_advance':
      return { action: 'increase_reps', reason_code: 'TOP_OF_RANGE' };
  }
}

function recommendationFrom(
  decision: ProgressionDecision,
  base: { action: ProgressionAction; reason_code: ProgressionReasonCode },
  overrides: Partial<ProgressionRecommendation> = {},
): ProgressionRecommendation {
  return {
    strategy_id: decision.policy,
    target_load: decision.resulting_target.target_weight ?? decision.resulting_target.target_external_load,
    target_reps: decision.resulting_target.target_reps_max ?? decision.resulting_target.target_reps_min,
    target_duration: decision.resulting_target.target_duration_seconds,
    target_distance: null,
    action: base.action,
    reason_code: base.reason_code,
    data_state: decision.previous_result === 'first_time' ? 'first_exposure' : 'normal',
    constraint_applied: null,
    ...overrides,
  };
}

/**
 * Falls back to rep progression at the current load once no further load
 * increase is available -- research pack §4.2 "equipment ceiling
 * progression." Extends toward `policy.ceiling_reps_max` one rep at a
 * time when configured and not yet reached; otherwise there is nothing
 * left to try, so this returns `review` rather than silently holding or
 * (worse) inventing a set addition (§8 rule 9-10).
 */
function ceilingRepFallback(
  decision: ProgressionDecision,
  policy: ProgressionPolicy,
  currentLoad: number | null,
  reasonCode: ProgressionReasonCode,
): ProgressionRecommendation {
  const currentRepsMax = decision.previous_target?.target_reps_max ?? null;
  const ceilingCap = policy.ceiling_reps_max ?? null;
  const canExtendReps = ceilingCap != null && (currentRepsMax == null || currentRepsMax < ceilingCap);

  if (canExtendReps) {
    const nextReps = Math.min((currentRepsMax ?? 0) + 1, ceilingCap!);
    return recommendationFrom(decision, { action: 'increase_reps', reason_code: reasonCode }, {
      target_load: currentLoad,
      target_reps: nextReps,
      constraint_applied: `Equipment ceiling reached -- extending reps toward ${ceilingCap}.`,
    });
  }

  // Load exhausted AND no further rep room (no ceiling configured, or
  // already at it) -- both progression mechanisms are exhausted.
  return recommendationFrom(decision, { action: 'review', reason_code: 'PROGRAM_REVIEW_REQUIRED' }, {
    target_load: currentLoad,
    target_reps: currentRepsMax,
    constraint_applied: 'Load and rep ceiling both exhausted -- review needed (never adding sets automatically).',
  });
}

/**
 * The load an "increase" should actually land on, or null when this equipment
 * has no heavier load to give.
 *
 * - With a load list (exact, or a full range): the desired load if the machine
 *   has it, else the next real one up -- never an arithmetic value it can't
 *   produce.
 * - With only a maximum (vNext Handoff 04B): nothing below the maximum is
 *   known, so none is invented. The desired load stands if it fits under the
 *   maximum; if it would overshoot, the maximum itself is the next real load;
 *   and at the maximum there is nothing further. A recommendation never
 *   exceeds a maximum the owner has confirmed, whether or not ATLAS knows the
 *   steps beneath it.
 */
function nextRealLoad(equipment: GymEquipmentInstance, currentLoad: number, desired: number | null): number | null {
  const loads = availableLoads(equipment);
  if (loads.length > 0) {
    return desired != null && loads.includes(desired) ? desired : nextAvailableLoad(equipment, currentLoad);
  }
  const max = equipment.max_load;
  if (max == null || currentLoad >= max) return null;
  return desired != null && desired <= max ? desired : max;
}

/**
 * The equipment-aware wrapper around `computeProgressionDecision` (vNext
 * Handoff 01 §7-8). Reuses that engine's proven, deterministic decision
 * entirely -- this only ever narrows or redirects an "increase load"
 * outcome to what's actually available, and translates every outcome into
 * the richer `ProgressionRecommendation` action/reason-code vocabulary.
 * Never adds sets; only ever reads the exercise's own `measurement_type`
 * to know whether it has a loadable field at all (§9: exercises the
 * strategy layer doesn't understand a load for get `data_state:
 * 'not_yet_supported'` rather than a faked recommendation).
 */
export function recommendProgression(context: ProgressionContext): ProgressionRecommendation {
  const decision = computeProgressionDecision(
    context.policy,
    context.exercise,
    context.currentTarget,
    context.previousSession,
  );
  return recommendFromDecision(decision, context);
}

function recommendFromDecision(decision: ProgressionDecision, context: ProgressionContext): ProgressionRecommendation {
  return cappedAtMaximum(recommendFromLoads(decision, context), context.equipment);
}

/**
 * The one rule no path may break (vNext Handoff 04B): a recommendation never
 * exceeds the heaviest load the equipment has, wherever the number came from.
 * The next-load logic below already keeps to it when it raises a load; this
 * catches a load carried over unchanged from heavier equipment elsewhere -- 170
 * on the Main Gym's machine, a 120 lb machine today -- which a hold would
 * otherwise hand straight on. Equipment with no known maximum caps nothing.
 */
function cappedAtMaximum(
  recommendation: ProgressionRecommendation,
  equipment: GymEquipmentInstance | null,
): ProgressionRecommendation {
  const max = equipment && hasEquipmentData(equipment) ? maximumLoad(equipment) : null;
  if (max == null || recommendation.target_load == null || recommendation.target_load <= max) return recommendation;
  const note = `Capped at this equipment's maximum (${max}).`;
  return {
    ...recommendation,
    target_load: max,
    constraint_applied: recommendation.constraint_applied ? `${recommendation.constraint_applied} ${note}` : note,
  };
}

function recommendFromLoads(decision: ProgressionDecision, context: ProgressionContext): ProgressionRecommendation {
  const base = baseTranslation(decision);

  const loadField = progressableLoadField(context.exercise);
  if (!loadField) {
    // No loadable dimension for this exercise's measurement type (pure
    // bodyweight/duration/etc.) -- equipment has nothing to say here;
    // return the base translation unchanged rather than fabricating a load.
    return recommendationFrom(decision, base);
  }

  const equipment = context.equipment;
  if (!equipment || !hasEquipmentData(equipment)) {
    // No equipment configured/confirmed yet -- fall back to the
    // unconstrained decision exactly as before (§6: never forced to
    // configure a gym before training).
    return recommendationFrom(decision, base);
  }

  const currentLoad = decision.previous_target ? loadValue(decision.previous_target, loadField) : null;

  // The base decision already wants to increase load -- verify that exact
  // load actually exists on this equipment; if not, use the nearest real
  // one instead of an arithmetic value the machine can't produce.
  if (base.action === 'increase_load' && currentLoad != null) {
    const desired = loadValue(decision.resulting_target, loadField);
    const real = nextRealLoad(equipment, currentLoad, desired);

    if (real == null) return ceilingRepFallback(decision, context.policy, currentLoad, 'EQUIPMENT_MAX_REACHED');

    const jump = real - currentLoad;
    if (context.policy.max_acceptable_load_jump != null && jump > context.policy.max_acceptable_load_jump) {
      return ceilingRepFallback(decision, context.policy, currentLoad, 'NEXT_LOAD_TOO_LARGE');
    }
    return recommendationFrom(decision, base, {
      target_load: real,
      constraint_applied: real !== desired ? `Adjusted to nearest available load (${real}).` : null,
    });
  }

  // The base engine hit the rep ceiling but had no configured increment to
  // advance with (`suggest_advance`) -- equipment can supply one instead.
  if (decision.previous_result === 'suggest_advance' && currentLoad != null) {
    // With only a maximum there is no known next step to offer, so ATLAS
    // keeps its own rep suggestion until the maximum is reached.
    if (!hasLoadList(equipment) && equipment.max_load != null && currentLoad < equipment.max_load) {
      return recommendationFrom(decision, base);
    }
    const real = nextAvailableLoad(equipment, currentLoad);
    if (real == null) return ceilingRepFallback(decision, context.policy, currentLoad, 'EQUIPMENT_MAX_REACHED');

    const jump = real - currentLoad;
    if (context.policy.max_acceptable_load_jump != null && jump > context.policy.max_acceptable_load_jump) {
      return ceilingRepFallback(decision, context.policy, currentLoad, 'NEXT_LOAD_TOO_LARGE');
    }
    return recommendationFrom(decision, { action: 'increase_load', reason_code: 'NEXT_LOAD_AVAILABLE' }, {
      target_load: real,
    });
  }

  return recommendationFrom(decision, base);
}

/**
 * The decision a session is stamped with when it starts, held to what the
 * equipment can really load (vNext Handoff 04B).
 *
 * `recommendProgression` already narrows the live "Today" line to the machine in
 * front of the owner. This applies that same narrowing -- through the same code,
 * not a second copy of its rules -- to the target written into the session
 * snapshot, so the TARGET on the card never asks for 85 lb on an 80 lb rack or
 * 180 lb on a 170 lb stack.
 *
 * Two things change the stamped target, and nothing else does: an advance is
 * landed on a load the equipment really has (or held where it has none higher),
 * and any target above the equipment's maximum is brought down to it. A hold, a
 * first exposure and a "consider adding load" suggestion otherwise come back as
 * computed -- the equipment does not get to start raising loads the policy never
 * asked to raise. With no equipment, or none with data, the result is exactly
 * `computeProgressionDecision`'s. When the equipment does change the outcome the
 * decision says so -- `previous_result` becomes `held` if an advance did not
 * happen, and the explanation gains the constraint -- so "Why this target?" stays true.
 */
export function decideWithinEquipment(context: ProgressionContext): ProgressionDecision {
  const decision = computeProgressionDecision(
    context.policy,
    context.exercise,
    context.currentTarget,
    context.previousSession,
  );
  const loadField = progressableLoadField(context.exercise);
  if (!loadField || !context.equipment) return decision;

  const recommendation = recommendFromDecision(decision, context);
  if (recommendation.constraint_applied == null || recommendation.target_load == null) return decision;
  const lowered = recommendation.target_load < loadValue(decision.resulting_target, loadField);
  if (decision.previous_result !== 'advanced' && !lowered) return decision;

  const withRealLoad = withLoad(decision.resulting_target, loadField, recommendation.target_load);
  return {
    ...decision,
    previous_result:
      decision.previous_result === 'advanced' && recommendation.action !== 'increase_load'
        ? 'held'
        : decision.previous_result,
    decision_summary: `${decision.decision_summary} ${recommendation.constraint_applied}`,
    resulting_target:
      recommendation.action === 'increase_reps' && recommendation.target_reps != null
        ? { ...withRealLoad, target_reps_max: recommendation.target_reps }
        : withRealLoad,
  };
}
