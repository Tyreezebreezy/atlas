import { describe, expect, it } from 'vitest';
import type { ExerciseGroup, PerformedSet, PlannedExercise } from '@atlas/data-model';
import {
  buildGymSlots,
  currentGroupRound,
  groupExercisesInSession,
  isGroupComplete,
} from './groups';
import { createPlannedExercise } from './createPlannedExercise';
import { addPerformedSet, createPerformedSet, startWorkoutSession } from './session';

function set(exerciseId: string): PerformedSet {
  return {
    id: `set-${Math.random()}`,
    exercise_id: exerciseId,
    set_index: 0,
    set_type: 'normal',
    weight: null,
    reps: null,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    rir: null,
    completed_at: new Date().toISOString(),
    notes: null,
  };
}

describe('buildGymSlots', () => {
  it('keeps ungrouped exercises as their own slot, unchanged from before v0.1.1', () => {
    const a = createPlannedExercise('ex-a', 1);
    const b = createPlannedExercise('ex-b', 2);
    const slots = buildGymSlots([a, b], []);
    expect(slots).toEqual([
      { kind: 'single', planned: a },
      { kind: 'single', planned: b },
    ]);
  });

  it("collapses every member sharing a group_id into one slot at the first member's position", () => {
    const group: ExerciseGroup = { id: 'g1', type: 'superset', rounds: 4, rest_after_seconds: 90 };
    const a1 = { ...createPlannedExercise('ex-a', 1), group_id: 'g1' };
    const a2 = { ...createPlannedExercise('ex-b', 2), group_id: 'g1' };
    const c = createPlannedExercise('ex-c', 3);
    const slots = buildGymSlots([a1, a2, c], [group]);
    expect(slots).toEqual([
      { kind: 'group', group, members: [a1, a2] },
      { kind: 'single', planned: c },
    ]);
  });

  it('degrades a group_id with no matching ExerciseGroup to a plain single slot rather than throwing', () => {
    const orphan = { ...createPlannedExercise('ex-a', 1), group_id: 'missing-group' };
    expect(buildGymSlots([orphan], [])).toEqual([{ kind: 'single', planned: orphan }]);
  });
});

describe('currentGroupRound / isGroupComplete', () => {
  const group: ExerciseGroup = { id: 'g1', type: 'superset', rounds: 3, rest_after_seconds: 60 };
  const a1: PlannedExercise = { ...createPlannedExercise('ex-a', 1), group_id: 'g1' };
  const a2: PlannedExercise = { ...createPlannedExercise('ex-b', 2), group_id: 'g1' };
  const members = [a1, a2];

  it('is round 0 with nothing logged yet', () => {
    expect(currentGroupRound(group, members, [])).toBe(0);
    expect(isGroupComplete(group, members, [])).toBe(false);
  });

  it("stays on the round the slower member hasn't finished -- not the round the faster one is on", () => {
    const performedSets = [set('ex-a'), set('ex-a')]; // A1 has 2 rounds logged, A2 has 0
    expect(currentGroupRound(group, members, performedSets)).toBe(0);
  });

  it('advances once every member has logged that round', () => {
    const performedSets = [set('ex-a'), set('ex-b')];
    expect(currentGroupRound(group, members, performedSets)).toBe(1);
  });

  it('is complete once every member has logged every round', () => {
    const performedSets = [
      set('ex-a'),
      set('ex-a'),
      set('ex-a'),
      set('ex-b'),
      set('ex-b'),
      set('ex-b'),
    ];
    expect(currentGroupRound(group, members, performedSets)).toBe(3);
    expect(isGroupComplete(group, members, performedSets)).toBe(true);
  });
});

describe('groupExercisesInSession', () => {
  function freestyleSession(exercises: PlannedExercise[]) {
    return startWorkoutSession({
      name: 'Freestyle Workout',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: exercises,
    });
  }

  it('groups two ungrouped exercises into a live superset', () => {
    const a = createPlannedExercise('ex-a', 0);
    const b = createPlannedExercise('ex-b', 1);
    const session = freestyleSession([a, b]);

    const updated = groupExercisesInSession(session, ['ex-a', 'ex-b']);

    expect(updated.groups).toHaveLength(1);
    const [group] = updated.groups;
    expect(group?.type).toBe('superset');
    expect(updated.planned_snapshot.every((p) => p.group_id === group?.id)).toBe(true);
  });

  it('rounds default to the smaller of the two members configured target_sets', () => {
    const a = { ...createPlannedExercise('ex-a', 0), target_sets: 4 };
    const b = { ...createPlannedExercise('ex-b', 1), target_sets: 3 };
    const updated = groupExercisesInSession(freestyleSession([a, b]), ['ex-a', 'ex-b']);
    expect(updated.groups[0]?.rounds).toBe(3);
  });

  it('falls back to 3 rounds when neither member has target_sets configured', () => {
    const a = createPlannedExercise('ex-a', 0);
    const b = createPlannedExercise('ex-b', 1);
    const updated = groupExercisesInSession(freestyleSession([a, b]), ['ex-a', 'ex-b']);
    expect(updated.groups[0]?.rounds).toBe(3);
  });

  it('is a no-op when fewer than two of the requested exercises are actually groupable', () => {
    const a = createPlannedExercise('ex-a', 0);
    const session = freestyleSession([a]);
    const updated = groupExercisesInSession(session, ['ex-a', 'ex-missing']);
    expect(updated).toBe(session);
  });

  it('never re-groups an exercise that already belongs to a group', () => {
    const a = createPlannedExercise('ex-a', 0);
    const b = createPlannedExercise('ex-b', 1);
    const c = createPlannedExercise('ex-c', 2);
    let session = freestyleSession([a, b, c]);
    session = groupExercisesInSession(session, ['ex-a', 'ex-b']);
    const firstGroupId = session.groups[0]?.id;

    // Attempting to also group the already-grouped 'ex-a' with 'ex-c' must
    // not succeed -- only genuinely ungrouped exercises are eligible.
    const attempted = groupExercisesInSession(session, ['ex-a', 'ex-c']);
    expect(attempted).toBe(session);
    expect(session.groups[0]?.id).toBe(firstGroupId);
  });

  it('refuses to group once either exercise already has a logged set', () => {
    const a = createPlannedExercise('ex-a', 0);
    const b = createPlannedExercise('ex-b', 1);
    let session = freestyleSession([a, b]);
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'ex-a',
        setIndex: 0,
        setType: 'normal',
        weight: 100,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
    const updated = groupExercisesInSession(session, ['ex-a', 'ex-b']);
    expect(updated).toBe(session);
    expect(updated.groups).toHaveLength(0);
  });
});
