import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from '@atlas/workout-engine';
import type { Exercise, PlannedExercise, WorkoutSession } from '@atlas/data-model';
import { trainingExposure, sessionMuscleExposure } from './trainingExposure';
import { plannedMuscleCoverage } from './plannedMuscleCoverage';

function exercise(id: string, muscleMap: Exercise['muscle_map']): Exercise {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Exercise',
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
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
    muscle_map: muscleMap,
  };
}

function performedSet(exerciseId: string, weight: number, reps: number) {
  return createPerformedSet({
    exerciseId,
    setIndex: 0,
    setType: 'normal',
    weight,
    reps,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    rir: null,
    notes: null,
  });
}

function completedSession(exerciseId: string, sets: ReturnType<typeof performedSet>[]): WorkoutSession {
  let session = startWorkoutSession({
    name: 'Session',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
  });
  const at = '2026-09-01T10:00:00.000Z';
  for (const s of sets) {
    session = addPerformedSet(session, { ...s, completed_at: at });
  }
  return completeWorkoutSession(session);
}

const BENCH = exercise('bench', {
  primary: ['chest.mid'],
  secondary: ['arms.triceps', 'shoulders.anterior'],
  provenance: 'curated',
  taxonomy_version: '1.0.0',
});

describe('trainingExposure', () => {
  it('distinguishes direct (primary) sets from secondary involvement', () => {
    const session = completedSession('bench', [
      performedSet('bench', 100, 10),
      performedSet('bench', 100, 10),
    ]);
    const exercises = new Map([['bench', BENCH]]);
    const exposure = trainingExposure([session], exercises, 365);

    const chest = exposure.muscles.find((m) => m.muscleId === 'chest.mid');
    expect(chest?.directSets).toBe(2);
    expect(chest?.volume).toBe(2000);
    expect(chest?.exercises).toEqual(['bench']);

    const triceps = exposure.muscles.find((m) => m.muscleId === 'arms.triceps');
    expect(triceps?.directSets).toBe(0);
    expect(triceps?.secondarySets).toBe(2);
  });

  it('sorts by direct sets, then secondary', () => {
    const session = completedSession('bench', [performedSet('bench', 100, 10)]);
    const exposure = trainingExposure([session], new Map([['bench', BENCH]]), 365);
    expect(exposure.muscles[0]?.muscleId).toBe('chest.mid');
  });

  it('sessionMuscleExposure returns the same shape for one session', () => {
    const session = completedSession('bench', [performedSet('bench', 100, 8)]);
    const muscles = sessionMuscleExposure(session, new Map([['bench', BENCH]]));
    expect(muscles.find((m) => m.muscleId === 'chest.mid')?.directSets).toBe(1);
  });
});

describe('plannedMuscleCoverage', () => {
  it('tallies planned target_sets by primary/secondary muscle', () => {
    const planned: PlannedExercise[] = [
      { id: 'p1', exercise_id: 'bench', order: 0, target_sets: 3, group_id: null } as PlannedExercise,
    ];
    const coverage = plannedMuscleCoverage(planned, new Map([['bench', BENCH]]));
    const chest = coverage.byMuscle.find((m) => m.muscleId === 'chest.mid');
    expect(chest?.directSets).toBe(3);
    const triceps = coverage.byMuscle.find((m) => m.muscleId === 'arms.triceps');
    expect(triceps?.secondarySets).toBe(3);
    expect(coverage.byGroup).toContainEqual({ label: 'Chest', workingSets: 3 });
  });
});
