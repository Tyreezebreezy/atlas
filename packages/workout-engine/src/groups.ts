import type { ExerciseGroup, PerformedSet, PlannedExercise } from '@atlas/data-model';

export interface GymSingleSlot {
  kind: 'single';
  planned: PlannedExercise;
}

export interface GymGroupSlot {
  kind: 'group';
  group: ExerciseGroup;
  members: PlannedExercise[];
}

export type GymSlot = GymSingleSlot | GymGroupSlot;

/** Collapses a flat planned_snapshot into Gym Mode's navigation units: an
 * ungrouped exercise is still its own slot (unchanged from before v0.1.1);
 * every PlannedExercise sharing one group_id becomes a single slot, at the
 * position of its first member. A group_id with no matching ExerciseGroup
 * (shouldn't happen, but session/template data predates validation)
 * degrades to treating that member as an ordinary single slot rather than
 * throwing. */
export function buildGymSlots(
  plannedSnapshot: PlannedExercise[],
  groups: ExerciseGroup[],
): GymSlot[] {
  const slots: GymSlot[] = [];
  const emitted = new Set<string>();
  for (const planned of plannedSnapshot) {
    if (!planned.group_id) {
      slots.push({ kind: 'single', planned });
      continue;
    }
    if (emitted.has(planned.group_id)) continue;
    const group = groups.find((g) => g.id === planned.group_id);
    if (!group) {
      slots.push({ kind: 'single', planned });
      continue;
    }
    emitted.add(planned.group_id);
    const members = plannedSnapshot.filter((p) => p.group_id === planned.group_id);
    slots.push({ kind: 'group', group, members });
  }
  return slots;
}

/** 0-based index of the round still in progress -- the round every member
 * has logged the fewest sets for. Stateless by design: derived from
 * performed_sets alone, the same "derive, don't track separately"
 * principle as firstIncompleteExerciseIndex. Returns `group.rounds` (one
 * past the last valid index) once every member has completed every
 * round. */
export function currentGroupRound(
  group: ExerciseGroup,
  members: PlannedExercise[],
  performedSets: PerformedSet[],
): number {
  if (members.length === 0) return group.rounds;
  const counts = members.map(
    (member) => performedSets.filter((set) => set.exercise_id === member.exercise_id).length,
  );
  return Math.min(...counts, group.rounds);
}

export function isGroupComplete(
  group: ExerciseGroup,
  members: PlannedExercise[],
  performedSets: PerformedSet[],
): boolean {
  return currentGroupRound(group, members, performedSets) >= group.rounds;
}
