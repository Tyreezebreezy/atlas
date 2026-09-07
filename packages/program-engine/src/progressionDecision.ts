import type {
  Exercise,
  PerformedSet,
  PlannedExercise,
  ProgressionDecision,
  ProgressionPolicy,
  ProgressionResult,
  ProgressionTargetSnapshot,
  WorkoutSession,
} from '@atlas/data-model';
import { setPhaseOf } from '@atlas/workout-engine';

/** Which planned/performed field this exercise's "load" progresses on.
 * Null for a pure calisthenic movement with no configured external load
 * (nothing to auto-increment -- see the ceiling-hit branches below) and
 * for duration/distance exercises, which progress on duration instead via
 * the 'timed' policy. */
function progressableLoadField(exercise: Exercise): 'weight' | 'external_load' | null {
  if (exercise.measurement_type === 'reps_weight') return 'weight';
  if (exercise.measurement_type === 'reps_bodyweight') return 'external_load';
  return null;
}

function loadValue(target: ProgressionTargetSnapshot, field: 'weight' | 'external_load'): number {
  return (field === 'weight' ? target.target_weight : target.target_external_load) ?? 0;
}

function withLoad(
  target: ProgressionTargetSnapshot,
  field: 'weight' | 'external_load',
  value: number,
): ProgressionTargetSnapshot {
  return field === 'weight'
    ? { ...target, target_weight: value }
    : { ...target, target_external_load: value };
}

export function targetSnapshotOf(
  planned: Pick<
    PlannedExercise,
    'target_weight' | 'target_reps_min' | 'target_reps_max' | 'target_duration_seconds'
  > &
    Partial<Pick<PlannedExercise, 'target_external_load'>>,
): ProgressionTargetSnapshot {
  return {
    target_weight: planned.target_weight,
    target_external_load: planned.target_external_load ?? null,
    target_reps_min: planned.target_reps_min,
    target_reps_max: planned.target_reps_max,
    target_duration_seconds: planned.target_duration_seconds,
  };
}

/**
 * Chronology-safe by construction: the most recent COMPLETED, non-deload
 * session with at least one work-phase set for this exercise, strictly
 * before `beforeIso` -- filtered and sorted by `completed_at`, never array
 * order or "the last one created." Mirrors how `calculatePRs`
 * (packages/pr-engine) already sorts by `completed_at` rather than
 * insertion order. A backfilled historical session can therefore never
 * become the progression baseline for a session that genuinely happened
 * later, and a session logged out of order still finds its own correct
 * chronological predecessor. See docs/PROGRESSION.md "Chronology safety."
 */
export function findPreviousNormalSession(
  sessions: WorkoutSession[],
  exerciseId: string,
  beforeIso: string,
): WorkoutSession | null {
  const candidates = sessions.filter(
    (s) =>
      s.status === 'completed' &&
      !s.is_deload &&
      s.completed_at != null &&
      s.completed_at < beforeIso &&
      s.performed_sets.some((set) => set.exercise_id === exerciseId && setPhaseOf(set) === 'work'),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.completed_at as string).localeCompare(a.completed_at as string));
  return candidates[0] ?? null;
}

function previousTargetFor(
  session: WorkoutSession,
  exerciseId: string,
): ProgressionTargetSnapshot | null {
  const planned = session.planned_snapshot.find((p) => p.exercise_id === exerciseId);
  return planned ? targetSnapshotOf(planned) : null;
}

function workSetsFor(session: WorkoutSession, exerciseId: string): PerformedSet[] {
  return session.performed_sets.filter(
    (set) => set.exercise_id === exerciseId && setPhaseOf(set) === 'work',
  );
}

interface DecisionOutcome {
  result: ProgressionResult;
  summary: string;
  resultingTarget: ProgressionTargetSnapshot;
}

function decideDoubleProgression(
  policy: ProgressionPolicy,
  exercise: Exercise,
  previousTarget: ProgressionTargetSnapshot,
  workSets: PerformedSet[],
): DecisionOutcome {
  if (workSets.length === 0) {
    return {
      result: 'held',
      summary: 'No work sets logged last time -- holding the current target.',
      resultingTarget: previousTarget,
    };
  }
  const repsMax = previousTarget.target_reps_max;
  const repsMin = previousTarget.target_reps_min;
  const allHitCeiling = repsMax != null && workSets.every((s) => (s.reps ?? -Infinity) >= repsMax);
  const loadField = progressableLoadField(exercise);

  if (allHitCeiling) {
    if (policy.load_increment != null && loadField) {
      const nextLoad = loadValue(previousTarget, loadField) + policy.load_increment;
      return {
        result: 'advanced',
        summary: `Last session: every set reached ${repsMax} reps. Policy: Double Progression. Increasing load by ${policy.load_increment}.`,
        resultingTarget: withLoad(previousTarget, loadField, nextLoad),
      };
    }
    return {
      result: 'suggest_advance',
      summary: `Last session: every set reached ${repsMax} reps, the top of the target range. Consider an extra set, added load, or a harder variation.`,
      resultingTarget: previousTarget,
    };
  }

  const allMetFloor = repsMin == null || workSets.every((s) => (s.reps ?? -Infinity) >= repsMin);
  return {
    result: allMetFloor ? 'held' : 'failed_held',
    summary: allMetFloor
      ? `Last session stayed within the target range without reaching the top. Policy: Double Progression. Holding load until every set reaches ${repsMax ?? repsMin ?? 'target'}.`
      : 'Last session fell below the target range. Policy: Double Progression. Holding load.',
    resultingTarget: previousTarget,
  };
}

