import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import {
  availableLoads,
  effectiveExerciseEquipment,
  EMPTY_LOAD_DRAFT,
  hasEquipmentData,
  isAtEquipmentMax,
  legacyEquipmentToConfigure,
  matchesExerciseEquipment,
  OTHER_EQUIPMENT_TYPE,
  preselectedLocationId,
  resolveExerciseEquipment,
  type LoadConfigDraft,
} from '@atlas/equipment-engine';
import { setExerciseEquipment, startWorkoutSession } from '@atlas/workout-engine';
import {
  addLocation,
  archiveEquipment,
  archiveLocationById,
  confirmMaximum,
  declineMaximum,
  deleteUnusedEquipment,
  deleteUnusedLocation,
  equipmentChoicesFor,
  loadGymsData,
  makeDefaultLocation,
  rememberEquipmentChoice,
  restoreEquipment,
  restoreLocationById,
  saveEquipment,
  saveLocationDetails,
  type GymsData,
  type SaveEquipmentInput,
} from './equipmentActions';

const fresh = () => new IndexedDbAdapter(`atlas-gyms-${crypto.randomUUID()}`);
const draft = (patch: Partial<LoadConfigDraft>): LoadConfigDraft => ({
  ...EMPTY_LOAD_DRAFT,
  ...patch,
});

async function place(storage: IndexedDbAdapter, name: string) {
  const data = await loadGymsData(storage);
  const result = await addLocation(storage, name, data.locations);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function equipmentInput(
  locationId: string,
  over: Partial<SaveEquipmentInput> = {},
): SaveEquipmentInput {
  return {
    locationId,
    instanceId: null,
    label: 'Chest Press #1',
    type: 'leverage machine',
    otherName: '',
    loads: draft({}),
    notes: '',
    ...over,
  };
}

async function addEquipment(
  storage: IndexedDbAdapter,
  locationId: string,
  over: Partial<SaveEquipmentInput> = {},
) {
  const result = await saveEquipment(
    storage,
    await loadGymsData(storage),
    equipmentInput(locationId, over),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.instance;
}

describe('creating locations', () => {
  it('needs only a name -- a place with nothing configured is valid and usable', async () => {
    const storage = fresh();
    const main = await place(storage, '  Main Gym ');
    expect(main).toMatchObject({ name: 'Main Gym', equipment: [], deleted_at: null });
    expect((await loadGymsData(storage)).locations).toHaveLength(1);
  });

  it('the first place becomes the default; a second does not take it over', async () => {
    const storage = fresh();
    const first = await place(storage, 'Main Gym');
    const second = await place(storage, 'Home');
    expect(first.is_default).toBe(true);
    expect(second.is_default).toBeUndefined();
    const { locations } = await loadGymsData(storage);
    expect(locations.filter((l) => l.is_default).map((l) => l.name)).toEqual(['Main Gym']);
  });

  it('refuses a blank or duplicate name, saying why', async () => {
    const storage = fresh();
    await place(storage, 'Main Gym');
    const data = await loadGymsData(storage);
    expect(await addLocation(storage, '   ', data.locations)).toMatchObject({ ok: false });
    const dup = await addLocation(storage, 'main gym', data.locations);
    expect(dup.ok).toBe(false);
    expect((await loadGymsData(storage)).locations).toHaveLength(1);
  });

  it('renaming keeps everything else and refuses a clash with another place', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    await place(storage, 'Home');
    const data = await loadGymsData(storage);
    expect(
      (
        await saveLocationDetails(
          storage,
          main,
          { name: 'Main Gym', note: 'open 24h' },
          data.locations,
        )
      ).ok,
    ).toBe(true);
    expect((await storage.trainingLocations.get(main.id))?.note).toBe('open 24h');
    expect(
      (await saveLocationDetails(storage, main, { name: 'home', note: '' }, data.locations)).ok,
    ).toBe(false);
  });
});

describe('the default location', () => {
  it('changing it leaves exactly one default in storage', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const home = await place(storage, 'Home');
    await makeDefaultLocation(storage, (await loadGymsData(storage)).locations, home.id);
    const { locations } = await loadGymsData(storage);
    expect(locations.filter((l) => l.is_default).map((l) => l.id)).toEqual([home.id]);
    expect(locations.find((l) => l.id === main.id)?.is_default).toBe(false);
  });

  it('survives a reload of the data -- it is stored on the place, not in device settings', async () => {
    const storage = fresh();
    await place(storage, 'Main Gym');
    const home = await place(storage, 'Home');
    await makeDefaultLocation(storage, (await loadGymsData(storage)).locations, home.id);
    const reloaded = await loadGymsData(storage);
    expect(preselectedLocationId(reloaded.locations, [])).toBe(home.id);
  });
});

