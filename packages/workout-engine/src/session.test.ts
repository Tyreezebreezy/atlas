import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  discardWorkoutSession,
  removePerformedSet,
  startWorkoutSession,
  setSessionNote,
} from './session';

function makeSession() {
  const planned = [createPlannedExercise('ex-1', 0)];
  return startWorkoutSession({
    name: 'Push Day',
    templateId: 'template-1',
    programId: null,
    programDayId: null,
    plannedSnapshot: planned,
  });
}

describe('startWorkoutSession', () => {
  it('starts in_progress with an independent copy of the planned exercises', () => {
    const planned = [createPlannedExercise('ex-1', 0)];
    const session = startWorkoutSession({
      name: 'Push Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: planned,
    });

    expect(session.status).toBe('in_progress');
    expect(session.performed_sets).toEqual([]);
    expect(session.planned_snapshot).toEqual(planned);
    expect(session.planned_snapshot).not.toBe(planned);

    // mutating the source array after the fact must not affect the snapshot
    planned.push(createPlannedExercise('ex-2', 1));
    expect(session.planned_snapshot).toHaveLength(1);
  });
});

describe('addPerformedSet / removePerformedSet', () => {
  it('appends and removes sets, bumping version each time', () => {
    let session = makeSession();
    const set = createPerformedSet({
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
    });

    session = addPerformedSet(session, set);
    expect(session.performed_sets).toHaveLength(1);
    expect(session.version).toBe(2);

    session = removePerformedSet(session, set.id);
    expect(session.performed_sets).toHaveLength(0);
    expect(session.version).toBe(3);
  });

  it('represents a bodyweight set with a null weight, not zero', () => {
    const set = createPerformedSet({
      exerciseId: 'ex-1',
      setIndex: 0,
      setType: 'working',
      weight: null,
      reps: 15,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
    });
    expect(set.weight).toBeNull();
    expect(set.reps).toBe(15);
  });
});

describe('completeWorkoutSession / discardWorkoutSession', () => {
  it('completing stamps status and completed_at', () => {
    const session = makeSession();
    const completed = completeWorkoutSession(session);
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).not.toBeNull();
  });

  it('discarding is a status change, not a delete', () => {
    const session = makeSession();
    const discarded = discardWorkoutSession(session);
    expect(discarded.status).toBe('discarded');
    expect(discarded.id).toBe(session.id);
  });
});

describe('setSessionNote', () => {
  it('stores a note, and treats an empty string as null', () => {
    let session = makeSession();
    session = setSessionNote(session, 'Felt strong today.');
    expect(session.session_note).toBe('Felt strong today.');
    session = setSessionNote(session, '');
    expect(session.session_note).toBeNull();
  });
});
