import { availableLoads, hasEquipmentData, nextAvailableLoad } from '@atlas/equipment-engine';
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
import { computeProgressionDecision, loadValue, progressableLoadField } from './progressionDecision';

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
    const loads = availableLoads(equipment);
    const real = loads.includes(desired) ? desired : nextAvailableLoad(equipment, currentLoad);

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
