import { useState } from 'react';
import { newId } from '@atlas/core';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type EquipmentProfile } from './settings';

interface SettingsScreenProps {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState(loadSettings);
  const [newProfileName, setNewProfileName] = useState('');

  function update(patch: Partial<typeof settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  function addProfile() {
    const name = newProfileName.trim();
    if (!name) return;
    const profile: EquipmentProfile = { id: newId(), name, equipment: [] };
    update({ equipmentProfiles: [...settings.equipmentProfiles, profile] });
    setNewProfileName('');
  }

  function updateProfile(id: string, patch: Partial<EquipmentProfile>) {
    update({
      equipmentProfiles: settings.equipmentProfiles.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    });
  }

  function removeProfile(id: string) {
    update({
      equipmentProfiles: settings.equipmentProfiles.filter((p) => p.id !== id),
      activeEquipmentProfileId:
        settings.activeEquipmentProfileId === id ? null : settings.activeEquipmentProfileId,
    });
  }

  return (
    <div className="atlas-settings">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Settings</h1>

      <div className="atlas-settings__row">
        <label htmlFor="pre-countdown-enabled">Pre-exercise countdown</label>
        <input
          id="pre-countdown-enabled"
          type="checkbox"
          checked={settings.preCountdownEnabled}
          onChange={(e) => update({ preCountdownEnabled: e.target.checked })}
        />
      </div>
      <p className="atlas-settings__hint">
        A short countdown before a timed exercise starts, so there's time to get into position.
      </p>

      {settings.preCountdownEnabled && (
        <div className="atlas-settings__row">
          <label htmlFor="pre-countdown-seconds">Countdown length (seconds)</label>
          <input
            id="pre-countdown-seconds"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={settings.preCountdownSeconds}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              update({
                preCountdownSeconds: Number.isFinite(parsed)
                  ? Math.min(10, Math.max(1, parsed))
                  : DEFAULT_SETTINGS.preCountdownSeconds,
              });
            }}
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}

      <h2>Timer signals</h2>
      <div className="atlas-settings__row">
        <label htmlFor="timer-sound-enabled">Sound</label>
        <input
          id="timer-sound-enabled"
          type="checkbox"
          checked={settings.timerSoundEnabled}
          onChange={(e) => update({ timerSoundEnabled: e.target.checked })}
        />
      </div>
      <div className="atlas-settings__row">
        <label htmlFor="timer-vibration-enabled">Vibration</label>
        <input
          id="timer-vibration-enabled"
          type="checkbox"
          checked={settings.timerVibrationEnabled}
          onChange={(e) => update({ timerVibrationEnabled: e.target.checked })}
        />
      </div>
      <div className="atlas-settings__row">
        <label htmlFor="timer-flash-enabled">Visual flash</label>
        <input
          id="timer-flash-enabled"
          type="checkbox"
          checked={settings.timerFlashEnabled}
          onChange={(e) => update({ timerFlashEnabled: e.target.checked })}
        />
      </div>
      <p className="atlas-settings__hint">
        Not every device supports every signal (e.g. most desktop browsers can't vibrate) --
        unsupported ones simply do nothing rather than erroring.
      </p>

      <h2>Equipment Profiles</h2>
      <p className="atlas-settings__hint">
        Activate one to see substitution suggestions when a planned exercise's equipment isn't in
        your active profile. Leave none active to turn this off entirely.
      </p>
      {settings.equipmentProfiles.map((profile) => (
        <div key={profile.id} className="atlas-settings__row">
          <label>
            <input
              type="radio"
              name="active-equipment-profile"
              checked={settings.activeEquipmentProfileId === profile.id}
              onChange={() => update({ activeEquipmentProfileId: profile.id })}
            />
            {profile.name}
          </label>
          <input
            type="text"
            aria-label={`${profile.name} equipment (comma-separated)`}
            placeholder="barbell, dumbbell, bench, ..."
            value={profile.equipment.join(', ')}
            onChange={(e) =>
              updateProfile(profile.id, {
                equipment: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
          <button
            type="button"
            onClick={() => removeProfile(profile.id)}
            aria-label={`Remove ${profile.name}`}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="atlas-settings__row">
        <input
          type="text"
          aria-label="New equipment profile name"
          placeholder="e.g. Home, Hotel, Minimal Equipment"
          value={newProfileName}
          onChange={(e) => setNewProfileName(e.target.value)}
        />
        <button type="button" onClick={addProfile}>
          Add Profile
        </button>
      </div>
    </div>
  );
}
