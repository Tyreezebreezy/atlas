import { describe, expect, it } from 'vitest';
import { createPlannedExercise } from './createPlannedExercise';
import { createWorkoutTemplate, duplicateWorkoutTemplate } from './createWorkoutTemplate';

describe('duplicateWorkoutTemplate', () => {
  it('gives the copy a new id, new exercise ids, and a suffixed name', () => {
    const original = createWorkoutTemplate('Push Day', false);
    original.exercises.push(createPlannedExercise('ex-1', 0));

    const copy = duplicateWorkoutTemplate(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Push Day (Copy)');
    expect(copy.exercises[0]?.id).not.toBe(original.exercises[0]?.id);
    expect(copy.exercises[0]?.exercise_id).toBe('ex-1');
    expect(original.exercises).toHaveLength(1);
  });
});
