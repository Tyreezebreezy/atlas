export interface AtlasSettings {
  preCountdownEnabled: boolean;
  preCountdownSeconds: number;
}

export const DEFAULT_SETTINGS: AtlasSettings = {
  preCountdownEnabled: true,
  preCountdownSeconds: 3,
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
