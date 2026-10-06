/**
 * Device-local settings (localStorage): timer preferences only.
 *
 * vNext Handoff 04B: this used to hold an "active training location". That
 * setting is gone. Where a workout happens is the workout's own
 * `training_location_id` (chosen when it starts), the place a new workout
 * starts at is the default flag on the `TrainingLocation` entity (so it is
 * part of a backup, which device-local settings never are) or the place of the
 * last workout, and the old field never persisted anyway -- `loadSettings`
 * overwrote it with a legacy key on every read.
 */
export interface AtlasSettings {
  preCountdownEnabled: boolean;
  preCountdownSeconds: number;
  /** v0.2.0. Timer-completion signals -- each independently toggleable. */
  timerSoundEnabled: boolean;
  timerVibrationEnabled: boolean;
  timerFlashEnabled: boolean;
}

export const DEFAULT_SETTINGS: AtlasSettings = {
  preCountdownEnabled: true,
  preCountdownSeconds: 3,
  timerSoundEnabled: true,
  timerVibrationEnabled: true,
  timerFlashEnabled: true,
};

/** v1.0.0. The pre-entity equipment-profile shape, kept only to migrate
 * existing device-local profiles into `TrainingLocation` entities (see
 * `equipment/legacyProfiles.ts`). */
export interface LegacyEquipmentProfile {
  id: string;
  name: string;
  equipment: string[];
}

interface LegacySettingsShape {
  equipmentProfiles?: LegacyEquipmentProfile[];
  activeEquipmentProfileId?: string | null;
}

const STORAGE_KEY = 'atlas-settings';

/**
 * Reads the stored settings over the defaults. Unknown stored fields pass
 * through untouched, on purpose: a later `saveSettings` writes them back, so
 * saving a timer preference never drops legacy equipment profiles that have not
 * been migrated into `TrainingLocation` rows yet.
 */
export function loadSettings(): AtlasSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AtlasSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * v1.0.0. Reads any legacy equipment profiles out of raw localStorage so Gyms &
 * Equipment can migrate them into `TrainingLocation` entities. Returns the
 * legacy profiles (and active id) without mutating storage.
 */
export function readLegacyEquipmentProfiles(): {
  profiles: LegacyEquipmentProfile[];
  activeId: string | null;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { profiles: [], activeId: null };
    const parsed = JSON.parse(raw) as LegacySettingsShape;
    return {
      profiles: parsed.equipmentProfiles ?? [],
      activeId: parsed.activeEquipmentProfileId ?? null,
    };
  } catch {
    return { profiles: [], activeId: null };
  }
}

/** Removes the legacy equipment-profile fields once migration has run. */
export function clearLegacyEquipmentProfiles(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    delete parsed.equipmentProfiles;
    delete parsed.activeEquipmentProfileId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

export function saveSettings(settings: AtlasSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // private-mode/quota errors just mean the pref doesn't persist this session -- not fatal.
  }
}
