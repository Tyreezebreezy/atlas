import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from './session';
import { previousPerformance } from './previousPerformance';

function completedSessionWithSet(exerciseId: string, weight: number, completedAt: string) {
  let session = startWorkoutSession({
    name: 'Test',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [createPlannedExercise(exerciseId, 0)],
  });
  const set = {
    ...createPerformedSet({
      exerciseId,
      setIndex: 0,
      setType: 'normal',
      weight,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
    }),
    completed_at: completedAt,
  };
  session = addPerformedSet(session, set);
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

describe('previousPerformance', () => {
  it('returns sets from the most recent completed session containing the exercise', () => {
    const older = completedSessionWithSet('ex-1', 160, '2026-08-20T10:00:00.000Z');
    const newer = completedSessionWithSet('ex-1', 170, '2026-08-25T10:00:00.000Z');

    const result = previousPerformance([older, newer], 'ex-1');
    expect(result).toHaveLength(1);
    expect(result[0]?.weight).toBe(170);
  });

  it('ignores in_progress and discarded sessions', () => {
    const completed = completedSessionWithSet('ex-1', 170, '2026-08-25T10:00:00.000Z');
    const inProgress = startWorkoutSession({
      name: 'Live',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
    });

    const result = previousPerformance([completed, inProgress], 'ex-1');
    expect(result[0]?.weight).toBe(170);
  });

  it('excludes the current session when asked', () => {
    const completed = completedSessionWithSet('ex-1', 170, '2026-08-25T10:00:00.000Z');
    const result = previousPerformance([completed], 'ex-1', completed.id);
    expect(result).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(previousPerformance([], 'ex-1')).toEqual([]);
  });
});
