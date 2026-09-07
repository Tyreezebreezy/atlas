/** v0.2.0. A named set of available equipment -- "FIU Gym", "Home", etc.
 * are just examples the owner can rename/delete; nothing hardcodes them.
 * Device-local like the rest of Settings: which gym someone's at right now
 * isn't shared history. */
export interface EquipmentProfile {
  id: string;
  name: string;
  equipment: string[];
}

export interface AtlasSettings {
  preCountdownEnabled: boolean;
  preCountdownSeconds: number;
  /** v0.2.0. Timer-completion signals -- each independently toggleable
   * since not every device/owner wants all three (see
   * docs/DATA_MODEL.md "Timer signals"). */
  timerSoundEnabled: boolean;
  timerVibrationEnabled: boolean;
  timerFlashEnabled: boolean;
  /** v0.2.0. Empty by default -- equipment-aware substitutions are simply
   * off (no filtering) until the owner defines at least one profile and
   * activates it. */
  equipmentProfiles: EquipmentProfile[];
  activeEquipmentProfileId: string | null;
}

export const DEFAULT_SETTINGS: AtlasSettings = {
  preCountdownEnabled: true,
  preCountdownSeconds: 3,
  timerSoundEnabled: true,
  timerVibrationEnabled: true,
  timerFlashEnabled: true,
  equipmentProfiles: [],
  activeEquipmentProfileId: null,
};

const STORAGE_KEY = 'atlas-settings';

/**
 * Device-local via localStorage, not a synced entity -- Settings can only be
 * read/edited outside Gym Mode (no tab bar during an active session, so
 * nothing needs live cross-component reactivity either) and there's exactly
 * one preference so far. Revisit as a real synced entity if that changes.
 */
export function loadSettings(): AtlasSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AtlasSettings>) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AtlasSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ponytail: private-mode/quota errors just mean the pref doesn't persist this session -- not fatal.
  }
}
