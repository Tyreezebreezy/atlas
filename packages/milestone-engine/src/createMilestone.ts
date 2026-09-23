import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { Milestone, MilestoneDimension } from '@atlas/data-model';

export interface CreateMilestoneInput {
  title: string;
  exerciseId: string | null;
  dimension: MilestoneDimension;
  targetWeight?: number | null;
  targetReps?: number | null;
  targetVolume?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
  targetBodyweightMultiplier?: number | null;
  /** For 'custom' only: target_weight = referenceValue * multiplier, computed once here. */
  referenceValue?: number | null;
  /** For 'custom' (with referenceValue) and 'bodyweight_multiplier' (alone). */
  multiplier?: number | null;
  /** vNext Handoff 02. 'body_weight' dimension only. */
  targetBodyWeight?: number | null;
  /** vNext Handoff 02. 'consistency' dimension only -- set exactly one of this or targetTotalSessions. */
  targetConsecutiveWeeks?: number | null;
  targetTotalSessions?: number | null;
  /** vNext Handoff 02. 'program_completion' dimension only. */
  targetProgramId?: string | null;
  /** vNext Handoff 02. 'benchmark_threshold' dimension only -- set both together. */
  targetBenchmarkId?: string | null;
  targetPercentile?: number | null;
  isBuiltin?: boolean;
  /** Whether this counts toward "My Milestones" (evaluated, surfaced as an
   * active goal) vs catalog-only (see evaluateMilestone's own `!active`
   * skip). Defaults to true -- an owner explicitly creating a custom
   * milestone always means it as a goal; only the built-in seeder passes
   * `false` (see ensureBuiltInMilestonesSeeded.ts). */
  active?: boolean;
}

export function createMilestone(input: CreateMilestoneInput): Milestone {
  const now = new Date().toISOString();
  // 'bodyweight_multiplier' no longer precomputes a static target here (v0.0.8):
  // it's resolved dynamically per-set against logged bodyweight history at
  // evaluation time (see evaluateMilestones.ts / docs/BODY_COMPOSITION.md),
  // since a fixed snapshot would go stale the moment the user's weight
  // changes. 'custom' has no such history to resolve against -- its target
  // is a deliberately fixed number chosen by the user (e.g. "100 lb x 6"),
  // so it still precomputes exactly as before.
  const computedTargetWeight =
    input.dimension === 'custom' && input.referenceValue != null && input.multiplier != null
      ? input.referenceValue * input.multiplier
      : (input.targetWeight ?? null);

  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    title: input.title,
    exercise_id: input.exerciseId,
    dimension: input.dimension,
    target_weight: computedTargetWeight,
    target_reps: input.targetReps ?? null,
    target_volume: input.targetVolume ?? null,
    target_duration_seconds: input.targetDurationSeconds ?? null,
    target_distance_meters: input.targetDistanceMeters ?? null,
    target_bodyweight_multiplier: input.targetBodyweightMultiplier ?? null,
    reference_value: input.referenceValue ?? null,
    multiplier: input.multiplier ?? null,
    target_body_weight: input.targetBodyWeight ?? null,
    target_consecutive_weeks: input.targetConsecutiveWeeks ?? null,
    target_total_sessions: input.targetTotalSessions ?? null,
    target_program_id: input.targetProgramId ?? null,
    target_benchmark_id: input.targetBenchmarkId ?? null,
    target_percentile: input.targetPercentile ?? null,
    is_builtin: input.isBuiltin ?? false,
    active: input.active ?? true,
    achieved_at: null,
    origin_session_id: null,
    origin_set_id: null,
  };
}
