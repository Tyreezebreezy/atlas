import { useEffect, useState } from 'react';
import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { TrainingLocation } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import {
  clearLegacyEquipmentProfiles,
  loadSettings,
  readLegacyEquipmentProfiles,
  saveSettings,
} from './settings';

interface EquipmentScreenProps {
  onBack: () => void;
}

/** v1.0.0 (H2). Training locations ("Equipment / Places") as first-class
 * synced entities. On first open it migrates any pre-v1.0.0 device-local
 * equipment profiles (localStorage) into `TrainingLocation` entities without
 * discarding them. The active-location selection stays device-local. */
export function EquipmentScreen({ onBack }: EquipmentScreenProps) {
  const storage = useStorage();
  const [locations, setLocations] = useState<TrainingLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(() => loadSettings().activeTrainingLocationId);
  const [newName, setNewName] = useState('');
  const [newEquipment, setNewEquipment] = useState('');

  useEffect(() => {
    if (!storage) return;
    void (async () => {
      const legacy = readLegacyEquipmentProfiles();
      if (legacy.profiles.length > 0) {
        const now = new Date().toISOString();
        const entities: TrainingLocation[] = legacy.profiles.map((p) => ({
          id: p.id,
          created_at: now,
          updated_at: now,
          version: 1,
          device_id: getOrCreateDeviceId(),
          deleted_at: null,
          name: p.name,
          equipment: p.equipment,
          note: null,
        }));
        await storage.trainingLocations.putMany(entities);
        if (legacy.activeId) setActiveId(legacy.activeId);
        saveSettings({ ...loadSettings(), activeTrainingLocationId: legacy.activeId });
        clearLegacyEquipmentProfiles();
      }
      setLocations(await storage.trainingLocations.getAll());
      setLoading(false);
    })();
  }, [storage]);

  function updateSettings(activeLocationId: string | null) {
    setActiveId(activeLocationId);
    saveSettings({ ...loadSettings(), activeTrainingLocationId: activeLocationId });
  }

  async function addLocation() {
    if (!storage) return;
    const name = newName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const location: TrainingLocation = {
      id: newId(),
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: getOrCreateDeviceId(),
      deleted_at: null,
      name,
      equipment: newEquipment
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      note: null,
    };
    await storage.trainingLocations.put(location);
    setLocations(await storage.trainingLocations.getAll());
    setNewName('');
    setNewEquipment('');
  }

  async function updateLocation(id: string, patch: Partial<TrainingLocation>) {
    if (!storage) return;
    const existing = locations.find((l) => l.id === id);
    if (!existing) return;
    await storage.trainingLocations.put({
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
      version: existing.version + 1,
    });
    setLocations(await storage.trainingLocations.getAll());
  }

  async function removeLocation(id: string) {
    if (!storage) return;
    await storage.trainingLocations.softDelete(id);
    if (activeId === id) updateSettings(null);
    setLocations(await storage.trainingLocations.getAll());
  }

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Equipment / Places</h1>
        <p>Loading&hellip;</p>
      </div>
    );
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
      {locations.map((location) => (
        <div key={location.id} className="atlas-settings__row">
          <label>
            <input
              type="radio"
              name="active-training-location"
              checked={activeId === location.id}
              onChange={() => updateSettings(location.id)}
            />
            {location.name}
          </label>
          <input
            type="text"
            aria-label={`${location.name} equipment (comma-separated)`}
            placeholder="barbell, dumbbell, bench, ..."
            value={location.equipment.join(', ')}
            onChange={(e) =>
              updateLocation(location.id, {
                equipment: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
          <button
            type="button"
            onClick={() => void removeLocation(location.id)}
            aria-label={`Remove ${location.name}`}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="atlas-settings__row">
        <input
          type="text"
          aria-label="New place name"
          placeholder="Place name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          type="text"
          aria-label="New place equipment (comma-separated)"
          placeholder="barbell, dumbbell, ..."
          value={newEquipment}
          onChange={(e) => setNewEquipment(e.target.value)}
        />
        <button type="button" onClick={() => void addLocation()}>
          Add Place
        </button>
      </div>
    </div>
  );
}
