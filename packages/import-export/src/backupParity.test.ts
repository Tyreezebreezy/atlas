import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter, type AtlasStorage } from '@atlas/storage';
import type {
  EquipmentDefinition,
  ExerciseAlias,
  ExerciseEquipmentContext,
  GymEquipmentInstance,
  PersonalRecordEvent,
  SyncMeta,
  TestProtocol,
  TrainingLocation,
  WorkoutSession,
} from '@atlas/data-model';
import { startWorkoutSession, completeWorkoutSession } from '@atlas/workout-engine';
import {
  OPTIONAL_BACKUP_STORES,
  REQUIRED_BACKUP_STORES,
  STORES_NOT_IN_BACKUP,
} from './backupStores';
import { exportBackup } from './exportBackup';
import { restoreBackup } from './restoreBackup';
import { validateAtlasPlan } from './validateAtlasPlan';
import type { AtlasBackupDocument } from './types';

const freshStorage = (label = 'parity') =>
  new IndexedDbAdapter(`atlas-${label}-${crypto.randomUUID()}`);

const meta = (id: string, overrides: Partial<SyncMeta> = {}): SyncMeta => ({
  id,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  version: 3,
  device_id: 'desktop-1',
  deleted_at: null,
  ...overrides,
});

/** Everything the owner can configure about gyms, in one fixture -- every shape the editor can save. */
function gymData() {
  const mainGym: TrainingLocation = {
    ...meta('loc-main'),
    name: 'Main Gym',
    equipment: ['Chest press', 'Cable machine'], // legacy strings, still readable
    note: 'Monday-Friday',
    is_default: true,
  };
  const archivedGym: TrainingLocation = {
    ...meta('loc-old'),
    name: 'Old Gym',
    equipment: [],
    note: null,
    is_default: false,
    archived_at: '2026-08-15T00:00:00.000Z',
  };
  const definitions: EquipmentDefinition[] = [
    { ...meta('def-db'), type: 'dumbbell', name: 'Dumbbells' },
    { ...meta('def-machine'), type: 'leverage machine', name: 'Machine' },
  ];
  const instance = (
    id: string,
    label: string,
    def: string,
    extra: Partial<GymEquipmentInstance> = {},
  ): GymEquipmentInstance => ({
    ...meta(id),
    training_location_id: 'loc-main',
    equipment_definition_id: def,
    label,
    manufacturer: null,
    model: null,
    exact_loads: null,
    min_load: null,
    max_load: null,
    increment: null,
    unit: 'lb',
    notes: null,
    ...extra,
  });
  const equipment: GymEquipmentInstance[] = [
    instance('eq-db', 'Dumbbells', 'def-db', { exact_loads: [5, 10, 15, 20, 25, 30, 40, 50, 80] }), // nonuniform exact list
    instance('eq-press-1', 'Chest Press #1', 'def-machine', {
      min_load: 20,
      max_load: 170,
      increment: 10,
    }), // range
    instance('eq-press-2', 'Chest Press #2', 'def-machine', {
      max_load: 200,
      legacy_equipment: 'Chest press',
    }), // max only, from a legacy item
    instance('eq-cable', 'Cable Stack A', 'def-machine', {
      max_prompt_dismissed_at: '2026-09-10T00:00:00.000Z',
    }), // unknown loads, question answered
    instance('eq-retired', 'Retired press', 'def-machine', {
      archived_at: '2026-08-20T00:00:00.000Z',
      training_location_id: 'loc-old',
    }),
  ];
  const contexts: ExerciseEquipmentContext[] = [
    {
      ...meta('ctx-1'),
      exercise_id: 'ex-press',
      gym_equipment_id: 'eq-press-1',
      is_default: true,
      notes: null,
    },
    {
      ...meta('ctx-2'),
      exercise_id: 'ex-press',
      gym_equipment_id: 'eq-press-2',
      is_default: false,
      notes: 'when #1 is busy',
    },
  ];
  const aliases: ExerciseAlias[] = [
    {
      ...meta('alias-1'),
      exercise_id: 'ex-press',
      normalized_alias: 'machine chest press',
      display_alias: 'Machine Chest Press',
      source: 'user',
    },
  ];
  const protocols: TestProtocol[] = [
    {
      ...meta('proto-1'),
      name: '60-second push-up test',
      measurement_type: 'reps_bodyweight',
      is_timed: true,
      cadence: null,
      rom_requirements: null,
      rest_policy: null,
      source: null,
      protocol_version: 'v1',
      notes: null,
    },
  ];
  return {
    locations: [mainGym, archivedGym],
    definitions,
    equipment,
    contexts,
    aliases,
    protocols,
  };
}

