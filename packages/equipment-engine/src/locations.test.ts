import { describe, expect, it } from 'vitest';
import type { TrainingLocation, WorkoutSession } from '@atlas/data-model';
import { startWorkoutSession, discardWorkoutSession } from '@atlas/workout-engine';
import { createGymEquipmentInstance } from './createEquipment';
import {
  activeLocations,
  archiveLocation,
  archivedLocations,
  createTrainingLocation,
  isLocationActive,
  lastUsedLocationId,
  locationUsage,
  MAX_LOCATION_NAME_LENGTH,
  preselectedLocationId,
  restoreLocation,
  setDefaultLocation,
  updateTrainingLocation,
  validateLocationName,
} from './locations';

const make = (name: string, extra: Partial<TrainingLocation> = {}): TrainingLocation => ({
  ...createTrainingLocation({ name }),
  ...extra,
});

function session(
  locationId: string | null,
  startedAt: string,
  status: WorkoutSession['status'] = 'completed',
): WorkoutSession {
  const base = startWorkoutSession({
    name: 'W',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
    trainingLocationId: locationId,
    startedAt,
  });
  return { ...base, status };
}

describe('creating a location', () => {
  it('needs only a name -- no equipment, no setup', () => {
    const location = createTrainingLocation({ name: '  Main Gym ' });
    expect(location).toMatchObject({
      name: 'Main Gym',
      equipment: [],
      note: null,
      deleted_at: null,
      version: 1,
    });
    expect(location.is_default).toBeUndefined();
    expect(location.archived_at).toBeUndefined();
  });

  it('keeps an optional note', () => {
    expect(createTrainingLocation({ name: 'Home', note: ' garage ' }).note).toBe('garage');
    expect(createTrainingLocation({ name: 'Home', note: '   ' }).note).toBeNull();
  });
});

describe('location names', () => {
  const existing = [make('Main Gym'), make('Home', { archived_at: '2026-09-01T00:00:00.000Z' })];

  it('must be present and not too long', () => {
    expect(validateLocationName('   ', existing)).toBeTruthy();
    expect(validateLocationName('x'.repeat(MAX_LOCATION_NAME_LENGTH + 1), existing)).toBeTruthy();
    expect(validateLocationName('Hotel', existing)).toBeNull();
  });

  it('must be unique ignoring case, archived locations included, so restoring one never creates a clash', () => {
    expect(validateLocationName('main gym', existing)).toBeTruthy();
    expect(validateLocationName('HOME', existing)).toBeTruthy();
  });

  it('a location may keep its own name when edited', () => {
    expect(validateLocationName('Main Gym', existing, existing[0]!.id)).toBeNull();
  });

  it("a deleted location's name is free again", () => {
    const deleted = [make('Old', { deleted_at: '2026-09-01T00:00:00.000Z' })];
    expect(validateLocationName('Old', deleted)).toBeNull();
  });
});

describe('the default location', () => {
  it('sets one default and nothing else changes', () => {
    const [a, b] = [make('A'), make('B')];
    const changed = setDefaultLocation([a, b], b.id);
    expect(changed.map((l) => [l.name, l.is_default])).toEqual([['B', true]]);
  });

  it('changing the default clears the previous one: there is at most one', () => {
    const a = make('A', { is_default: true });
    const b = make('B');
    const changed = setDefaultLocation([a, b], b.id);
    const after = [a, b].map((l) => changed.find((c) => c.id === l.id) ?? l);
    expect(after.filter((l) => l.is_default)).toHaveLength(1);
    expect(after.find((l) => l.is_default)?.name).toBe('B');
    expect(changed.find((l) => l.id === a.id)?.version).toBe(a.version + 1);
  });

  it('repairs stored data that somehow holds two defaults', () => {
    const [a, b, c] = [make('A', { is_default: true }), make('B', { is_default: true }), make('C')];
    const changed = setDefaultLocation([a, b, c], c.id);
    const after = [a, b, c].map((l) => changed.find((x) => x.id === l.id) ?? l);
    expect(after.filter((l) => l.is_default).map((l) => l.name)).toEqual(['C']);
  });

  it('can be cleared with null', () => {
    const a = make('A', { is_default: true });
    expect(setDefaultLocation([a], null).map((l) => l.is_default)).toEqual([false]);
  });

  it('writes nothing when it is already the default, and refuses an archived or unknown location', () => {
    const a = make('A', { is_default: true });
    expect(setDefaultLocation([a], a.id)).toEqual([]);
    const archived = make('Z', { archived_at: '2026-09-01T00:00:00.000Z' });
    expect(setDefaultLocation([a, archived], archived.id)).toEqual([]);
    expect(setDefaultLocation([a], 'missing')).toEqual([]);
  });
});

