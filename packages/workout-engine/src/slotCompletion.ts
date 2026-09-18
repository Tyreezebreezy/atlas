import type { PerformedSet, PlannedExercise } from '@atlas/data-model';

/**
 * v0.2.5. Required / Optional / OR-slot semantics. Pure, storage-free, so
 * the same rules drive Gym Mode navigation, the "X of Y" counter, and the
 * finish/completion surface without each re-deriving them.
 *
 * Three axes, deliberately kept separate (see docs/PROGRESSION.md's
 * "set phase" split for the same principle -- orthogonal concepts live on
 * orthogonal fields, never a single overloaded enum):
 *
 *  - Optional (`is_optional`): visible but never required. Doesn't block
 *    workout completion.
 *  - OR slot (`or_group`): N exercises sharing one id are equivalent
 *    selections; completing ANY one satisfies the whole slot. Don't count
 *    all N as required, and don't require more than one.
 *  - Superset/circuit (`group_id`): handled by `buildGymSlots`, not here.
 */

export function isOptionalExercise(planned: Pick<PlannedExercise, 'is_optional'>): boolean {
  return planned.is_optional === true;
}

/** Whether this exercise is a member of an OR-slot ("choose one of several
 * equivalent selections"). */
export function isOrMember(planned: Pick<PlannedExercise, 'or_group'>): boolean {
  return planned.or_group != null;
}

/** All planned exercises sharing one OR-slot id, in plan order. */
export function orGroupMembers(plannedList: PlannedExercise[], orGroup: string): PlannedExercise[] {
  return plannedList.filter((p) => p.or_group === orGroup);
}

/** Count of completed sets (any phase) logged for one exercise. */
export function setsDoneFor(performedSets: PerformedSet[], exerciseId: string): number {
  return performedSets.filter((s) => s.exercise_id === exerciseId).length;
}

/** Whether this one exercise's own prescribed work is fully logged --
 * `target_sets` completed sets, defaulting to one when unset. */
export function exerciseIsComplete(
  planned: Pick<PlannedExercise, 'target_sets' | 'exercise_id'>,
  performedSets: PerformedSet[],
): boolean {
  const target = planned.target_sets ?? 1;
  return setsDoneFor(performedSets, planned.exercise_id) >= target;
}

/**
 * Whether this exercise's *slot* is satisfied, considering OR grouping.
 *
 *  - OR member: satisfied when ANY member of the shared OR group is fully
 *    complete (the owner chose that alternative).
 *  - Otherwise: satisfied when this exercise is itself fully complete.
 *
 * Does NOT consider `is_optional` (optional-ness is about whether the slot
 * is *required*, not whether it's done) nor skips (the caller has
 * `skipped_exercises` and checks those separately).
 */
export function exerciseSlotComplete(
  planned: PlannedExercise,
  allPlanned: PlannedExercise[],
  performedSets: PerformedSet[],
): boolean {
  if (planned.or_group != null) {
    return orGroupMembers(allPlanned, planned.or_group).some((m) =>
      exerciseIsComplete(m, performedSets),
    );
  }
  return exerciseIsComplete(planned, performedSets);
}

export interface RequiredSlotStats {
  /** Distinct required slots (OR groups collapsed to one, optional excluded). */
  total: number;
  /** Of those, how many are satisfied (complete or skipped). */
  complete: number;
}

/**
 * Required-slot tally for the "X of Y complete" and finish surfaces.
 * Optional exercises are excluded entirely; every OR group collapses to a
 * single slot (satisfied when any member is complete OR any member was
 * skipped). A normal exercise is its own slot. Superset/circuit grouping is
 * intentionally NOT collapsed here -- that's `buildGymSlots`' concern, and
 * callers needing a per-slot count combine the two.
 */
export function requiredSlotStats(
  allPlanned: PlannedExercise[],
  performedSets: PerformedSet[],
  skippedExerciseIds: Set<string>,
): RequiredSlotStats {
  const seenOrGroups = new Set<string>();
  let total = 0;
  let complete = 0;

  for (const planned of allPlanned) {
    if (isOptionalExercise(planned)) continue;

    if (planned.or_group != null) {
      if (seenOrGroups.has(planned.or_group)) continue;
      seenOrGroups.add(planned.or_group);
      const members = orGroupMembers(allPlanned, planned.or_group);
      const done = members.some(
        (m) => exerciseIsComplete(m, performedSets) || skippedExerciseIds.has(m.exercise_id),
      );
      total += 1;
      if (done) complete += 1;
      continue;
    }

    total += 1;
    if (exerciseIsComplete(planned, performedSets) || skippedExerciseIds.has(planned.exercise_id)) {
      complete += 1;
    }
  }

  return { total, complete };
}