function decideLinearLoad(
  policy: ProgressionPolicy,
  exercise: Exercise,
  previousTarget: ProgressionTargetSnapshot,
  workSets: PerformedSet[],
): DecisionOutcome {
  if (workSets.length === 0) {
    return {
      result: 'held',
      summary: 'No work sets logged last time -- holding the current target.',
      resultingTarget: previousTarget,
    };
  }
  const repsMin = previousTarget.target_reps_min;
  const succeeded = repsMin == null || workSets.every((s) => (s.reps ?? -Infinity) >= repsMin);
  const loadField = progressableLoadField(exercise);

  if (!succeeded) {
    return {
      result: 'failed_held',
      summary: 'Last session did not reach the target reps -- holding load rather than advancing.',
      resultingTarget: previousTarget,
    };
  }
  if (policy.load_increment != null && loadField) {
    const nextLoad = loadValue(previousTarget, loadField) + policy.load_increment;
    return {
      result: 'advanced',
      summary: `Last session succeeded. Policy: Linear Load. Adding ${policy.load_increment}.`,
      resultingTarget: withLoad(previousTarget, loadField, nextLoad),
    };
  }
  return {
    result: 'suggest_advance',
    summary: 'Last session succeeded, but no load increment is configured for this exercise.',
    resultingTarget: previousTarget,
  };
}

function decideTimed(
  policy: ProgressionPolicy,
  previousTarget: ProgressionTargetSnapshot,
  workSets: PerformedSet[],
): DecisionOutcome {
  const targetDuration = previousTarget.target_duration_seconds;
  if (workSets.length === 0 || targetDuration == null) {
    return {
      result: 'held',
      summary: 'No timed work sets logged last time -- holding the current target.',
      resultingTarget: previousTarget,
    };
  }
  const succeeded = workSets.every((s) => (s.duration_seconds ?? -Infinity) >= targetDuration);
  if (!succeeded) {
    return {
      result: 'failed_held',
      summary: `Last session did not reach ${targetDuration}s -- holding duration.`,
      resultingTarget: previousTarget,
    };
  }
  if (policy.duration_increment_seconds == null) {
    return {
      result: 'suggest_advance',
      summary: 'Target duration reached, but no duration increment is configured.',
      resultingTarget: previousTarget,
    };
  }
  const nextDuration = targetDuration + policy.duration_increment_seconds;
  if (policy.duration_ceiling_seconds != null && nextDuration > policy.duration_ceiling_seconds) {
    return {
      result: 'held',
      summary: `Reached the configured ceiling of ${policy.duration_ceiling_seconds}s. Holding here -- another progression mechanism is needed to go further.`,
      resultingTarget: previousTarget,
    };
  }
  return {
    result: 'advanced',
    summary: `Last session reached ${targetDuration}s. Policy: Timed. Increasing target by ${policy.duration_increment_seconds}s.`,
    resultingTarget: { ...previousTarget, target_duration_seconds: nextDuration },
  };
}

/**
 * The core decision: deterministic, no AI, no randomness (per the v0.2.0
 * handoff: "this is not an AI recommendation system"). Computes what this
 * exercise's target should be for a session starting now, and stores why
 * as structured evidence rather than prose to regenerate later -- see
 * `ProgressionDecision`'s doc comment.
 *
 * Reps are read exactly as stored, never multiplied or halved -- a
 * unilateral exercise's `target_reps_min/max` is already understood
 * per-side by the rest of the codebase (nothing here introduces a second
 * convention), so per-side targets stay valid without special-casing.
 *
 * Pure orchestration-free: never reads or writes storage. The caller
 * (session-start) is responsible for calling `findPreviousNormalSession`
 * and persisting the result onto the new session's `planned_snapshot`
 * entry.
 */
export function computeProgressionDecision(
  policy: ProgressionPolicy,
  exercise: Exercise,
  currentTarget: ProgressionTargetSnapshot,
  previousSession: WorkoutSession | null,
): ProgressionDecision {
  const computed_at = new Date().toISOString();
  const previousTarget = previousSession ? previousTargetFor(previousSession, exercise.id) : null;

  function finish(outcome: DecisionOutcome): ProgressionDecision {
    return {
      policy: policy.kind,
      previous_session_id: previousSession?.id ?? null,
      previous_target: previousTarget,
      previous_result: outcome.result,
      decision_summary: outcome.summary,
      resulting_target: outcome.resultingTarget,
      computed_at,
    };
  }

  if (policy.kind === 'none') {
    return finish({
      result: previousSession ? 'held' : 'first_time',
      summary: 'No progression policy configured for this exercise -- target set manually.',
      resultingTarget: currentTarget,
    });
  }

  if (!previousSession || !previousTarget) {
    return finish({
      result: 'first_time',
      summary: 'First time performing this exercise -- starting at the configured target.',
      resultingTarget: currentTarget,
    });
  }

  const workSets = workSetsFor(previousSession, exercise.id);

  if (policy.kind === 'double_progression') {
    return finish(decideDoubleProgression(policy, exercise, previousTarget, workSets));
  }
  if (policy.kind === 'linear_load') {
    return finish(decideLinearLoad(policy, exercise, previousTarget, workSets));
  }
  return finish(decideTimed(policy, previousTarget, workSets));
}
