import { describe, expect, it } from 'vitest';
import type { ExerciseGroup, PerformedSet, PlannedExercise } from '@atlas/data-model';
import { buildGymSlots, currentGroupRound, isGroupComplete } from './groups';
import { createPlannedExercise } from './createPlannedExercise';

function set(exerciseId: string): PerformedSet {
  return {
    id: `set-${Math.random()}`,
    exercise_id: exerciseId,
    set_index: 0,
    set_type: 'working',
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
