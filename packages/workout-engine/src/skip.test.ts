import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import { startWorkoutSession } from './session';
import { skipExerciseInSession, skipWorkoutSession, unskipExerciseInSession } from './skip';

function makeSession() {
  return startWorkoutSession({
    name: 'Push Day',
    templateId: 't-1',
    programId: null,
    programDayId: null,
    plannedSnapshot: [createPlannedExercise('ex-1', 0), createPlannedExercise('ex-2', 1)],
  });
}

describe('skipExerciseInSession / unskipExerciseInSession', () => {
  it('records an optional reason and leaves the planned slot untouched', () => {
    const session = makeSession();
    const skipped = skipExerciseInSession(session, 'ex-1', 'Shoulder tweak');
    expect(skipped.skipped_exercises).toEqual([
      { exercise_id: 'ex-1', reason: 'Shoulder tweak', skipped_at: expect.any(String) },
    ]);
    expect(skipped.planned_snapshot).toEqual(session.planned_snapshot);
  });

  it('treats an empty reason as null', () => {
    const skipped = skipExerciseInSession(makeSession(), 'ex-1', '');
    expect(skipped.skipped_exercises[0]?.reason).toBeNull();
  });

  it('does not duplicate a skip for the same exercise', () => {
    let session = skipExerciseInSession(makeSession(), 'ex-1', 'first');
    session = skipExerciseInSession(session, 'ex-1', 'second');
    expect(session.skipped_exercises).toHaveLength(1);
    expect(session.skipped_exercises[0]?.reason).toBe('first');
  });

  it('undo removes the skip so the exercise is loggable again', () => {
    let session = skipExerciseInSession(makeSession(), 'ex-1', null);
    session = unskipExerciseInSession(session, 'ex-1');
    expect(session.skipped_exercises).toEqual([]);
  });

  it('skipping one exercise does not affect others', () => {
    const session = skipExerciseInSession(makeSession(), 'ex-1', null);
    expect(session.skipped_exercises.some((s) => s.exercise_id === 'ex-2')).toBe(false);
  });
});

describe('skipWorkoutSession', () => {
  it('creates a skipped session preserving the planned snapshot, with no performed sets', () => {
    const planned = [createPlannedExercise('ex-1', 0)];
    const session = skipWorkoutSession({
      name: 'Leg Day',
      templateId: 't-1',
      programId: 'p-1',
      programDayId: 'd-1',
      plannedSnapshot: planned,
      reason: 'Traveling',
    });
    expect(session.status).toBe('skipped');
    expect(session.skip_reason).toBe('Traveling');
    expect(session.performed_sets).toEqual([]);
    expect(session.planned_snapshot).toEqual(planned);
    expect(session.template_id).toBe('t-1');
  });

  it('snapshots the plan by value -- editing the source array afterward does not change it', () => {
    const planned = [createPlannedExercise('ex-1', 0)];
    const session = skipWorkoutSession({
      name: 'Leg Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: planned,
      reason: null,
    });
    planned.push(createPlannedExercise('ex-2', 1));
    expect(session.planned_snapshot).toHaveLength(1);
  });
});
