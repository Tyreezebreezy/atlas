import type { ExerciseGroup, PlannedExercise } from '@atlas/data-model';

/**
 * Acceptance pass (vNext 04B). A workout holds ONE planned entry per canonical
 * exercise.
 *
 * Everything a workout records about an exercise is keyed by the exercise, not by
 * the slot: the sets logged (`performed_sets`), how many of a slot's sets are done,
 * a skip, a goal, a running timer, and -- since 04B -- the machine
 * (`exercise_equipment`). Two slots for the same exercise would therefore share all
 * of it: the first slot's sets would show up as done in the second, and the plan
 * would silently ask for fewer sets than it prescribed. Rather than key every one
 * of those by slot, the workout guarantees there is only ever one slot to key by.
 *
 * It is guaranteed where a workout is made or changed -- the exercise pickers
 * refuse an exercise already in the workout, `addExerciseTo*` and `replaceExercise`
 * refuse it, an import folds repeats together -- and, for a template saved before
 * that, here: when a workout starts, any repeat is folded into the exercise's first
 * entry. Folding keeps the volume: the repeats' sets are added to the first entry's
 * sets, and the first entry's reps, load, rest and group are kept. A group that is
 * left with fewer than two members stops being a group.
 */
export interface UniqueExercises {
  planned: PlannedExercise[];
  groups: ExerciseGroup[];
  /** Exercise ids that appeared more than once, in the order they first did. */
  repeated: string[];
}

/** True when `exerciseId` already has an entry in `planned`. */
export function hasExercise(
  planned: Pick<PlannedExercise, 'exercise_id'>[],
  exerciseId: string,
): boolean {
  return planned.some((entry) => entry.exercise_id === exerciseId);
}

/** The exercises that occur more than once, in first-seen order -- what an editor warns about. */
export function repeatedExerciseIds(planned: Pick<PlannedExercise, 'exercise_id'>[]): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const entry of planned) {
    if (seen.has(entry.exercise_id) && !repeated.includes(entry.exercise_id))
      repeated.push(entry.exercise_id);
    seen.add(entry.exercise_id);
  }
  return repeated;
}

/** Folds repeats into each exercise's first entry (see the file comment). Returns its inputs untouched when nothing repeats. */
export function mergeRepeatedExercises(
  planned: PlannedExercise[],
  groups: ExerciseGroup[],
): UniqueExercises {
  const firstIndex = new Map<string, number>();
  const kept: PlannedExercise[] = [];
  const repeated: string[] = [];
  for (const entry of planned) {
    const at = firstIndex.get(entry.exercise_id);
    if (at === undefined) {
      firstIndex.set(entry.exercise_id, kept.length);
      kept.push(entry);
      continue;
    }
    const first = kept[at]!;
    kept[at] = {
      ...first,
      target_sets:
        first.target_sets == null && entry.target_sets == null
          ? null
          : (first.target_sets ?? 0) + (entry.target_sets ?? 0),
    };
    if (!repeated.includes(entry.exercise_id)) repeated.push(entry.exercise_id);
  }
  if (repeated.length === 0) return { planned, groups, repeated };

  const members = new Map<string, number>();
  for (const entry of kept)
    if (entry.group_id) members.set(entry.group_id, (members.get(entry.group_id) ?? 0) + 1);
  const liveGroups = groups.filter((group) => (members.get(group.id) ?? 0) >= 2);
  const liveIds = new Set(liveGroups.map((group) => group.id));
  return {
    planned: kept.map((entry) =>
      entry.group_id && !liveIds.has(entry.group_id) ? { ...entry, group_id: null } : entry,
    ),
    groups: liveGroups,
    repeated,
  };
}
