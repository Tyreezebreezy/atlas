import type { Milestone, PersonalRecord, PrKind } from '@atlas/data-model';

export interface MilestoneProgress {
  /** The relevant PR's current best, in the milestone's own unit. Null when there's no comparable history yet. */
  current: number | null;
  /** target - current, clamped to >= 0. Null whenever `current` is null or the goal type has no single directly-comparable "current" (see below). */
  remaining: number | null;
  /** Always set -- an honest sentence, never a fabricated percentage when `remaining` is null. */
  text: string;
}

function unitFor(milestone: Milestone): string {
  switch (milestone.dimension) {
    case 'reps':
      return 'reps';
    case 'duration':
      return 'sec';
    default:
      return 'lb';
  }
}

/** Best-ever value for the ONE PR kind that's directly comparable to this milestone's target, or null if that kind doesn't exist yet for this exercise. `weight_and_reps` additionally requires the PR's own `reps` to exactly match the target -- a best weight logged at a different rep count isn't the same claim as "weight for THIS many reps." */
function currentFor(milestone: Milestone, personalRecords: PersonalRecord[]): number | null {
  if (!milestone.exercise_id) return null;
  const forExercise = personalRecords.filter((pr) => pr.exercise_id === milestone.exercise_id);
  const byKind = (kind: PrKind) => forExercise.find((pr) => pr.kind === kind) ?? null;

  switch (milestone.dimension) {
    case 'weight':
    case 'custom':
      return byKind('max_load')?.value ?? null;
    case 'duration':
      return byKind('timed')?.value ?? null;
    case 'volume':
      return byKind('volume')?.value ?? null;
    case 'reps': {
      // Whichever kind actually exists for this exercise's measurement type
      // (bodyweight-only vs weighted) -- calculatePRs only ever computes one of the two.
      const bodyweight = byKind('bodyweight');
      if (bodyweight) return bodyweight.value;
      return byKind('rep')?.value ?? null;
    }
    case 'weight_and_reps': {
      if (milestone.target_reps == null) return null;
      const atSameReps = forExercise.find(
        (pr) => pr.kind === 'rep_range' && pr.reps === milestone.target_reps,
      );
      return atSameReps?.value ?? null;
    }
    // 'distance' and 'bodyweight_multiplier' fall through to the honest
    // "not comparable" text below -- distance has no example in the spec to
    // pin a unit/rounding convention against, and bodyweight_multiplier's
    // target moves with logged bodyweight, so a static PR isn't the same
    // claim as "current % of today's bodyweight."
    default:
      return null;
  }
}

function targetFor(milestone: Milestone): number | null {
  switch (milestone.dimension) {
    case 'weight':
    case 'custom':
    case 'weight_and_reps':
      return milestone.target_weight;
    case 'reps':
      return milestone.target_reps;
    case 'duration':
      return milestone.target_duration_seconds;
    case 'volume':
      return milestone.target_volume;
    default:
      return null;
  }
}

/**
 * Simple, honest "how far off" text for a not-yet-achieved milestone (v0.2.3
 * Part I). Deliberately narrow: only dimensions with one unambiguous
 * "current" PR to compare against get a number at all ("weight_and_reps"
 * additionally requires that PR to be at the EXACT target rep count, not
 * merely the same exercise). Everything else -- no history yet, or a goal
 * type with no single comparable "current" (distance, bodyweight_multiplier)
 * -- gets honest text instead of a invented percentage.
 */
export function describeMilestoneProgress(
  milestone: Milestone,
  personalRecords: PersonalRecord[],
): MilestoneProgress {
  const target = targetFor(milestone);
  const current = currentFor(milestone, personalRecords);
  const unit = unitFor(milestone);

  if (target == null || current == null) {
    return { current, remaining: null, text: 'Not enough data yet to show progress.' };
  }

  const remaining = Math.max(0, target - current);
  if (remaining <= 0) {
    return { current, remaining: 0, text: 'Goal reached.' };
  }
  return { current, remaining, text: `${remaining} ${unit} to goal` };
}
