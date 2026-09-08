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

  it('defaults scheduled_date to null when not given -- Freestyle/Quick Workouts and "Do Again" reruns', () => {
    const session = makeSession();
    expect(session.scheduled_date).toBeNull();
  });

  it('v0.2.4: scheduled_date is independent of startedAt -- a live late completion sets scheduled_date without backdating started_at', () => {
    // The defining case this release fixes: starting Monday's missed
    // workout live on Tuesday. started_at must stay real "now" (no
    // startedAt override at all) while scheduled_date carries Monday.
    const before = Date.now();
    const session = startWorkoutSession({
      name: 'Upper A',
      templateId: 't-1',
      programId: 'prog-1',
      programDayId: 'day-1',
      plannedSnapshot: [],
      scheduledDate: '2026-09-07', // Monday
    });
    expect(session.scheduled_date).toBe('2026-09-07');
    expect(new Date(session.started_at).getTime()).toBeGreaterThanOrEqual(before);
    expect(session.planned_completed_at).toBeNull();
  });

  it('v0.2.4: only an explicit startedAt override (Log Past Workout) backdates started_at -- scheduledDate never does', () => {
    const session = startWorkoutSession({
      name: 'Upper A',
      templateId: 't-1',
      programId: 'prog-1',
      programDayId: 'day-1',
      plannedSnapshot: [],
      startedAt: '2026-08-01T12:00:00.000Z',
      plannedCompletedAt: '2026-08-01T13:00:00.000Z',
      scheduledDate: '2026-08-01',
    });
    expect(session.started_at).toBe('2026-08-01T12:00:00.000Z');
    expect(session.planned_completed_at).toBe('2026-08-01T13:00:00.000Z');
    expect(session.scheduled_date).toBe('2026-08-01');
  });
});

describe('addPerformedSet / removePerformedSet', () => {
  it('appends and removes sets, bumping version each time', () => {
    let session = makeSession();
    const set = createPerformedSet({
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
      setType: 'normal',
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

  it('stamps completed_at from completedAt when given, for backdated Log Past Workout entries', () => {
    const set = createPerformedSet({
      exerciseId: 'ex-1',
      setIndex: 0,
      setType: 'normal',
      weight: 90,
      reps: 12,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
      completedAt: '2026-08-01T17:00:00.000Z',
    });
    expect(set.completed_at).toBe('2026-08-01T17:00:00.000Z');
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

  it('a historical entry completes at its planned date, not the moment Finish is tapped', () => {
    const historical = startWorkoutSession({
      name: 'Backfilled Session',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
      startedAt: '2026-08-01T18:00:00.000Z',
      plannedCompletedAt: '2026-08-01T19:00:00.000Z',
    });
    const completed = completeWorkoutSession(historical);
    expect(completed.started_at).toBe('2026-08-01T18:00:00.000Z');
    expect(completed.completed_at).toBe('2026-08-01T19:00:00.000Z');
    expect(completed.planned_completed_at).toBeNull(); // cleared once actually completed
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
