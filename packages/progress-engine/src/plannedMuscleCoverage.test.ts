import { describe, expect, it } from 'vitest';
import type { Exercise, PlannedExercise } from '@atlas/data-model';
import { plannedMuscleCoverage } from './plannedMuscleCoverage';

function exercise(id: string, primary: string[], secondary: string[] = []): Exercise {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: id,
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: true,
    source: 'user',
    source_id: null,
    user_notes: null,
    enrichment: null,
    muscle_map: { primary, secondary, provenance: 'user', taxonomy_version: '1.0.0' },
  };
}

function planned(exerciseId: string, sets: number | null): PlannedExercise {
  return {
    id: `p-${exerciseId}`,
    exercise_id: exerciseId,
    order: 0,
    target_sets: sets,
    target_reps_min: null,
    target_reps_max: null,
    target_weight: null,
    target_external_load: null,
    target_rpe: null,
    target_rir: null,
    target_duration_seconds: null,
    target_distance_meters: null,
    rest_seconds: null,
    notes: null,
    group_id: null,
  };
}

describe('plannedMuscleCoverage', () => {
  const press = exercise('press', ['chest.upper', 'chest.mid', 'chest.lower'], ['arms.triceps']);
  const squat = exercise('squat', ['quads.quadriceps', 'glutes.max']);
  const library = new Map([press, squat].map((e) => [e.id, e]));

  it("a muscle group counts a planned set once per exercise, however many of the group's muscles it targets", () => {
    // Three chest muscles are primary, but three planned sets are three sets of chest work -- not nine.
    const { byGroup } = plannedMuscleCoverage([planned('press', 3)], library);
    expect(byGroup).toEqual([{ label: 'Chest', workingSets: 3 }]);
  });

  it('each muscle still shows the sets aimed at it', () => {
    const { byMuscle } = plannedMuscleCoverage([planned('press', 3)], library);
    expect(byMuscle.filter((m) => m.directSets > 0).map((m) => [m.muscleId, m.directSets])).toEqual(
      [
        ['chest.upper', 3],
        ['chest.mid', 3],
        ['chest.lower', 3],
      ],
    );
    expect(byMuscle.find((m) => m.muscleId === 'arms.triceps')).toMatchObject({
      directSets: 0,
      secondarySets: 3,
    });
  });

  it('an exercise whose primaries sit in different groups counts once in each group', () => {
    const { byGroup } = plannedMuscleCoverage([planned('squat', 4)], library);
    expect(byGroup).toEqual(
      expect.arrayContaining([
        { label: 'Quadriceps', workingSets: 4 },
        { label: 'Glutes', workingSets: 4 },
      ]),
    );
    expect(byGroup).toHaveLength(2);
  });

  it('sums across exercises in the same group and treats a missing set count as one set', () => {
    const { byGroup } = plannedMuscleCoverage(
      [planned('press', 3), planned('press', null)],
      library,
    );
    expect(byGroup).toEqual([{ label: 'Chest', workingSets: 4 }]);
  });
});
