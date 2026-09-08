import type { Exercise, Milestone } from '@atlas/data-model';

export interface MilestoneGroup {
  exerciseId: string | null;
  /** The exercise's own display name, or the milestone's own title for the
   * rare custom milestone with no linked exercise at all. */
  displayName: string;
  milestones: Milestone[];
}

/** The one number that makes one milestone "bigger" than another of the
 * same movement -- semantic, not the title string (a title-sorted list
 * puts "100 Push-Ups" before "25 Push-Ups"; this doesn't). */
function semanticTarget(milestone: Milestone): number {
  switch (milestone.dimension) {
    case 'weight':
    case 'weight_and_reps':
      return milestone.target_weight ?? 0;
    case 'reps':
      return milestone.target_reps ?? 0;
    case 'volume':
      return milestone.target_volume ?? 0;
    case 'duration':
      return milestone.target_duration_seconds ?? 0;
    case 'distance':
      return milestone.target_distance_meters ?? 0;
    case 'bodyweight_multiplier':
      return milestone.target_bodyweight_multiplier ?? 0;
    case 'custom':
      return milestone.target_weight ?? milestone.reference_value ?? 0;
  }
}

function localeCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * Groups by canonical `exercise_id` (never by title text, which scrambles
 * "100 Push-Ups" next to "60-Second Plank" the moment two different
 * movements' milestones interleave by achieved-date) -- see
 * docs/DATA_MODEL.md "Milestone grouping" (v0.2.2). Groups sort
 * alphabetically by exercise display name; within a group, ascending by
 * `semanticTarget`, so "10, 25, 50, 75, 100 Push-Ups" reads as a ladder
 * regardless of which ones happen to be achieved yet or when.
 *
 * A milestone with no `exercise_id` (a fully custom goal not tied to any
 * specific movement) gets its own singleton group keyed by its own id,
 * displayed under its own title -- rare in practice (every built-in
 * milestone has one), but never dropped or crashed on.
 */
export function groupMilestones(
  milestones: Milestone[],
  exercisesById: Map<string, Exercise>,
): MilestoneGroup[] {
  const groups = new Map<string, MilestoneGroup>();
  for (const milestone of milestones) {
    const key = milestone.exercise_id ?? `__custom__${milestone.id}`;
    let group = groups.get(key);
    if (!group) {
      const displayName = milestone.exercise_id
        ? (exercisesById.get(milestone.exercise_id)?.name ?? milestone.title)
        : milestone.title;
      group = { exerciseId: milestone.exercise_id, displayName, milestones: [] };
      groups.set(key, group);
    }
    group.milestones.push(milestone);
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.milestones.sort((a, b) => semanticTarget(a) - semanticTarget(b));
  }
  result.sort((a, b) => localeCompare(a.displayName, b.displayName));
  return result;
}
