import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from '@atlas/workout-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { trainingRecency } from './trainingRecency';

function makeExercise(id: string, category: string): Exercise {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: id,
    aliases: [],
    category,
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
  };
}

function completedSessionAt(
  completedAt: string,
  exerciseId: string,
  phase: 'work' | 'warmup' = 'work',
): WorkoutSession {
  let session = startWorkoutSession({
    name: 'S',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
  });
  session = addPerformedSet(
    session,
    createPerformedSet({
      exerciseId,
      setIndex: 0,
      phase,
      setType: 'normal',
      weight: 100,
      reps: 5,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
    }),
  );
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

describe('trainingRecency', () => {
  const now = new Date('2026-09-07T12:00:00.000Z');
  const exercises = new Map([
    ['bench', makeExercise('bench', 'chest')],
    ['row', makeExercise('row', 'back')],
  ]);

  it('computes days since the most recent eligible session per muscle group', () => {
    const chest = completedSessionAt('2026-09-05T12:00:00.000Z', 'bench');
    const back = completedSessionAt('2026-09-01T12:00:00.000Z', 'row');
    const result = trainingRecency([chest, back], exercises, now);
    expect(result).toEqual([
      { label: 'chest', daysSinceTrained: 2 },
      { label: 'back', daysSinceTrained: 6 },
    ]);
  });

  it('uses the MOST RECENT session when a muscle group was trained more than once', () => {
    const older = completedSessionAt('2026-09-01T12:00:00.000Z', 'bench');
    const newer = completedSessionAt('2026-09-06T12:00:00.000Z', 'bench');
    const result = trainingRecency([older, newer], exercises, now);
    expect(result).toEqual([{ label: 'chest', daysSinceTrained: 1 }]);
  });

  it('excludes warm-up-only sessions from recency, same eligibility rule as everywhere else', () => {
    const warmupOnly = completedSessionAt('2026-09-06T12:00:00.000Z', 'bench', 'warmup');
    expect(trainingRecency([warmupOnly], exercises, now)).toEqual([]);
  });

  it('never includes a muscle group with no logged history at all', () => {
    const result = trainingRecency([], exercises, now);
    expect(result).toEqual([]);
  });
});
