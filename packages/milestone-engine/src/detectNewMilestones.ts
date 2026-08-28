import type { Milestone } from '@atlas/data-model';

/** Milestones that flipped from not-achieved to achieved between two evaluation passes -- used for the workout-completion summary. */
export function newlyAchievedMilestones(before: Milestone[], after: Milestone[]): Milestone[] {
  const beforeAchievedIds = new Set(before.filter((m) => m.achieved_at != null).map((m) => m.id));
  return after.filter((m) => m.achieved_at != null && !beforeAchievedIds.has(m.id));
}
