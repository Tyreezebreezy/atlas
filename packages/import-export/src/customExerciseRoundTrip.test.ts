import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter, type AtlasStorage } from '@atlas/storage';
import {
  createCustomExercise,
  ensureExercisesSeeded,
  searchExercises,
} from '@atlas/exercise-library';
import { addExerciseToTemplate, createWorkoutTemplate } from '@atlas/workout-engine';
import { createProgram } from '@atlas/program-engine';
import type { Exercise, ExerciseAlias, Program } from '@atlas/data-model';
import { exportBackup } from './exportBackup';
import { restoreBackup } from './restoreBackup';
import { validateAtlasPlan } from './validateAtlasPlan';
import type { AtlasBackupDocument } from './types';

const fresh = () => new IndexedDbAdapter(`atlas-custom-${crypto.randomUUID()}`);

/** Export -> real JSON text -> strict validation, exactly as the app's export file and the restore wizard do. */
async function throughJson(source: AtlasStorage): Promise<AtlasBackupDocument> {
  const validated = validateAtlasPlan(JSON.parse(JSON.stringify(await exportBackup(source))));
  if (!validated.valid || validated.value.kind !== 'backup')
    throw new Error('a fresh export must validate');
  return validated.value;
}

/**
 * Acceptance pass. The owner's own exercises are the one thing a reseed can never bring back: a restore onto a clean
 * install must return each with the same id, its structured muscle mapping and metadata, the program that references
 * it must still resolve it, and the Library must find it. A favorited canonical exercise is user state too.
 */
describe('a custom exercise survives backup and restore into a clean install', () => {
  it('keeps its id, mapping, metadata, aliases, notes and favorite; programs still resolve it; the Library finds it', async () => {
    const source = fresh();
    await ensureExercisesSeeded(source);

    const custom: Exercise = {
      ...createCustomExercise({
        name: 'Landmine Press -- Half Kneeling (Left / Right) With A Deliberately Very Long Name To Wrap',
        category: 'shoulders',
        equipment: ['landmine', 'barbell'],
        targetMuscle: 'delts',
        secondaryMuscles: ['triceps'],
        instructions: ['Kneel on one knee.', 'Press the bar up and slightly forward.'],
        measurementType: 'reps_weight',
        muscleMap: {
          primary: ['shoulders.anterior', 'chest.upper'],
          secondary: ['arms.triceps'],
          provenance: 'user',
          taxonomy_version: '1.0.0',
        },
      }),
      aliases: ['Half-kneeling landmine press', 'Landmine OHP'],
      user_notes: 'Keep the ribs down',
      is_favorite: true,
      default_rest_seconds: 120,
    };
    await source.exercises.put(custom);
    const canonical = (await source.exercises.getAll()).find((e) => !e.is_custom)!;
    await source.exercises.put({ ...canonical, is_favorite: true });
    const alias: ExerciseAlias = {
      id: crypto.randomUUID(),
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      version: 1,
      device_id: 'phone',
      deleted_at: null,
      exercise_id: custom.id,
      normalized_alias: 'landmine ohp',
      display_alias: 'Landmine OHP',
      source: 'user',
    };
    await source.exerciseAliases.put(alias);

    const template = addExerciseToTemplate(createWorkoutTemplate('Push A', false), custom.id);
    await source.workoutTemplates.put(template);
    const program: Program = {
      ...createProgram('Press block', null),
      weeks: [
        {
          id: 'w1',
          order: 0,
          label: null,
          days: [{ id: 'd1', order: 0, label: 'Monday', template_id: template.id }],
        },
      ],
    };
    await source.programs.put(program);

    const backup = await throughJson(source);

    // A clean install: the app's own startup seeds the catalog, then the backup lands.
    const target = fresh();
    await ensureExercisesSeeded(target);
    await restoreBackup(backup, target);

    const restored = await target.exercises.get(custom.id);
    expect(restored).toEqual(custom); // same id, every field: mapping, aliases, notes, rest, favorite, equipment
    expect(restored?.muscle_map).toEqual(custom.muscle_map);
    expect(await target.exerciseAliases.getAll()).toEqual([alias]);

    // program -> day -> template -> exercise still resolves to the very same row
    const restoredProgram = (await target.programs.getAll())[0]!;
    const restoredTemplate = await target.workoutTemplates.get(
      restoredProgram.weeks[0]!.days[0]!.template_id,
    );
    expect(restoredTemplate?.exercises.map((e) => e.exercise_id)).toEqual([custom.id]);
    expect(await target.exercises.get(restoredTemplate!.exercises[0]!.exercise_id)).toEqual(custom);

    // the Library's own search finds it, once, by its name
    const all = await target.exercises.getAll();
    expect(
      searchExercises(all, { query: 'landmine press' }).filter((e) => e.id === custom.id),
    ).toHaveLength(1);

    // the favorited canonical exercise kept its star, and the catalog beside it is whole
    expect((await target.exercises.get(canonical.id))?.is_favorite).toBe(true);
    expect(all).toHaveLength((await source.exercises.getAll()).length);
  });

  it('a second restore of the same backup changes nothing (no duplicate custom exercise)', async () => {
    const source = fresh();
    await ensureExercisesSeeded(source);
    const custom = createCustomExercise({
      name: 'Sandbag Carry',
      category: null,
      equipment: [],
      targetMuscle: null,
      secondaryMuscles: [],
      instructions: [],
      measurementType: 'reps_weight',
    });
    await source.exercises.put(custom);
    const backup = await throughJson(source);

    const target = fresh();
    await ensureExercisesSeeded(target);
    await restoreBackup(backup, target);
    const once = (await target.exercises.getAll()).length;
    await restoreBackup(backup, target);

    expect((await target.exercises.getAll()).length).toBe(once);
    expect(
      (await target.exercises.getAll()).filter((e) => e.name === 'Sandbag Carry'),
    ).toHaveLength(1);
  });
});
