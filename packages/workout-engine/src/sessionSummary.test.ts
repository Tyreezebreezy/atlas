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
        setType: 'normal',
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
        setType: 'normal',
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

  it('excludes warm-up sets from volume -- a working-set-analytics figure, same rule as PRs', () => {
    let session = startWorkoutSession({
      name: 'Push Day',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
    });
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'ex-1',
        setIndex: 0,
        phase: 'warmup',
        setType: 'normal',
        weight: 45,
        reps: 15,
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
        exerciseId: 'ex-1',
        setIndex: 1,
        setType: 'normal',
        weight: 70,
        reps: 10,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );

    expect(summarizeSession(session).totalVolume).toBe(70 * 10);
  });

  it('counts external_load for weighted-bodyweight sets that have no weight field', () => {
    let session = startWorkoutSession({
      name: 'Pull Day',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('pull-up', 0)],
    });
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'pull-up',
        setIndex: 0,
        setType: 'normal',
        weight: null,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
        externalLoad: 25,
      }),
    );

    expect(summarizeSession(session).totalVolume).toBe(25 * 8);
  });
});
