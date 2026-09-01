import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { createPlannedExercise, createWorkoutTemplate } from '@atlas/workout-engine';
import { exportWorkout } from './exportWorkout';

describe('exportWorkout', () => {
  it('exports a template with the real exercise name as the portable fallback', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await storage.exercises.put({
      id: 'ex-row',
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
      version: 1,
      device_id: 'seed',
      deleted_at: null,
      name: 'Barbell Row',
      aliases: [],
      category: null,
      equipment: [],
      target_muscle: null,
      secondary_muscles: [],
      instructions: [],
      movement_pattern: null,
      is_unilateral: null,
      measurement_type: 'reps_weight',
      default_rest_seconds: null,
      is_custom: false,
      source: null,
      source_id: null,
      user_notes: null,
      enrichment: null,
    });
    const template = createWorkoutTemplate('Upper', false);
    const planned = {
      ...createPlannedExercise('ex-row', 1),
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 8,
    };
    await storage.workoutTemplates.put({ ...template, exercises: [planned] });

    const doc = await exportWorkout(template.id, storage);

    expect(doc.format).toBe('atlas-plan-v1');
    expect(doc.kind).toBe('workout');
    expect(doc.workout.exercises[0]).toMatchObject({
      exercise_id: 'ex-row',
      exercise_name: 'Barbell Row',
      target_sets: 4,
    });
  });

  it('throws a clear error for a nonexistent template id rather than returning something malformed', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await expect(exportWorkout('does-not-exist', storage)).rejects.toThrow();
  });
});
