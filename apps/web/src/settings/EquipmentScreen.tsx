import { useState } from 'react';
import { newId } from '@atlas/core';
import { loadSettings, saveSettings, type EquipmentProfile } from './settings';

interface EquipmentScreenProps {
  onBack: () => void;
}

/** v1.0.0 (H1). Training locations ("Equipment / Places") as a first-class
 * surface, extracted out of Settings. Still backed by the device-local
 * `AtlasSettings.equipmentProfiles` model (see `settings.ts`) -- H2 promotes
 * this concept into a synced `TrainingLocation` entity without changing this
 * screen's job. Nothing here hardcodes a specific gym name; the examples are
 * placeholder text only. */
export function EquipmentScreen({ onBack }: EquipmentScreenProps) {
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
      <h1>Equipment / Places</h1>
      <p className="atlas-settings__hint">
        Reusable places you train and what each one has. Activate a place to see substitution
        suggestions when a planned exercise's equipment isn't available there. Leave none active to
        turn this off entirely.
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
          aria-label="New place name"
          placeholder="e.g. Home, Hotel, Minimal Equipment"
          value={newProfileName}
          onChange={(e) => setNewProfileName(e.target.value)}
        />
        <button type="button" onClick={addProfile}>
          Add Place
        </button>
      </div>
    </div>
  );
}
