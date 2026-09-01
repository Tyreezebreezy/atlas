import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createProgram, createProgramDay, createProgramWeek } from '@atlas/program-engine';
import { IndexedDbAdapter } from '@atlas/storage';
import { createPlannedExercise, createWorkoutTemplate } from '@atlas/workout-engine';
import { exportProgram } from './exportProgram';

async function seededStorage() {
  const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
  await storage.exercises.put({
    id: 'ex-squat',
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Back Squat',
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
  return storage;
}

describe('exportProgram', () => {
  it("inlines each day's workout content rather than exporting a bare template_id", async () => {
    const storage = await seededStorage();
    const template = {
      ...createWorkoutTemplate('Lower', false),
      exercises: [
        {
          ...createPlannedExercise('ex-squat', 1),
          target_sets: 5,
          target_reps_min: 5,
          target_reps_max: 5,
        },
      ],
    };
    await storage.workoutTemplates.put(template);
    const week = {
      ...createProgramWeek(1, 'Week 1'),
      days: [createProgramDay(1, 'Monday', template.id)],
    };
    const program = { ...createProgram('Strength', null), weeks: [week] };
    await storage.programs.put(program);

    const doc = await exportProgram(program.id, storage);

    expect(doc.kind).toBe('program');
    expect(doc.program.weeks).toHaveLength(1);
    expect(doc.program.weeks[0]?.days[0]).toMatchObject({ label: 'Monday' });
    expect(doc.program.weeks[0]?.days[0]?.workout.exercises[0]).toMatchObject({
      exercise_name: 'Back Squat',
      target_sets: 5,
    });
  });

  it('skips a day whose template was deleted rather than failing the whole export', async () => {
    const storage = await seededStorage();
    const week = {
      ...createProgramWeek(1, null),
      days: [createProgramDay(1, 'Monday', 'missing-template')],
    };
    const program = { ...createProgram('Strength', null), weeks: [week] };
    await storage.programs.put(program);

    const doc = await exportProgram(program.id, storage);

    expect(doc.program.weeks[0]?.days).toEqual([]);
  });
});
