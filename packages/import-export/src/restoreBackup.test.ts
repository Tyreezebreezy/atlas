import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { createCustomExercise } from '@atlas/exercise-library';
import { createPlannedExercise, createWorkoutTemplate } from '@atlas/workout-engine';
import { createProgram } from '@atlas/program-engine';
import { exportBackup } from './exportBackup';
import { restoreBackup } from './restoreBackup';
import { validateAtlasPlan } from './validateAtlasPlan';

describe('restoreBackup round trip', () => {
  it('restores a populated backup into a clean database with key historical data intact', async () => {
    const source = new IndexedDbAdapter(`atlas-test-source-${crypto.randomUUID()}`);

    const customExercise = createCustomExercise({
      name: 'Sled Push',
      category: 'legs',
      equipment: ['sled'],
      targetMuscle: 'quads',
      secondaryMuscles: [],
      instructions: [],
      measurementType: 'distance',
    });
    await source.exercises.put(customExercise);

    const template = {
      ...createWorkoutTemplate('Conditioning', false),
      exercises: [{ ...createPlannedExercise(customExercise.id, 1), target_distance_meters: 40 }],
    };
    await source.workoutTemplates.put(template);

    const program = { ...createProgram('Conditioning Block', 'Sled focus'), is_active: true };
    await source.programs.put(program);

    await source.bodyMeasurements.put({
      id: 'body-1',
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
      version: 1,
      device_id: 'seed',
      deleted_at: null,
      date: '2026-08-31',
      weight: 181.4,
      body_fat_percentage: null,
      fat_mass: null,
      lean_mass: null,
      muscle_mass: null,
      water_percentage: null,
      visceral_fat: null,
      bone_mass: null,
      bmr: null,
      source: null,
      notes: null,
    });

    await source.personalRecords.put({
      id: 'pr-1',
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
      version: 1,
      device_id: 'seed',
      deleted_at: null,
      exercise_id: customExercise.id,
      kind: 'distance',
      value: 40,
      reps: null,
      achieved_at: '2026-08-31T00:00:00.000Z',
      source_session_id: 'session-1',
      source_set_id: 'set-1',
    });

    // -- export, validate as if it had round-tripped through a real file --
    const exported = await exportBackup(source);
    const reparsed: unknown = JSON.parse(JSON.stringify(exported));
    const validated = validateAtlasPlan(reparsed);
    expect(validated.valid).toBe(true);
    if (!validated.valid || validated.value.kind !== 'backup')
      throw new Error('expected a valid backup');

    // -- restore into a genuinely separate, clean database --
    const target = new IndexedDbAdapter(`atlas-test-target-${crypto.randomUUID()}`);
    expect(await target.workoutTemplates.getAll()).toEqual([]);

    const result = await restoreBackup(validated.value, target);

    expect(result.restored_counts.workout_templates).toBe(1);
    expect(result.restored_counts.programs).toBe(1);
    expect(result.restored_counts.personal_records).toBe(1);
    expect(result.restored_counts.body_measurements).toBe(1);

    const restoredExercise = await target.exercises.get(customExercise.id);
    expect(restoredExercise?.name).toBe('Sled Push');
    expect(restoredExercise?.id).toBe(customExercise.id); // ID preserved, not regenerated

    const restoredTemplate = await target.workoutTemplates.get(template.id);
    expect(restoredTemplate?.exercises[0]?.target_distance_meters).toBe(40);

    const restoredProgram = await target.programs.get(program.id);
    expect(restoredProgram?.is_active).toBe(true);

    const restoredBody = await target.bodyMeasurements.get('body-1');
    expect(restoredBody?.weight).toBe(181.4);

    const restoredPr = await target.personalRecords.get('pr-1');
    expect(restoredPr?.value).toBe(40);
  });

  it('round-trips workout occurrences (v0.2.0)', async () => {
    const source = new IndexedDbAdapter(`atlas-test-source-${crypto.randomUUID()}`);
    await source.workoutOccurrences.put({
      id: 'occ-1',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      version: 1,
      device_id: 'seed',
      deleted_at: null,
      program_id: 'prog-1',
      program_day_id: 'day-1',
      original_date: '2026-09-01',
      effective_date: '2026-09-02',
      status: 'moved',
      replacement_template_id: null,
      session_id: null,
      notes: null,
    });

    const exported = await exportBackup(source);
    const reparsed: unknown = JSON.parse(JSON.stringify(exported));
    const validated = validateAtlasPlan(reparsed);
    expect(validated.valid).toBe(true);
    if (!validated.valid || validated.value.kind !== 'backup')
      throw new Error('expected a valid backup');

    const target = new IndexedDbAdapter(`atlas-test-target-${crypto.randomUUID()}`);
    const result = await restoreBackup(validated.value, target);
    expect(result.restored_counts.workout_occurrences).toBe(1);

    const restored = await target.workoutOccurrences.get('occ-1');
    expect(restored?.status).toBe('moved');
    expect(restored?.effective_date).toBe('2026-09-02');
  });

  it('restores a pre-v0.2.0 backup with no workout_occurrences key at all', async () => {
    // Simulates a real backup file exported before this entity existed --
    // `entities.workout_occurrences` is entirely absent, not an empty array.
    const legacyBackup = {
      format: 'atlas-plan-v1',
      kind: 'backup',
      exported_at: '2026-01-01T00:00:00.000Z',
      device_id: 'old-device',
      entities: {
        exercises: [],
        programs: [],
        workout_templates: [],
        workout_sessions: [],
        exercise_notes: [],
        program_notes: [],
        personal_records: [],
        milestones: [],
        body_measurements: [],
        // no workout_occurrences key
      },
    };
    const validated = validateAtlasPlan(legacyBackup);
    expect(validated.valid).toBe(true);
    if (!validated.valid || validated.value.kind !== 'backup')
      throw new Error('expected a valid backup');

    const target = new IndexedDbAdapter(`atlas-test-target-${crypto.randomUUID()}`);
    const result = await restoreBackup(validated.value, target);
    expect(result.restored_counts.workout_occurrences).toBe(0);
    expect(await target.workoutOccurrences.getAll()).toEqual([]);
  });
});
