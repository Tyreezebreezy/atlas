import { describe, expect, it } from 'vitest';
import type { ExerciseGroup, PlannedExercise } from '@atlas/data-model';
import { createPlannedExercise } from './createPlannedExercise';
import { addExerciseToSession, addExerciseToTemplate } from './addExercise';
import { createWorkoutTemplate } from './createWorkoutTemplate';
import { applyExerciseReplacementToTemplate, replaceExercise } from './replace';
import { startWorkoutSession } from './session';
import { hasExercise, mergeRepeatedExercises, repeatedExerciseIds } from './uniqueExercises';

function entry(
  exerciseId: string,
  sets: number | null,
  extra: Partial<PlannedExercise> = {},
): PlannedExercise {
  return {
    ...createPlannedExercise(exerciseId, 0),
    target_sets: sets,
    target_reps_min: 8,
    target_reps_max: 12,
    ...extra,
  };
}

describe('mergeRepeatedExercises', () => {
  it('returns its inputs untouched when nothing repeats', () => {
    const planned = [entry('a', 3), entry('b', 3)];
    const groups: ExerciseGroup[] = [];
    const result = mergeRepeatedExercises(planned, groups);
    expect(result.planned).toBe(planned);
    expect(result.groups).toBe(groups);
    expect(result.repeated).toEqual([]);
  });

  it("folds a repeat into the first entry, adding its sets and keeping the first entry's prescription", () => {
    const first = entry('row', 2, {
      target_reps_min: 10,
      target_reps_max: 12,
      target_weight: 90,
      rest_seconds: 60,
    });
    const again = entry('row', 4, { target_reps_min: 6, target_reps_max: 8, target_weight: 110 });
    const result = mergeRepeatedExercises([first, entry('curl', 3), again], []);
    expect(result.repeated).toEqual(['row']);
    expect(result.planned.map((p) => p.exercise_id)).toEqual(['row', 'curl']);
    expect(result.planned[0]).toMatchObject({
      target_sets: 6,
      target_reps_min: 10,
      target_reps_max: 12,
      target_weight: 90,
      rest_seconds: 60,
    });
    expect(result.planned[0]!.id).toBe(first.id);
  });

  it('keeps a missing set count missing when no entry had one', () => {
    expect(
      mergeRepeatedExercises([entry('row', null), entry('row', null)], []).planned[0]!.target_sets,
    ).toBeNull();
    expect(
      mergeRepeatedExercises([entry('row', null), entry('row', 3)], []).planned[0]!.target_sets,
    ).toBe(3);
  });

  it('keeps a group that still has two members after a repeat outside it is folded in', () => {
    const pair: ExerciseGroup = { id: 'g1', type: 'superset', rounds: 3, rest_after_seconds: 90 };
    const planned = [
      entry('a', 3, { group_id: 'g1' }),
      entry('b', 3, { group_id: 'g1' }),
      entry('a', 2),
    ];
    const result = mergeRepeatedExercises(planned, [pair]);
    expect(result.groups).toEqual([pair]);
    expect(result.planned.map((p) => p.group_id)).toEqual(['g1', 'g1']);
    expect(result.planned[0]!.target_sets).toBe(5);
  });

  it('dissolves a group that a folded repeat leaves with a single member', () => {
    const pair: ExerciseGroup = { id: 'g1', type: 'superset', rounds: 3, rest_after_seconds: 90 };
    // b and the repeat of a share g1; the repeat folds into the ungrouped first a, leaving b alone in g1.
    const planned = [
      entry('a', 3),
      entry('b', 3, { group_id: 'g1' }),
      entry('a', 2, { group_id: 'g1' }),
    ];
    const result = mergeRepeatedExercises(planned, [pair]);
    expect(result.groups).toEqual([]);
    expect(result.planned.map((p) => p.group_id)).toEqual([null, null]);
  });
});

describe('repeatedExerciseIds / hasExercise', () => {
  it('lists exercises that occur more than once, in first-seen order', () => {
    expect(
      repeatedExerciseIds([
        entry('a', 1),
        entry('b', 1),
        entry('a', 1),
        entry('b', 1),
        entry('b', 1),
      ]),
    ).toEqual(['a', 'b']);
    expect(repeatedExerciseIds([entry('a', 1), entry('b', 1)])).toEqual([]);
    expect(hasExercise([entry('a', 1)], 'a')).toBe(true);
    expect(hasExercise([entry('a', 1)], 'z')).toBe(false);
  });
});

describe('the engines refuse to make a repeat', () => {
  const baseSession = () =>
    startWorkoutSession({
      name: 'W',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [entry('a', 3), entry('b', 3)],
    });

  it('adding an exercise the workout already has changes nothing (same object)', () => {
    const session = baseSession();
    expect(addExerciseToSession(session, 'a')).toBe(session);
    const template = { ...createWorkoutTemplate('T', false), exercises: [entry('a', 3)] };
    expect(addExerciseToTemplate(template, 'a')).toBe(template);
    expect(addExerciseToSession(session, 'c').planned_snapshot).toHaveLength(3);
  });

  it('replacing an exercise with one the workout already has changes nothing, but a new one swaps in', () => {
    const session = baseSession();
    expect(replaceExercise(session, 'a', 'b', null, 'today')).toBe(session);
    expect(
      replaceExercise(session, 'a', 'c', null, 'today').planned_snapshot.map((p) => p.exercise_id),
    ).toEqual(['c', 'b']);
    const template = {
      ...createWorkoutTemplate('T', false),
      exercises: [entry('a', 3), entry('b', 3)],
    };
    expect(applyExerciseReplacementToTemplate(template, 'a', 'b')).toBe(template);
  });

  it('a workout started from a template that already repeats an exercise folds the repeat into one entry', () => {
    const session = startWorkoutSession({
      name: 'W',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [entry('row', 2), entry('curl', 3), entry('row', 4)],
    });
    expect(session.planned_snapshot.map((p) => [p.exercise_id, p.target_sets])).toEqual([
      ['row', 6],
      ['curl', 3],
    ]);
  });
});
