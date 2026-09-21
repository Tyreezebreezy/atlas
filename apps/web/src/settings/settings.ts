/**
 * Device-local settings (localStorage). The one "active training location"
 * selection stays here because "which gym am I at right now" is transient
 * context, not shared history; the reusable locations themselves are now
 * first-class `TrainingLocation` entities (see packages/data-model and the
 * Equipment/Places screen).
 */
export interface AtlasSettings {
  preCountdownEnabled: boolean;
  preCountdownSeconds: number;
  /** v0.2.0. Timer-completion signals -- each independently toggleable. */
  timerSoundEnabled: boolean;
  timerVibrationEnabled: boolean;
  timerFlashEnabled: boolean;
  /** v1.0.0. Id of the active `TrainingLocation` (used for equipment-aware
   * substitution and exercise discovery). Null = none active. */
  activeTrainingLocationId: string | null;
}

export const DEFAULT_SETTINGS: AtlasSettings = {
  preCountdownEnabled: true,
  preCountdownSeconds: 3,
  timerSoundEnabled: true,
  timerVibrationEnabled: true,
  timerFlashEnabled: true,
  activeTrainingLocationId: null,
};

/** v1.0.0. The pre-entity equipment-profile shape, kept only to migrate
 * existing device-local profiles into `TrainingLocation` entities. */
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

export function loadSettings(): AtlasSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AtlasSettings> & LegacySettingsShape;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      activeTrainingLocationId: parsed.activeEquipmentProfileId ?? null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * v1.0.0. Reads any legacy equipment profiles out of raw localStorage so the
 * Equipment/Places screen can migrate them into `TrainingLocation` entities.
 * Returns the legacy profiles (and active id) without mutating storage.
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
