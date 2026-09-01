import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import { createWorkoutTemplate } from './createWorkoutTemplate';
import { startWorkoutSession } from './session';
import { addExerciseToSession, addExerciseToTemplate } from './addExercise';

function makeSession() {
  return startWorkoutSession({
    name: 'Push Day',
    templateId: 't-1',
    programId: null,
    programDayId: null,
    plannedSnapshot: [createPlannedExercise('ex-1', 0)],
  });
}

describe('addExerciseToSession', () => {
  it('appends a new planned slot at the end, leaving existing ones untouched', () => {
    const session = addExerciseToSession(makeSession(), 'ex-2');
    expect(session.planned_snapshot).toHaveLength(2);
    expect(session.planned_snapshot[0]?.exercise_id).toBe('ex-1');
    expect(session.planned_snapshot[1]?.exercise_id).toBe('ex-2');
    expect(session.planned_snapshot[1]?.order).toBe(1);
  });

  it('bumps the session version', () => {
    const base = makeSession();
    const session = addExerciseToSession(base, 'ex-2');
    expect(session.version).toBe(base.version + 1);
  });

  it('does not mutate the original session object', () => {
    const base = makeSession();
    addExerciseToSession(base, 'ex-2');
    expect(base.planned_snapshot).toHaveLength(1);
  });
});

describe('addExerciseToTemplate', () => {
  it('appends a new planned exercise at the end', () => {
    const template = createWorkoutTemplate('Push Day', false);
    template.exercises = [createPlannedExercise('ex-1', 0)];

    const updated = addExerciseToTemplate(template, 'ex-2');
    expect(updated.exercises).toHaveLength(2);
    expect(updated.exercises[1]?.exercise_id).toBe('ex-2');
    expect(updated.version).toBe(template.version + 1);
  });

  it('does not mutate the original template object', () => {
    const template = createWorkoutTemplate('Push Day', false);
    template.exercises = [createPlannedExercise('ex-1', 0)];
    addExerciseToTemplate(template, 'ex-2');
    expect(template.exercises).toHaveLength(1);
  });
});