describe('archiving and deleting locations', () => {
  it('an archived place disappears from the choices but still resolves for history', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const home = await place(storage, 'Home');
    await archiveLocationById(storage, main);
    const { locations } = await loadGymsData(storage);
    expect(locations).toHaveLength(2); // getAll still returns it: history keeps resolving its name
    expect(locations.find((l) => l.id === main.id)).toMatchObject({
      name: 'Main Gym',
      is_default: false,
    });
    expect(preselectedLocationId(locations, [])).toBe(home.id); // the only active place
    expect((await storage.trainingLocations.get(main.id))?.archived_at).toBeTruthy();
  });

  it('can be restored', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    await archiveLocationById(storage, main);
    await restoreLocationById(storage, (await loadGymsData(storage)).locations[0]!);
    expect((await storage.trainingLocations.get(main.id))?.archived_at).toBeNull();
  });

  it('a place with a workout or equipment cannot be deleted -- only archived', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    await addEquipment(storage, main.id);
    const data = await loadGymsData(storage);
    const refused = await deleteUnusedLocation(storage, main, [], data.instances);
    expect(refused.ok).toBe(false);

    const session = startWorkoutSession({
      name: 'W',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
      trainingLocationId: main.id,
    });
    expect((await deleteUnusedLocation(storage, main, [session], [])).ok).toBe(false);
    expect((await loadGymsData(storage)).locations).toHaveLength(1);
  });

  it('an empty, never-used place can be deleted (a tombstone, like every delete)', async () => {
    const storage = fresh();
    const stray = await place(storage, 'Typo Gym');
    expect((await deleteUnusedLocation(storage, stray, [], [])).ok).toBe(true);
    expect((await loadGymsData(storage)).locations).toEqual([]);
    expect((await storage.trainingLocations.get(stray.id))?.deleted_at).toBeTruthy();
  });
});