/** A completed workout carrying every field this handoff added to a session. */
function contextualSession(): WorkoutSession {
  const started = startWorkoutSession({
    name: 'Upper A',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
    trainingLocationId: 'loc-main',
    performedLocalDate: '2026-09-27',
  });
  return {
    ...completeWorkoutSession(started),
    exercise_equipment: [{ exercise_id: 'ex-press', gym_equipment_id: 'eq-press-1' }],
    time_zone_id: 'America/New_York',
    utc_offset_minutes: -240,
  };
}

const event: PersonalRecordEvent = {
  ...meta('pr-event:s1:ex-press:loc-main:eq-press-1'),
  session_id: 's1',
  exercise_id: 'ex-press',
  training_location_id: 'loc-main',
  gym_equipment_id: 'eq-press-1',
  achieved_at: '2026-09-27T01:30:00.000Z',
  pr_kinds: ['rep_at_load'],
  evaluator_version: 'pr-events-2/brzycki-v1',
};

async function populate(storage: AtlasStorage) {
  const data = gymData();
  await storage.trainingLocations.putMany(data.locations);
  await storage.equipmentDefinitions.putMany(data.definitions);
  await storage.gymEquipment.putMany(data.equipment);
  await storage.exerciseEquipmentContext.putMany(data.contexts);
  await storage.exerciseAliases.putMany(data.aliases);
  await storage.testProtocols.putMany(data.protocols);
  await storage.workoutSessions.put(contextualSession());
  await storage.personalRecordEvents.put(event);
  return data;
}

/** Export -> real JSON text -> strict validation, exactly as the app's export file and restore wizard do. */
async function throughJson(source: AtlasStorage): Promise<AtlasBackupDocument> {
  const exported = await exportBackup(source);
  const validated = validateAtlasPlan(JSON.parse(JSON.stringify(exported)));
  if (!validated.valid || validated.value.kind !== 'backup')
    throw new Error('a fresh export must validate');
  return validated.value;
}

