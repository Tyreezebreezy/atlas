import { useEffect, useId, useState } from 'react';
import {
  activeInstancesAt,
  activeLocations,
  archivedLocations,
  legacyEquipmentToConfigure,
} from '@atlas/equipment-engine';
import type { TrainingLocation } from '@atlas/data-model';
import { addLocation, restoreLocationById, type GymsData } from './equipmentActions';
import { LocationDetail } from './LocationDetail';
import { migrateLegacyEquipmentProfiles } from './legacyProfiles';
import { useGymsData } from './useGymsData';

interface GymsScreenProps {
  onBack: () => void;
}

/** Placeholder names offered to someone with no places yet. They only fill in the name field -- nothing is created until the owner presses Add. */
const SUGGESTED_NAMES = ['Gym', 'Home'];

function itemCount(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`;
}

/** What a place's card says about its equipment. */
function equipmentSummary(location: TrainingLocation, data: GymsData): string {
  const configured = activeInstancesAt(data.instances, location.id).length;
  const legacy = legacyEquipmentToConfigure(location, data.instances, data.definitions).length;
  if (configured > 0) {
    return legacy > 0
      ? `${itemCount(configured, 'equipment item')} · ${legacy} legacy to configure`
      : itemCount(configured, 'equipment item');
  }
  return legacy > 0 ? `${itemCount(legacy, 'legacy item')} to configure` : 'No equipment yet';
}

function AddPlaceForm({
  data,
  onAdd,
}: {
  data: GymsData;
  onAdd: (name: string) => Promise<string | null>;
}) {
  const uid = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const noPlaces = data.locations.every((l) => l.deleted_at !== null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const message = await onAdd(name);
    setError(message);
    if (!message) setName('');
  }

  return (
    <form className="atlas-gyms__add" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <label htmlFor={`${uid}-name`}>Add a place</label>
      <div className="atlas-gyms__add-row">
        <input
          id={`${uid}-name`}
          type="text"
          autoComplete="off"
          value={name}
          placeholder={noPlaces ? 'Main Gym' : 'Hotel'}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${uid}-error` : undefined}
        />
        <button type="submit" className="atlas-btn atlas-btn--primary">
          Add place
        </button>
      </div>
      {error && (
        <p id={`${uid}-error`} className="atlas-field__error" role="alert">
          {error}
        </p>
      )}
      {noPlaces && (
        <div className="atlas-gyms__suggestions">
          <span className="atlas-field__hint">Or start from:</span>
          {SUGGESTED_NAMES.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="atlas-btn atlas-btn--secondary"
              onClick={() => {
                setName(suggestion);
                setError(null);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

/**
 * vNext Handoff 04B. More -> Gyms & Equipment: the places the owner trains and
 * what each has. Replaces the old comma-separated "Equipment / Places" screen;
 * the same `TrainingLocation` rows, now with a default, archiving, and
 * structured equipment (exact loads, ranges, a maximum) behind each place.
 *
 * Nothing here is required. A place can be only a name; a workout can start
 * with no places at all.
 */
export function GymsScreen({ onBack }: GymsScreenProps) {
  const { storage, data, reload } = useGymsData();
  const [openId, setOpenId] = useState<string | null>(null);

  // Pre-v1.0.0 device-local profiles become places the first time this opens.
  useEffect(() => {
    if (!storage) return;
    void migrateLegacyEquipmentProfiles(storage).then((changed) => {
      if (changed) void reload();
    });
  }, [storage, reload]);

  if (!storage || !data) {
    return (
      <div className="atlas-empty-screen">
        <h1>Gyms &amp; Equipment</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (openId) {
    return (
      <LocationDetail
        storage={storage}
        data={data}
        locationId={openId}
        reload={reload}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const active = activeLocations(data.locations);
  const archived = archivedLocations(data.locations);

  async function handleAdd(name: string): Promise<string | null> {
    if (!storage) return null;
    const result = await addLocation(storage, name, data?.locations ?? []);
    if (!result.ok) return result.error;
    await reload();
    return null;
  }

  return (
    <div className="atlas-gyms">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Gyms &amp; Equipment</h1>
      <p className="atlas-gyms__intro">
        Where you train and what each place has. All optional &mdash; you can start a workout
        without any of it.
      </p>

      {active.length === 0 ? (
        <section className="atlas-panel atlas-gyms__empty">
          <h2>No places yet</h2>
          <p>
            Add where you train &mdash; a gym, home, a hotel. ATLAS then remembers which machine you
            used and keeps each one&rsquo;s numbers apart.
          </p>
        </section>
      ) : (
        <ul className="atlas-gyms__cards" aria-label="Places">
          {active.map((location) => (
            <li key={location.id}>
              <button
                type="button"
                className="atlas-gyms__card"
                onClick={() => setOpenId(location.id)}
              >
                <span className="atlas-gyms__card-main">
                  <span className="atlas-gyms__card-name">{location.name}</span>
                  {location.is_default && (
                    <span className="atlas-badge atlas-badge--accent">Default</span>
                  )}
                </span>
                <span className="atlas-gyms__card-meta">{equipmentSummary(location, data)}</span>
                <span className="atlas-gyms__chevron" aria-hidden="true">
                  &rsaquo;
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <AddPlaceForm data={data} onAdd={handleAdd} />

      {archived.length > 0 && (
        <details className="atlas-gyms__archived">
          <summary>Archived places ({archived.length})</summary>
          <ul className="atlas-gyms__list">
            {archived.map((location) => (
              <li key={location.id} className="atlas-gyms__legacy-row">
                <button
                  type="button"
                  className="atlas-gyms__row"
                  onClick={() => setOpenId(location.id)}
                >
                  <span className="atlas-gyms__row-name">
                    {location.name} <span className="atlas-badge">Archived</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="atlas-btn atlas-btn--secondary"
                  aria-label={`Restore ${location.name}`}
                  onClick={async () => {
                    await restoreLocationById(storage, location);
                    await reload();
                  }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