describe('configuring equipment', () => {
  it('saves an exact, nonuniform list and reads it back as exactly those loads', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const rack = await addEquipment(storage, main.id, {
      label: 'Dumbbells',
      type: 'dumbbell',
      loads: draft({ mode: 'exact', exact: '10, 15, 20, 25, 30, 40, 50' }),
    });
    expect(availableLoads(rack)).toEqual([10, 15, 20, 25, 30, 40, 50]);
    expect((await storage.gymEquipment.get(rack.id))?.exact_loads).toEqual([
      10, 15, 20, 25, 30, 40, 50,
    ]);
  });

  it('saves a range with an increment, and a maximum on its own without inventing loads', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const range = await addEquipment(storage, main.id, {
      label: 'Press',
      loads: draft({ mode: 'range', min: '20', max: '170', increment: '10' }),
    });
    expect(availableLoads(range)).toHaveLength(16);
    const maxOnly = await addEquipment(storage, main.id, {
      label: 'Stack',
      loads: draft({ mode: 'max', max: '170' }),
    });
    expect(availableLoads(maxOnly)).toEqual([]);
    expect(isAtEquipmentMax(maxOnly, 170)).toBe(true);
    expect(maxOnly.exact_loads).toBeNull();
    expect(maxOnly.increment).toBeNull();
  });

  it('saves unknown loads: equipment with no data is allowed and claims no maximum', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const bare = await addEquipment(storage, main.id, {
      label: 'Mystery machine',
      loads: draft({ mode: 'unknown' }),
    });
    expect(hasEquipmentData(bare)).toBe(false);
  });

  it('two machines at one place are two rows; the same label at another place is fine', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const hotel = await place(storage, 'Hotel');
    const a = await addEquipment(storage, main.id, { label: 'Chest Press #1' });
    const b = await addEquipment(storage, main.id, { label: 'Chest Press #2' });
    const c = await addEquipment(storage, hotel.id, { label: 'Chest Press #1' });
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    const dup = await saveEquipment(
      storage,
      await loadGymsData(storage),
      equipmentInput(main.id, { label: 'chest press #1' }),
    );
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.errors.label).toBeTruthy();
  });

  it('reports every problem on its own field, and writes nothing', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const result = await saveEquipment(
      storage,
      await loadGymsData(storage),
      equipmentInput(main.id, {
        label: '',
        type: OTHER_EQUIPMENT_TYPE,
        otherName: '',
        loads: draft({ mode: 'range', min: '', max: '', increment: '' }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.label).toBeTruthy();
      expect(result.errors.otherName).toBeTruthy();
      expect(Object.keys(result.errors.loads ?? {}).sort()).toEqual(['increment', 'max', 'min']);
    }
    expect((await loadGymsData(storage)).instances).toEqual([]);
    expect((await loadGymsData(storage)).definitions).toEqual([]);
  });

  it('a missing kind is reported together with the other problems, and nothing is created', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const result = await saveEquipment(
      storage,
      await loadGymsData(storage),
      equipmentInput(main.id, { label: '', type: '' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.label).toBeTruthy();
      expect(result.errors.type).toBeTruthy();
    }
    expect((await loadGymsData(storage)).definitions).toEqual([]); // no junk "empty kind" definition
  });

  it('shares one definition per kind across instances and places', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const hotel = await place(storage, 'Hotel');
    await addEquipment(storage, main.id, { label: 'Rack', type: 'dumbbell' });
    await addEquipment(storage, hotel.id, { label: 'Dumbbells', type: 'dumbbell' });
    await addEquipment(storage, main.id, {
      label: 'Pec deck',
      type: OTHER_EQUIPMENT_TYPE,
      otherName: 'Pec deck',
    });
    const { definitions } = await loadGymsData(storage);
    expect(definitions.map((d) => d.type).sort()).toEqual(['dumbbell', OTHER_EQUIPMENT_TYPE]);
  });

  it('editing replaces the load configuration outright', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const rack = await addEquipment(storage, main.id, {
      label: 'Rack',
      type: 'dumbbell',
      loads: draft({ mode: 'exact', exact: '5 10 80' }),
    });
    const result = await saveEquipment(
      storage,
      await loadGymsData(storage),
      equipmentInput(main.id, {
        instanceId: rack.id,
        label: 'Rack',
        type: 'dumbbell',
        loads: draft({ mode: 'range', min: '10', max: '100', increment: '10' }),
      }),
    );
    expect(result.ok).toBe(true);
    const saved = await storage.gymEquipment.get(rack.id);
    expect(saved).toMatchObject({
      exact_loads: null,
      min_load: 10,
      max_load: 100,
      increment: 10,
      version: rack.version + 1,
    });
  });

  it('an archived machine is hidden from choices but kept, and can be restored', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const press = await addEquipment(storage, main.id);
    await archiveEquipment(storage, press);
    let data = await loadGymsData(storage);
    expect(equipmentChoicesFor(data, main.id, () => true)).toEqual({ matching: [], other: [] });
    expect(data.instances).toHaveLength(1); // still resolvable
    await restoreEquipment(storage, data.instances[0]!);
    data = await loadGymsData(storage);
    expect(equipmentChoicesFor(data, main.id, () => true).matching).toHaveLength(1);
  });
});

