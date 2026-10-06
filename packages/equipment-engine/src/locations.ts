import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { GymEquipmentInstance, TrainingLocation, WorkoutSession } from '@atlas/data-model';

/**
 * vNext Handoff 04B. `TrainingLocation` is the one location identity. These are
 * the rules around it -- what makes one valid, which is the default, what
 * "archived" means, and where a new workout starts -- so that none of it lives
 * in a component.
 *
 * Archived is not deleted: an archived location keeps its row (so sessions that
 * happened there still resolve its name, and equipment configured there is not
 * lost) and is only hidden from every "where are you training" choice.
 */

export const MAX_LOCATION_NAME_LENGTH = 60;

export function isLocationActive(
  location: Pick<TrainingLocation, 'deleted_at' | 'archived_at'>,
): boolean {
  return location.deleted_at === null && !location.archived_at;
}

function byDefaultThenName(a: TrainingLocation, b: TrainingLocation): number {
  return Number(!!b.is_default) - Number(!!a.is_default) || a.name.localeCompare(b.name);
}

/** Locations a workout can be started at: not archived, not deleted; the default first, then by name. */
export function activeLocations(locations: TrainingLocation[]): TrainingLocation[] {
  return locations.filter(isLocationActive).sort(byDefaultThenName);
}

/** Archived (and not deleted) locations, by name -- the "Archived" list in settings. */
export function archivedLocations(locations: TrainingLocation[]): TrainingLocation[] {
  return locations
    .filter((location) => location.deleted_at === null && !!location.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Null when the name is fine; otherwise the sentence to show next to the field. Names are unique, ignoring case, among every location that still exists -- archived ones included, so restoring one never creates a clash. */
export function validateLocationName(
  name: string,
  existing: TrainingLocation[],
  selfId: string | null = null,
): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Give this place a name.';
  if (trimmed.length > MAX_LOCATION_NAME_LENGTH)
    return `Keep the name under ${MAX_LOCATION_NAME_LENGTH} characters.`;
  const clash = existing.some(
    (location) =>
      location.id !== selfId &&
      location.deleted_at === null &&
      location.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return clash ? 'A place with that name already exists.' : null;
}

export interface CreateLocationInput {
  name: string;
  note?: string | null;
}

/** A new location. A name is all it needs -- no equipment, no setup. */
export function createTrainingLocation(input: CreateLocationInput): TrainingLocation {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name: input.name.trim(),
    equipment: [],
    note: input.note?.trim() ? input.note.trim() : null,
  };
}

function touched(location: TrainingLocation): TrainingLocation {
  return { ...location, updated_at: new Date().toISOString(), version: location.version + 1 };
}

export function updateTrainingLocation(
  location: TrainingLocation,
  patch: { name?: string; note?: string | null },
): TrainingLocation {
  return {
    ...touched(location),
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.note !== undefined ? { note: patch.note?.trim() ? patch.note.trim() : null } : {}),
  };
}

/**
 * Makes one location the default (or none, with `null`). Returns only the rows
 * that change: the new default, and whichever one held it before -- there is at
 * most one default, whatever the stored data says. An archived or deleted
 * location cannot be the default.
 */
export function setDefaultLocation(
  locations: TrainingLocation[],
  locationId: string | null,
): TrainingLocation[] {
  const target = locationId
    ? locations.find((l) => l.id === locationId && isLocationActive(l))
    : null;
  if (locationId && !target) return [];
  const changed: TrainingLocation[] = [];
  for (const location of locations) {
    const shouldBeDefault = target?.id === location.id;
    if (!!location.is_default !== shouldBeDefault && location.deleted_at === null) {
      changed.push({ ...touched(location), is_default: shouldBeDefault });
    }
  }
  return changed;
}

/** Archives a location: hidden from choices, history intact. It also stops being the default. */
export function archiveLocation(location: TrainingLocation): TrainingLocation {
  return { ...touched(location), archived_at: new Date().toISOString(), is_default: false };
}

export function restoreLocation(location: TrainingLocation): TrainingLocation {
  return { ...touched(location), archived_at: null };
}

/**
 * The location of the most recent workout that recorded one and whose place can
 * still be chosen -- "last used". Read from history, so it needs no setting of
 * its own and survives a backup and restore. A discarded or skipped workout
 * never happened somewhere, so it does not count.
 */
export function lastUsedLocationId(
  locations: TrainingLocation[],
  sessions: Pick<WorkoutSession, 'status' | 'started_at' | 'training_location_id'>[],
): string | null {
  const active = new Set(locations.filter(isLocationActive).map((l) => l.id));
  const latest = sessions
    .filter(
      (s) =>
        (s.status === 'completed' || s.status === 'in_progress') &&
        s.training_location_id &&
        active.has(s.training_location_id),
    )
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  return latest?.training_location_id ?? null;
}

/**
 * Where a new workout starts, with no questions asked:
 *
 * - no places set up: nowhere (`null`) -- the workout starts anyway;
 * - exactly one place: that one;
 * - several: the default, else the place of the last workout;
 * - several with neither: nowhere, and the owner can pick one in a tap. A place
 *   is never guessed from the list's order.
 */
export function preselectedLocationId(
  locations: TrainingLocation[],
  sessions: Pick<WorkoutSession, 'status' | 'started_at' | 'training_location_id'>[],
): string | null {
  const active = activeLocations(locations);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0]!.id;
  const preferred = active.find((l) => l.is_default);
  if (preferred) return preferred.id;
  return lastUsedLocationId(locations, sessions);
}

export interface LocationUsage {
  /** Workouts that happened here (any status that kept a record). */
  sessions: number;
  /** Equipment instances configured here, archived included. */
  equipment: number;
}

/** What still points at a location -- a location nothing refers to can be deleted outright; anything else can only be archived. */
export function locationUsage(
  locationId: string,
  sessions: Pick<WorkoutSession, 'training_location_id'>[],
  instances: Pick<GymEquipmentInstance, 'training_location_id' | 'deleted_at'>[],
): LocationUsage {
  return {
    sessions: sessions.filter((s) => s.training_location_id === locationId).length,
    equipment: instances.filter(
      (i) => i.training_location_id === locationId && i.deleted_at === null,
    ).length,
  };
}
