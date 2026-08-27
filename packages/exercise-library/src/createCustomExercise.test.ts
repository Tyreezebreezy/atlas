import { describe, expect, it } from 'vitest';
import { createCustomExercise } from './createCustomExercise';

describe('createCustomExercise', () => {
  it('marks the exercise as custom with a user source', () => {
    const exercise = createCustomExercise({
      name: 'Garage Deadlift',
      category: 'back',
      equipment: ['barbell'],
      targetMuscle: 'lower back',
      secondaryMuscles: ['hamstrings'],
      instructions: ['Lift the bar.'],
      measurementType: 'reps_weight',
    });

    expect(exercise.is_custom).toBe(true);
    expect(exercise.source).toBe('user');
    expect(exercise.name).toBe('Garage Deadlift');
    expect(exercise.id).toBeTruthy();
  });
});
