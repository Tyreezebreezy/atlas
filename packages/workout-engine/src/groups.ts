import { newId } from '@atlas/core';
import type { ExerciseGroup, ExerciseGroupType, PerformedSet, PlannedExercise, WorkoutSession } from '@atlas/data-model';

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

function touch(session: WorkoutSession): Pick<WorkoutSession, 'updated_at' | 'version'> {
  return { updated_at: new Date().toISOString(), version: session.version + 1 };
}

/**
 * Creates a superset/circuit live, in-session -- for Freestyle (no
 * template to pre-author a group in) and for grouping exercises added
 * mid-workout to any session. Members must currently be ungrouped
 * (already-grouped exercises are silently skipped, never re-grouped into
 * a second group) and no set may have been logged for any of them yet
 * (`buildGymSlots`/`SupersetRound`'s round-by-round model assumes a group
 * starts at round 0 for every member -- grouping mid-round has no defined
 * meaning). `rounds` defaults to the smallest configured `target_sets`
 * among the members (so the round count reflects what was actually
 * planned), falling back to 3.
 */
export function groupExercisesInSession(
  session: WorkoutSession,
  exerciseIds: string[],
  type: ExerciseGroupType = 'superset',
): WorkoutSession {
  const members = session.planned_snapshot.filter(
    (p) => exerciseIds.includes(p.exercise_id) && !p.group_id,
  );
  if (members.length < 2) return session; // nothing valid to group
  const alreadyLogged = members.some((m) =>
    session.performed_sets.some((set) => set.exercise_id === m.exercise_id),
  );
  if (alreadyLogged) return session;

  const configuredSets = members.map((m) => m.target_sets).filter((n): n is number => n != null);
  const rounds = configuredSets.length > 0 ? Math.min(...configuredSets) : 3;
  const group: ExerciseGroup = { id: newId(), type, rounds, rest_after_seconds: null };
  const memberIds = new Set(members.map((m) => m.exercise_id));

  return {
    ...session,
    groups: [...session.groups, group],
    planned_snapshot: session.planned_snapshot.map((p) =>
      memberIds.has(p.exercise_id) ? { ...p, group_id: group.id } : p,
    ),
    ...touch(session),
  };
}
