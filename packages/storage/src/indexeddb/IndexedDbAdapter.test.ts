import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { IndexedDbAdapter } from './IndexedDbAdapter';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: 'test-device',
    deleted_at: null,
    name: 'Bench Press',
    aliases: [],
    category: 'chest',
    equipment: ['barbell'],
    target_muscle: 'chest',
    secondary_muscles: ['triceps'],
    instructions: [],
    movement_pattern: 'horizontal_push',
    is_unilateral: false,
    measurement_type: 'reps_weight',
    default_rest_seconds: 120,
    is_custom: false,
    source: 'test',
    source_id: null,
    user_notes: null,
    enrichment: null,
    ...overrides,
  };
}

describe('IndexedDbAdapter', () => {
  let adapter: IndexedDbAdapter;

  beforeEach(() => {
    adapter = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
  });

  it('round-trips put/get', async () => {
    const exercise = makeExercise();
    await adapter.exercises.put(exercise);
    const fetched = await adapter.exercises.get(exercise.id);
    expect(fetched).toEqual(exercise);
  });

  it('excludes soft-deleted entities from getAll but keeps them gettable by id', async () => {
    const exercise = makeExercise();
    await adapter.exercises.put(exercise);
    await adapter.exercises.softDelete(exercise.id);

    expect(await adapter.exercises.getAll()).toHaveLength(0);

    const fetched = await adapter.exercises.get(exercise.id);
    expect(fetched?.deleted_at).not.toBeNull();
  });

  it('keeps repositories isolated from each other', async () => {
    await adapter.exercises.put(makeExercise());
    expect(await adapter.programs.getAll()).toHaveLength(0);
  });
});