describe('legacy equipment reconciliation', () => {
  async function legacyPlace(storage: IndexedDbAdapter) {
    const main = await place(storage, 'Main Gym');
    await storage.trainingLocations.put({
      ...main,
      equipment: ['Chest press', 'Dumbbells', 'Cable machine'],
    });
    return main;
  }

  it('configuring one legacy item removes only that item from the list, and never duplicates it', async () => {
    const storage = fresh();
    const main = await legacyPlace(storage);
    const before = await loadGymsData(storage);
    expect(
      legacyEquipmentToConfigure(before.locations[0]!, before.instances, before.definitions),
    ).toEqual(['Chest press', 'Dumbbells', 'Cable machine']);

    const first = await saveEquipment(
      storage,
      before,
      equipmentInput(main.id, { label: 'Chest Press #1', legacyEquipment: 'Chest press' }),
    );
    expect(first).toMatchObject({ ok: true, created: true });

    const after = await loadGymsData(storage);
    expect(
      legacyEquipmentToConfigure(after.locations[0]!, after.instances, after.definitions),
    ).toEqual(['Dumbbells', 'Cable machine']);

    // Pressing Configure again (a double tap, a second device) returns the same instance.
    const again = await saveEquipment(
      storage,
      after,
      equipmentInput(main.id, { label: 'Another name', legacyEquipment: 'Chest press' }),
    );
    expect(again).toMatchObject({ ok: true, created: false });
    expect((await loadGymsData(storage)).instances).toHaveLength(1);
  });

  it('leaves the legacy strings untouched and invents no loads', async () => {
    const storage = fresh();
    const main = await legacyPlace(storage);
    const result = await saveEquipment(
      storage,
      await loadGymsData(storage),
      equipmentInput(main.id, {
        label: 'Cable machine',
        type: 'cable',
        legacyEquipment: 'Cable machine',
      }),
    );
    if (!result.ok) throw new Error('should save');
    expect(result.instance).toMatchObject({
      exact_loads: null,
      min_load: null,
      max_load: null,
      increment: null,
      legacy_equipment: 'Cable machine',
    });
    expect((await storage.trainingLocations.get(main.id))?.equipment).toEqual([
      'Chest press',
      'Dumbbells',
      'Cable machine',
    ]);
  });
});

describe('remembering which machine an exercise is on', () => {
  it('the same exercise maps to a different machine at each place, and each resolves at its own place', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const hotel = await place(storage, 'Hotel');
    const mainPress = await addEquipment(storage, main.id, {
      label: 'Chest Press #1',
      loads: draft({ mode: 'max', max: '170' }),
    });
    const hotelPress = await addEquipment(storage, hotel.id, {
      label: 'Hotel press',
      loads: draft({ mode: 'max', max: '120' }),
    });

    let data = await loadGymsData(storage);
    await rememberEquipmentChoice(storage, data, 'ex-press', mainPress);
    data = await loadGymsData(storage);
    await rememberEquipmentChoice(storage, data, 'ex-press', hotelPress);
    data = await loadGymsData(storage);

    expect(resolveExerciseEquipment('ex-press', data.contexts, data.instances, main.id)?.id).toBe(
      mainPress.id,
    );
    expect(resolveExerciseEquipment('ex-press', data.contexts, data.instances, hotel.id)?.id).toBe(
      hotelPress.id,
    );
  });

  it('choosing another machine at the same place moves the default; two machines never both stay default', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const one = await addEquipment(storage, main.id, { label: 'Chest Press #1' });
    const two = await addEquipment(storage, main.id, { label: 'Chest Press #2' });
    await rememberEquipmentChoice(storage, await loadGymsData(storage), 'ex-press', one);
    await rememberEquipmentChoice(storage, await loadGymsData(storage), 'ex-press', two);
    const data = await loadGymsData(storage);
    expect(data.contexts.filter((c) => c.is_default).map((c) => c.gym_equipment_id)).toEqual([
      two.id,
    ]);
    expect(data.contexts).toHaveLength(2);
  });

  it('the remembered machine is reused for the next workout without asking, and a workout choice wins over it', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const one = await addEquipment(storage, main.id, { label: 'Chest Press #1' });
    const two = await addEquipment(storage, main.id, { label: 'Chest Press #2' });
    await rememberEquipmentChoice(storage, await loadGymsData(storage), 'ex-press', one);
    const data = await loadGymsData(storage);

    const next = startWorkoutSession({
      name: 'W',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
      trainingLocationId: main.id,
    });
    expect(
      effectiveExerciseEquipment(next, 'ex-press', data.contexts, data.instances),
    ).toMatchObject({ source: 'remembered' });
    const chosen = setExerciseEquipment(next, 'ex-press', two.id);
    expect(
      effectiveExerciseEquipment(chosen, 'ex-press', data.contexts, data.instances).instance?.id,
    ).toBe(two.id);
  });

  it('with two candidate machines and nothing remembered, nothing is chosen for the owner', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    await addEquipment(storage, main.id, { label: 'Chest Press #1' });
    await addEquipment(storage, main.id, { label: 'Chest Press #2' });
    const data = await loadGymsData(storage);
    const session = startWorkoutSession({
      name: 'W',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
      trainingLocationId: main.id,
    });
    expect(
      effectiveExerciseEquipment(session, 'ex-press', data.contexts, data.instances).source,
    ).toBe('none');
    expect(equipmentChoicesFor(data, main.id, () => true).matching).toHaveLength(2);
  });
});

