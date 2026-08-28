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
  /** For 'custom' and 'bodyweight_multiplier': target_weight = referenceValue * multiplier, computed once here. */
  referenceValue?: number | null;
  multiplier?: number | null;
  isBuiltin?: boolean;
}

export function createMilestone(input: CreateMilestoneInput): Milestone {
  const now = new Date().toISOString();
  const computesFromReference =
    input.dimension === 'custom' || input.dimension === 'bodyweight_multiplier';
  const computedTargetWeight =
    computesFromReference && input.referenceValue != null && input.multiplier != null
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
    is_builtin: input.isBuiltin ?? false,
    active: true,
    achieved_at: null,
    origin_session_id: null,
    origin_set_id: null,
  };
}
