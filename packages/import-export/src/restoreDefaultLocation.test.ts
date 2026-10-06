import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import type { TrainingLocation } from '@atlas/data-model';
import { exportBackup } from './exportBackup';
import { restoreBackup } from './restoreBackup';

function place(id: string, name: string, isDefault: boolean): TrainingLocation {
  return {
    id,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    version: 1,
    device_id: 'test',
    deleted_at: null,
    name,
    equipment: [],
    note: null,
    is_default: isDefault,
  };
}

const fresh = () => new IndexedDbAdapter(`atlas-restore-default-${crypto.randomUUID()}`);

describe('restoring a backup never leaves two default places', () => {
  it('the restored default wins over a default the install already had', async () => {
    const source = fresh();
    await source.trainingLocations.putMany([
      place('main', 'Main Gym', true),
      place('home', 'Home', false),
    ]);
    const backup = await exportBackup(source);

    const target = fresh();
    await target.trainingLocations.put(place('garage', 'Garage Gym', true));
    await restoreBackup(backup, target);

    const defaults = (await target.trainingLocations.getAll()).filter((l) => l.is_default);
    expect(defaults.map((l) => l.id)).toEqual(['main']);
    expect((await target.trainingLocations.getAll()).map((l) => l.id).sort()).toEqual([
      'garage',
      'home',
      'main',
    ]);
  });

  it('a backup with no default leaves the install default alone', async () => {
    const source = fresh();
    await source.trainingLocations.put(place('home', 'Home', false));
    const backup = await exportBackup(source);

    const target = fresh();
    await target.trainingLocations.put(place('garage', 'Garage Gym', true));
    await restoreBackup(backup, target);

    expect(
      (await target.trainingLocations.getAll()).filter((l) => l.is_default).map((l) => l.id),
    ).toEqual(['garage']);
  });
});
