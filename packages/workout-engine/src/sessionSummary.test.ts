import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import { addPerformedSet, createPerformedSet, startWorkoutSession } from './session';
import { summarizeSession } from './sessionSummary';

describe('summarizeSession', () => {
  it('counts exercises, sets, and volume, omitting sets without weight*reps', () => {
    let session = startWorkoutSession({
      name: 'Push Day',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0), createPlannedExercise('ex-2', 1)],
    });

    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'ex-1',
        setIndex: 0,
        setType: 'working',
        weight: 170,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'ex-2',
        setIndex: 0,
        setType: 'working',
        weight: null,
        reps: 15,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );

    const summary = summarizeSession(session);
    expect(summary.exerciseCount).toBe(2);
    expect(summary.setCount).toBe(2);
    expect(summary.totalVolume).toBe(170 * 8);
  });
});