describe('archiving a location', () => {
  it('hides it from the places a workout can be at, and it stops being the default', () => {
    const main = make('Main Gym', { is_default: true });
    const archived = archiveLocation(main);
    expect(archived.archived_at).toBeTruthy();
    expect(archived.is_default).toBe(false);
    expect(isLocationActive(archived)).toBe(false);
    expect(activeLocations([archived, make('Home')]).map((l) => l.name)).toEqual(['Home']);
    expect(archivedLocations([archived, make('Home')]).map((l) => l.name)).toEqual(['Main Gym']);
  });

  it('keeps the row and its name -- an archived location still resolves for history', () => {
    const archived = archiveLocation(make('Main Gym'));
    expect(archived.deleted_at).toBeNull(); // not a tombstone: getAll() still returns it
    expect(archived.name).toBe('Main Gym');
  });

  it('can be restored', () => {
    const restored = restoreLocation(archiveLocation(make('Main Gym')));
    expect(isLocationActive(restored)).toBe(true);
    expect(restored.archived_at).toBeNull();
  });

  it('active locations list the default first, then by name', () => {
    const list = activeLocations([make('Zed'), make('Alpha'), make('Mid', { is_default: true })]);
    expect(list.map((l) => l.name)).toEqual(['Mid', 'Alpha', 'Zed']);
  });
});

describe('editing a location', () => {
  it('renames and bumps the version without touching the equipment strings', () => {
    const original = make('Home', { equipment: ['barbell', 'bench'] });
    const edited = updateTrainingLocation(original, { name: ' Garage ', note: 'basement' });
    expect(edited).toMatchObject({
      name: 'Garage',
      note: 'basement',
      equipment: ['barbell', 'bench'],
      version: original.version + 1,
    });
  });
});

describe('where a new workout starts', () => {
  it('with no locations: nowhere -- the workout starts anyway', () => {
    expect(preselectedLocationId([], [])).toBeNull();
    expect(preselectedLocationId([archiveLocation(make('Old'))], [])).toBeNull();
  });

  it('with one location: that one, default or not', () => {
    const only = make('Home');
    expect(preselectedLocationId([only], [])).toBe(only.id);
  });

  it('with one active location among archived ones: the active one', () => {
    const old = archiveLocation(make('Old'));
    const current = make('Current');
    expect(preselectedLocationId([old, current], [])).toBe(current.id);
  });

  it('with several: the default wins over where the last workout was', () => {
    const main = make('Main Gym', { is_default: true });
    const hotel = make('Hotel');
    const sessions = [session(hotel.id, '2026-09-20T10:00:00.000Z')];
    expect(preselectedLocationId([main, hotel], sessions)).toBe(main.id);
  });

  it('with several and no default: the place of the most recent workout', () => {
    const main = make('Main Gym');
    const hotel = make('Hotel');
    const sessions = [
      session(main.id, '2026-09-01T10:00:00.000Z'),
      session(hotel.id, '2026-09-20T10:00:00.000Z'),
      session(main.id, '2026-09-10T10:00:00.000Z'),
    ];
    expect(preselectedLocationId([main, hotel], sessions)).toBe(hotel.id);
  });

  it('with several and neither a default nor a history: nowhere -- a place is never guessed from list order', () => {
    expect(preselectedLocationId([make('A'), make('B')], [])).toBeNull();
    expect(
      preselectedLocationId([make('A'), make('B')], [session(null, '2026-09-01T10:00:00.000Z')]),
    ).toBeNull();
  });

  it('a discarded workout does not count as last used; neither does an archived place', () => {
    const main = make('Main Gym');
    const hotel = make('Hotel');
    const old = archiveLocation(make('Old'));
    const sessions = [
      session(main.id, '2026-09-01T10:00:00.000Z'),
      discardWorkoutSession(session(hotel.id, '2026-09-20T10:00:00.000Z')),
      session(old.id, '2026-09-25T10:00:00.000Z'),
    ];
    expect(lastUsedLocationId([main, hotel, old], sessions)).toBe(main.id);
  });
});

describe('locationUsage: what still points at a location', () => {
  it('counts the workouts that happened there and the equipment configured there', () => {
    const main = make('Main Gym');
    const press = createGymEquipmentInstance({
      trainingLocationId: main.id,
      equipmentDefinitionId: 'd',
      label: 'Press',
    });
    const elsewhere = createGymEquipmentInstance({
      trainingLocationId: 'other',
      equipmentDefinitionId: 'd',
      label: 'Other',
    });
    const usage = locationUsage(
      main.id,
      [session(main.id, '2026-09-01T10:00:00.000Z'), session(null, '2026-09-02T10:00:00.000Z')],
      [press, elsewhere],
    );
    expect(usage).toEqual({ sessions: 1, equipment: 1 });
    expect(locationUsage('unused', [], [])).toEqual({ sessions: 0, equipment: 0 });
  });
});
