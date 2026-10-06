import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { createCustomExercise } from '@atlas/exercise-library';
import { exportBackup } from './exportBackup';

function canonicalExercise(id: string, userNotes: string | null = null) {
  return {
    id,
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Deadlift',
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight' as const,
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: userNotes,
    enrichment: null,
  };
}

describe('exportBackup', () => {
  it('excludes an untouched canonical exercise but includes a custom one and a user-annotated canonical one', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    const custom = createCustomExercise({
      name: 'Garage Gym Special',
      category: null,
      equipment: [],
      targetMuscle: null,
      secondaryMuscles: [],
      instructions: [],
      measurementType: 'reps_weight',
    });
    await storage.exercises.putMany([
      canonicalExercise('ex-untouched'),
      canonicalExercise('ex-annotated', 'Feels better with a wider stance'),
      custom,
    ]);

    const doc = await exportBackup(storage);

    const exportedIds = doc.entities.exercises.map((e) => e.id);
    expect(exportedIds).not.toContain('ex-untouched');
    expect(exportedIds).toContain('ex-annotated');
    expect(exportedIds).toContain(custom.id);
  });

  it('keeps a favorited canonical exercise (the flag lives on its row; a reseed would not bring it back)', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await storage.exercises.putMany([
      { ...canonicalExercise('ex-favorite'), is_favorite: true },
      { ...canonicalExercise('ex-unfavorited'), is_favorite: false },
      canonicalExercise('ex-never-touched'),
    ]);

    const exportedIds = (await exportBackup(storage)).entities.exercises.map((e) => e.id);

    expect(exportedIds).toEqual(['ex-favorite']);
  });

  it('stamps the atlas-plan-v1 envelope on a backup document', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    const doc = await exportBackup(storage);
    expect(doc.format).toBe('atlas-plan-v1');
    expect(doc.kind).toBe('backup');
    expect(doc.device_id).toBeTruthy();
  });
});