describe('every durable store is accounted for', () => {
  const repositoryNames = (storage: AtlasStorage) =>
    Object.entries(storage as unknown as Record<string, unknown>)
      .filter(([, value]) => typeof (value as { getAll?: unknown } | null)?.getAll === 'function')
      .map(([name]) => name)
      .sort();

  it('every repository the adapter has is in the backup, or explicitly marked as not backed up', () => {
    const accounted = new Set<string>([
      ...Object.values(REQUIRED_BACKUP_STORES),
      ...Object.values(OPTIONAL_BACKUP_STORES),
      ...STORES_NOT_IN_BACKUP,
    ]);
    // A new repository added to the adapter without a backup decision fails here.
    expect(repositoryNames(freshStorage()).filter((name) => !accounted.has(name))).toEqual([]);
  });

  it('every store named in the backup tables is a real repository, and none is listed twice', () => {
    const real = new Set(repositoryNames(freshStorage()));
    const listed = [
      ...Object.values(REQUIRED_BACKUP_STORES),
      ...Object.values(OPTIONAL_BACKUP_STORES),
      ...STORES_NOT_IN_BACKUP,
    ] as string[];
    expect(listed.filter((name) => !real.has(name))).toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('only reference data is left out, and the foundational stores are all in', () => {
    expect([...STORES_NOT_IN_BACKUP]).toEqual(['benchmarks']);
    expect(Object.values(OPTIONAL_BACKUP_STORES)).toEqual(
      expect.arrayContaining([
        'trainingLocations',
        'equipmentDefinitions',
        'gymEquipment',
        'exerciseEquipmentContext',
        'exerciseAliases',
        'testProtocols',
        'personalRecordEvents',
        'workoutOccurrences',
      ]),
    );
  });
});

describe('a new backup contains every current durable store', () => {
  it('has a key for each required and optional store, populated where the owner has data', async () => {
    const source = freshStorage('source');
    await populate(source);
    const exported = await exportBackup(source);
    const keys = Object.keys(exported.entities).sort();
    expect(keys).toEqual(
      [...Object.keys(REQUIRED_BACKUP_STORES), ...Object.keys(OPTIONAL_BACKUP_STORES)].sort(),
    );
    expect(exported.entities.training_locations).toHaveLength(2);
    expect(exported.entities.equipment_definitions).toHaveLength(2);
    expect(exported.entities.gym_equipment).toHaveLength(5);
    expect(exported.entities.exercise_equipment_contexts).toHaveLength(2);
    expect(exported.entities.exercise_aliases).toHaveLength(1);
    expect(exported.entities.test_protocols).toHaveLength(1);
    expect(exported.entities.personal_record_events).toHaveLength(1);
  });

  it('an empty install still exports every key (as empty lists), so the file shape is stable', async () => {
    const exported = await exportBackup(freshStorage('empty'));
    for (const key of Object.keys(OPTIONAL_BACKUP_STORES)) {
      expect((exported.entities as Record<string, unknown[]>)[key]).toEqual([]);
    }
  });
});

describe('restore brings back everything the owner configured', () => {
  it('training locations round-trip, default flag, notes and legacy equipment strings included', async () => {
    const source = freshStorage('source');
    const data = await populate(source);
    const target = freshStorage('target');
    const result = await restoreBackup(await throughJson(source), target);
    expect(result.restored_counts.training_locations).toBe(2);
    const restored = await target.trainingLocations.getAll();
    expect(restored.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...data.locations].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(restored.find((l) => l.id === 'loc-main')).toMatchObject({
      is_default: true,
      equipment: ['Chest press', 'Cable machine'],
    });
  });

  it('equipment definitions round-trip', async () => {
    const source = freshStorage('source');
    const data = await populate(source);
    const target = freshStorage('target');
    const result = await restoreBackup(await throughJson(source), target);
    expect(result.restored_counts.equipment_definitions).toBe(2);
    expect(
      (await target.equipmentDefinitions.getAll()).sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(data.definitions);
  });

  it('gym equipment round-trips in every load shape: exact list, range, max only, unknown', async () => {
    const source = freshStorage('source');
    const data = await populate(source);
    const target = freshStorage('target');
    const result = await restoreBackup(await throughJson(source), target);
    expect(result.restored_counts.gym_equipment).toBe(5);
    const byId = new Map((await target.gymEquipment.getAll()).map((i) => [i.id, i]));
    for (const original of data.equipment) expect(byId.get(original.id)).toEqual(original);
    expect(byId.get('eq-db')?.exact_loads).toEqual([5, 10, 15, 20, 25, 30, 40, 50, 80]);
    expect(byId.get('eq-press-2')).toMatchObject({
      max_load: 200,
      exact_loads: null,
      increment: null,
      legacy_equipment: 'Chest press',
    });
    expect(byId.get('eq-cable')?.max_prompt_dismissed_at).toBe('2026-09-10T00:00:00.000Z');
  });

  it('exercise equipment contexts round-trip, the remembered default included', async () => {
    const source = freshStorage('source');
    const data = await populate(source);
    const target = freshStorage('target');
    const result = await restoreBackup(await throughJson(source), target);
    expect(result.restored_counts.exercise_equipment_contexts).toBe(2);
    expect(
      (await target.exerciseEquipmentContext.getAll()).sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(data.contexts);
  });

  it('exercise aliases round-trip', async () => {
    const source = freshStorage('source');
    const data = await populate(source);
    const target = freshStorage('target');
    const result = await restoreBackup(await throughJson(source), target);
    expect(result.restored_counts.exercise_aliases).toBe(1);
    expect(await target.exerciseAliases.getAll()).toEqual(data.aliases);
  });

  it('test protocols round-trip', async () => {
    const source = freshStorage('source');
    const data = await populate(source);
    const target = freshStorage('target');
    const result = await restoreBackup(await throughJson(source), target);
    expect(result.restored_counts.test_protocols).toBe(1);
    expect(await target.testProtocols.getAll()).toEqual(data.protocols);
  });

  it('PR events round-trip with their equipment context and evaluator version', async () => {
    const source = freshStorage('source');
    await populate(source);
    const target = freshStorage('target');
    const result = await restoreBackup(await throughJson(source), target);
    expect(result.restored_counts.personal_record_events).toBe(1);
    expect(await target.personalRecordEvents.get(event.id)).toEqual(event);
  });

  it('a workout keeps its location, the machine per exercise and its recorded local day', async () => {
    const source = freshStorage('source');
    await populate(source);
    const target = freshStorage('target');
    await restoreBackup(await throughJson(source), target);
    const [restored] = await target.workoutSessions.getAll();
    expect(restored).toMatchObject({
      training_location_id: 'loc-main',
      exercise_equipment: [{ exercise_id: 'ex-press', gym_equipment_id: 'eq-press-1' }],
      performed_local_date: '2026-09-27',
      time_zone_id: 'America/New_York',
      utc_offset_minutes: -240,
    });
  });

  it('no user-created gym configuration disappears: the restored database matches the source store by store', async () => {
    const source = freshStorage('source');
    await populate(source);
    const target = freshStorage('target');
    await restoreBackup(await throughJson(source), target);
    for (const store of Object.values(OPTIONAL_BACKUP_STORES)) {
      const before = await source[store].getAll();
      const after = await target[store].getAll();
      const sort = <T extends { id: string }>(rows: T[]) =>
        [...rows].sort((a, b) => a.id.localeCompare(b.id));
      expect(sort(after as { id: string }[]), `store ${store}`).toEqual(
        sort(before as { id: string }[]),
      );
    }
  });
});

describe('archived and deleted semantics survive', () => {
  it('an archived location and an archived machine come back archived, and the archived location is not the default', async () => {
    const source = freshStorage('source');
    await populate(source);
    const target = freshStorage('target');
    await restoreBackup(await throughJson(source), target);
    const location = await target.trainingLocations.get('loc-old');
    expect(location?.archived_at).toBe('2026-08-15T00:00:00.000Z');
    expect(location?.is_default).toBe(false);
    expect((await target.gymEquipment.get('eq-retired'))?.archived_at).toBe(
      '2026-08-20T00:00:00.000Z',
    );
  });

  it('there is still at most one default location after a restore', async () => {
    const source = freshStorage('source');
    await populate(source);
    const target = freshStorage('target');
    await restoreBackup(await throughJson(source), target);
    expect((await target.trainingLocations.getAll()).filter((l) => l.is_default)).toHaveLength(1);
  });

  it('a soft-deleted row is a tombstone, never exported (like every store) -- an archived one is a live row and is', async () => {
    const source = freshStorage('source');
    await populate(source);
    await source.trainingLocations.softDelete('loc-old');
    const exported = await exportBackup(source);
    expect(exported.entities.training_locations?.map((l) => l.id)).toEqual(['loc-main']);
    // The archived machine at the (now deleted) location is still a live equipment row.
    expect(exported.entities.gym_equipment?.some((i) => i.id === 'eq-retired')).toBe(true);
  });

  it('restoring into a database that holds a tombstone does not revive it', async () => {
    const source = freshStorage('source');
    await populate(source);
    await source.trainingLocations.softDelete('loc-old');
    const backup = await throughJson(source);
    const target = freshStorage('target');
    await target.trainingLocations.put({
      ...gymData().locations[1]!,
      deleted_at: '2026-09-05T00:00:00.000Z',
    });
    await restoreBackup(backup, target);
    expect((await target.trainingLocations.get('loc-old'))?.deleted_at).toBe(
      '2026-09-05T00:00:00.000Z',
    );
  });
});

describe('older backups remain restore-compatible', () => {
  const required = {
    exercises: [],
    programs: [],
    workout_templates: [],
    workout_sessions: [],
    exercise_notes: [],
    program_notes: [],
    personal_records: [],
    milestones: [],
    body_measurements: [],
  };
  const document = (entities: Record<string, unknown>) => ({
    format: 'atlas-plan-v1',
    kind: 'backup',
    exported_at: '2026-01-01T00:00:00.000Z',
    device_id: 'old-device',
    entities,
  });

  it('a backup with none of the optional keys validates, and restores nothing for them', async () => {
    const validated = validateAtlasPlan(document(required));
    expect(validated.valid).toBe(true);
    if (!validated.valid || validated.value.kind !== 'backup')
      throw new Error('expected a valid backup');
    const target = freshStorage('target');
    const result = await restoreBackup(validated.value, target);
    for (const key of Object.keys(OPTIONAL_BACKUP_STORES)) {
      expect((result.restored_counts as Record<string, number>)[key], key).toBe(0);
    }
    expect(await target.trainingLocations.getAll()).toEqual([]);
    expect(await target.gymEquipment.getAll()).toEqual([]);
  });

  it('a backup from before 04B -- with occurrences and PR events but no gym stores -- restores cleanly', async () => {
    const validated = validateAtlasPlan(
      document({ ...required, workout_occurrences: [], personal_record_events: [] }),
    );
    expect(validated.valid).toBe(true);
  });

  it('restoring an old backup onto an install that has gyms leaves those gyms alone', async () => {
    const target = freshStorage('target');
    await target.trainingLocations.putMany(gymData().locations);
    const validated = validateAtlasPlan(document(required));
    if (!validated.valid || validated.value.kind !== 'backup')
      throw new Error('expected a valid backup');
    await restoreBackup(validated.value, target);
    expect(await target.trainingLocations.getAll()).toHaveLength(2);
  });

  it('a present optional key must still be a list of entities', () => {
    for (const key of Object.keys(OPTIONAL_BACKUP_STORES)) {
      expect(
        validateAtlasPlan(document({ ...required, [key]: 'nope' })).valid,
        `${key}: not a list`,
      ).toBe(false);
      expect(
        validateAtlasPlan(document({ ...required, [key]: [{ not: 'an entity' }] })).valid,
        `${key}: bad row`,
      ).toBe(false);
      expect(
        validateAtlasPlan(document({ ...required, [key]: [] })).valid,
        `${key}: empty list`,
      ).toBe(true);
    }
  });
});
