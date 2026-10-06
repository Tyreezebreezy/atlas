import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  readLegacyEquipmentProfiles,
  saveSettings,
} from './settings';

/** A minimal in-memory localStorage (the test environment is node). */
function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

describe('device-local settings', () => {
  beforeEach(() => stubLocalStorage());
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to the defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a saved timer preference', () => {
    saveSettings({ ...loadSettings(), preCountdownSeconds: 7, timerSoundEnabled: false });
    expect(loadSettings()).toMatchObject({
      preCountdownSeconds: 7,
      timerSoundEnabled: false,
      timerFlashEnabled: true,
    });
  });

  it('holds no location: where a workout happens lives on the workout, the default on the place', () => {
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('activeTrainingLocationId');
    saveSettings({ ...loadSettings(), preCountdownEnabled: false });
    expect(Object.keys(loadSettings())).not.toContain('activeTrainingLocationId');
  });

  it('saving a timer preference does not drop legacy equipment profiles that are waiting to be migrated', () => {
    stubLocalStorage({
      'atlas-settings': JSON.stringify({
        timerSoundEnabled: true,
        equipmentProfiles: [{ id: 'p1', name: 'Home', equipment: ['barbell'] }],
        activeEquipmentProfileId: 'p1',
      }),
    });
    saveSettings({ ...loadSettings(), timerSoundEnabled: false });
    expect(readLegacyEquipmentProfiles()).toEqual({
      profiles: [{ id: 'p1', name: 'Home', equipment: ['barbell'] }],
      activeId: 'p1',
    });
  });

  it('survives corrupt stored data by using the defaults', () => {
    stubLocalStorage({ 'atlas-settings': '{not json' });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
