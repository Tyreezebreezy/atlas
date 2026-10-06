import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { readLegacyEquipmentProfiles } from '../settings/settings';
import { migrateLegacyEquipmentProfiles } from './legacyProfiles';

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

const fresh = () => new IndexedDbAdapter(`atlas-legacy-${crypto.randomUUID()}`);

const legacy = (extra: object = {}) =>
  JSON.stringify({
    timerSoundEnabled: false,
    equipmentProfiles: [
      { id: 'p-home', name: 'Home', equipment: ['barbell', 'bench'] },
      { id: 'p-gym', name: 'Regular Gym', equipment: ['cable', 'dumbbell'] },
    ],
    activeEquipmentProfileId: 'p-gym',
    ...extra,
  });

describe('migrating pre-v1.0.0 device-local equipment profiles', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('turns each profile into a place with the same id and name, keeping its equipment as the legacy strings', async () => {
    stubLocalStorage({ 'atlas-settings': legacy() });
    const storage = fresh();
    expect(await migrateLegacyEquipmentProfiles(storage)).toBe(true);
    const places = await storage.trainingLocations.getAll();
    expect(places.map((p) => [p.id, p.name, p.equipment]).sort()).toEqual([
      ['p-gym', 'Regular Gym', ['cable', 'dumbbell']],
      ['p-home', 'Home', ['barbell', 'bench']],
    ]);
  });

  it('the profile that was active becomes the default place -- and only that one', async () => {
    stubLocalStorage({ 'atlas-settings': legacy() });
    const storage = fresh();
    await migrateLegacyEquipmentProfiles(storage);
    const places = await storage.trainingLocations.getAll();
    expect(places.filter((p) => p.is_default).map((p) => p.id)).toEqual(['p-gym']);
  });

  it('clears the old fields but leaves every other setting alone', async () => {
    const store = stubLocalStorage({ 'atlas-settings': legacy() });
    await migrateLegacyEquipmentProfiles(fresh());
    expect(readLegacyEquipmentProfiles()).toEqual({ profiles: [], activeId: null });
    expect(JSON.parse(store.get('atlas-settings') ?? '{}')).toEqual({ timerSoundEnabled: false });
  });

  it('is a no-op the second time, and when there is nothing to migrate', async () => {
    stubLocalStorage({ 'atlas-settings': legacy() });
    const storage = fresh();
    await migrateLegacyEquipmentProfiles(storage);
    expect(await migrateLegacyEquipmentProfiles(storage)).toBe(false);
    expect(await storage.trainingLocations.getAll()).toHaveLength(2);

    stubLocalStorage();
    expect(await migrateLegacyEquipmentProfiles(fresh())).toBe(false);
  });

  it('never overwrites a place that already exists as a TrainingLocation', async () => {
    stubLocalStorage({ 'atlas-settings': legacy() });
    const storage = fresh();
    await storage.trainingLocations.put({
      id: 'p-home',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      version: 4,
      device_id: 'd',
      deleted_at: null,
      name: 'Renamed Home',
      equipment: [],
      note: 'kept',
    });
    await migrateLegacyEquipmentProfiles(storage);
    expect(await storage.trainingLocations.get('p-home')).toMatchObject({
      name: 'Renamed Home',
      note: 'kept',
      version: 4,
    });
  });
});
