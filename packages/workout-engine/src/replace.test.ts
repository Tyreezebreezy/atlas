import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import { createWorkoutTemplate } from './createWorkoutTemplate';
import { addPerformedSet, createPerformedSet, startWorkoutSession } from './session';
import { applyExerciseReplacementToTemplate, replaceExercise } from './replace';

function makeSession() {
  return startWorkoutSession({
    name: 'Push Day',
    templateId: 't-1',
    programId: null,
    programDayId: null,
    plannedSnapshot: [createPlannedExercise('ex-1', 0), createPlannedExercise('ex-2', 1)],
  });
}

describe('replaceExercise', () => {
  it('swaps the exercise_id for the matching planned slot only, scope today', () => {
    const session = replaceExercise(makeSession(), 'ex-1', 'ex-1-alt', 'Shoulder pain', 'today');
    expect(session.planned_snapshot[0]?.exercise_id).toBe('ex-1-alt');
    expect(session.planned_snapshot[1]?.exercise_id).toBe('ex-2');
    expect(session.replacements).toEqual([
      {
        original_exercise_id: 'ex-1',
        replacement_exercise_id: 'ex-1-alt',
        reason: 'Shoulder pain',
        scope: 'today',
        replaced_at: expect.any(String),
      },
    ]);
  });

  it('preserves already-performed sets under the original exercise id', () => {
    let session = makeSession();
    const set = createPerformedSet({
      exerciseId: 'ex-1',
      setIndex: 0,
      setType: 'working',
      weight: 100,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
    });
    session = addPerformedSet(session, set);
    session = replaceExercise(session, 'ex-1', 'ex-1-alt', null, 'today');

    expect(session.performed_sets[0]?.exercise_id).toBe('ex-1');
    expect(session.planned_snapshot[0]?.exercise_id).toBe('ex-1-alt');
  });

  it('treats an empty reason as null', () => {
    const session = replaceExercise(makeSession(), 'ex-1', 'ex-1-alt', '', 'today');
    expect(session.replacements[0]?.reason).toBeNull();
  });

  it('records scope program the same as scope today at the session level', () => {
    const session = replaceExercise(makeSession(), 'ex-1', 'ex-1-alt', null, 'program');
    expect(session.replacements[0]?.scope).toBe('program');
    expect(session.planned_snapshot[0]?.exercise_id).toBe('ex-1-alt');
  });
});

describe('applyExerciseReplacementToTemplate', () => {
  it('updates only the matching exercise in the template', () => {
    const template = createWorkoutTemplate('Push Day', false);
    template.exercises = [createPlannedExercise('ex-1', 0), createPlannedExercise('ex-2', 1)];

    const updated = applyExerciseReplacementToTemplate(template, 'ex-1', 'ex-1-alt');
    expect(updated.exercises[0]?.exercise_id).toBe('ex-1-alt');
    expect(updated.exercises[1]?.exercise_id).toBe('ex-2');
    expect(updated.version).toBe(template.version + 1);
  });

  it('does not mutate the original template object', () => {
    const template = createWorkoutTemplate('Push Day', false);
    template.exercises = [createPlannedExercise('ex-1', 0)];
    applyExerciseReplacementToTemplate(template, 'ex-1', 'ex-1-alt');
    expect(template.exercises[0]?.exercise_id).toBe('ex-1');
  });
});