describe('equipment choices for an exercise', () => {
  it('offers the kinds the exercise calls for as the answer, and keeps everything else at the place one step away', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const hotel = await place(storage, 'Hotel');
    const cable = await addEquipment(storage, main.id, { label: 'Cable Stack A', type: 'cable' });
    const rack = await addEquipment(storage, main.id, { label: 'Dumbbells', type: 'dumbbell' });
    await addEquipment(storage, hotel.id, { label: 'Hotel dumbbells', type: 'dumbbell' });
    const data = await loadGymsData(storage);
    const typeById = new Map(data.definitions.map((d) => [d.id, d.type]));
    const wantsDumbbell = (type: string) =>
      matchesExerciseEquipment(type, { equipment: ['dumbbell'] });
    const choices = equipmentChoicesFor(data, main.id, wantsDumbbell);
    expect(choices.matching.map((i) => i.label)).toEqual(['Dumbbells']);
    expect(choices.other.map((i) => i.label)).toEqual(['Cable Stack A']);
    expect(typeById.get(choices.matching[0]!.equipment_definition_id)).toBe('dumbbell');
    expect([choices.matching[0]?.id, choices.other[0]?.id]).toEqual([rack.id, cable.id]);
    expect(equipmentChoicesFor(data, null, wantsDumbbell)).toEqual({ matching: [], other: [] });
  });
});

describe('the one-time maximum question', () => {
  it('"yes" records the maximum; "no / not sure" is recorded and changes nothing else', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const a = await addEquipment(storage, main.id, { label: 'Press A' });
    const b = await addEquipment(storage, main.id, { label: 'Press B' });

    const confirmed = await confirmMaximum(storage, a, 170);
    expect((await storage.gymEquipment.get(a.id))?.max_load).toBe(170);
    expect(isAtEquipmentMax(confirmed, 170)).toBe(true);

    const dismissed = await declineMaximum(storage, b);
    const saved = await storage.gymEquipment.get(b.id);
    expect(saved?.max_prompt_dismissed_at).toBeTruthy();
    expect(saved?.max_load).toBeNull();
    expect(dismissed.version).toBe(b.version + 1);
  });
});

describe('deleting equipment', () => {
  it('equipment a workout used can only be archived', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const press = await addEquipment(storage, main.id);
    const session = setExerciseEquipment(
      startWorkoutSession({
        name: 'W',
        templateId: null,
        programId: null,
        programDayId: null,
        plannedSnapshot: [],
        trainingLocationId: main.id,
      }),
      'ex-press',
      press.id,
    );
    expect((await deleteUnusedEquipment(storage, press, [session], [])).ok).toBe(false);
    expect((await loadGymsData(storage)).instances).toHaveLength(1);
  });

  it('never-used equipment can be deleted along with the remembered mappings that pointed at it', async () => {
    const storage = fresh();
    const main = await place(storage, 'Main Gym');
    const press = await addEquipment(storage, main.id);
    await rememberEquipmentChoice(storage, await loadGymsData(storage), 'ex-press', press);
    const data: GymsData = await loadGymsData(storage);
    expect((await deleteUnusedEquipment(storage, press, [], data.contexts)).ok).toBe(true);
    const after = await loadGymsData(storage);
    expect(after.instances).toEqual([]);
    expect(after.contexts).toEqual([]);
  });
});
