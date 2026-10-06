import { getOrCreateDeviceId } from '@atlas/core';
import type { TrainingLocation } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import { clearLegacyEquipmentProfiles, readLegacyEquipmentProfiles } from '../settings/settings';

/**
 * Before v1.0.0 the places a person trained at lived in this device's
 * localStorage as "equipment profiles". The first time Gyms & Equipment opens
 * after upgrading, they become `TrainingLocation` rows (same ids, same names,
 * the comma-separated equipment kept as the legacy `equipment` strings) and the
 * old localStorage fields are cleared -- exactly what the old Equipment/Places
 * screen did, kept so that nobody who never opened that screen loses their
 * profiles to this one replacing it. A profile that was the "active" one
 * becomes the default place (the nearest thing the new model has to "the one I
 * usually train at"). Nothing is migrated when there is nothing to migrate.
 *
 * Returns true when it wrote anything, so the caller knows to reload.
 */
export async function migrateLegacyEquipmentProfiles(storage: AtlasStorage): Promise<boolean> {
  const { profiles, activeId } = readLegacyEquipmentProfiles();
  if (profiles.length === 0) return false;
  const now = new Date().toISOString();
  const existing = new Map((await storage.trainingLocations.getAll()).map((l) => [l.id, l]));
  const rows: TrainingLocation[] = profiles
    .filter((profile) => !existing.has(profile.id)) // never overwrite a place that is already a TrainingLocation
    .map((profile) => ({
      id: profile.id,
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: getOrCreateDeviceId(),
      deleted_at: null,
      name: profile.name,
      equipment: profile.equipment,
      note: null,
      ...(profile.id === activeId ? { is_default: true } : {}),
    }));
  if (rows.length > 0) await storage.trainingLocations.putMany(rows);
  clearLegacyEquipmentProfiles();
  return rows.length > 0;
}
