import { useEffect, useId, useState } from 'react';
import {
  activeInstancesAt,
  archivedInstancesAt,
  describeLoads,
  equipmentTypeName,
  isLocationActive,
  legacyEquipmentToConfigure,
  locationUsage,
} from '@atlas/equipment-engine';
import type { GymEquipmentInstance, WorkoutSession } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import {
  archiveEquipment,
  archiveLocationById,
  deleteUnusedEquipment,
  deleteUnusedLocation,
  makeDefaultLocation,
  restoreEquipment,
  restoreLocationById,
  saveLocationDetails,
  type GymsData,
} from './equipmentActions';
import { EquipmentForm } from './EquipmentForm';

interface LocationDetailProps {
  storage: AtlasStorage;
  data: GymsData;
  locationId: string;
  reload: () => Promise<void>;
  onBack: () => void;
}

type Editing = { kind: 'new'; legacyName?: string } | { kind: 'edit'; instanceId: string } | null;

/**
 * vNext Handoff 04B. One place: its name and notes, whether it is the default,
 * the structured equipment configured there, and any legacy equipment names
 * still waiting to be configured. Everything is optional -- a place that is only
 * a name is complete.
 *
 * Archive is the everyday way to retire a place or a machine (history keeps its
 * name). Delete exists only for something nothing refers to, and asks first.
 */
export function LocationDetail({ storage, data, locationId, reload, onBack }: LocationDetailProps) {
  const uid = useId();
  const location = data.locations.find((l) => l.id === locationId);
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState(location?.name ?? '');
  const [note, setNote] = useState(location?.note ?? '');
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDeletePlace, setConfirmDeletePlace] = useState(false);
  const [confirmDeleteEquipment, setConfirmDeleteEquipment] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storage.workoutSessions.getAll().then((all) => {
      if (!cancelled) setSessions(all);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  if (!location) {
    return (
      <div className="atlas-gyms">
        <button type="button" className="atlas-template-editor__back" onClick={onBack}>
          &larr; Gyms &amp; Equipment
        </button>
        <p>That place no longer exists.</p>
      </div>
    );
  }

  const active = isLocationActive(location);
  const equipment = activeInstancesAt(data.instances, location.id);
  const retired = archivedInstancesAt(data.instances, location.id);
  const legacy = legacyEquipmentToConfigure(location, data.instances, data.definitions);
  const usage = locationUsage(location.id, sessions ?? [], data.instances);
  const typeOf = (instance: GymEquipmentInstance) =>
    equipmentTypeName(
      data.definitions.find((d) => d.id === instance.equipment_definition_id)?.type ?? 'other',
    );
  const editedInstance =
    editing?.kind === 'edit' ? data.instances.find((i) => i.id === editing.instanceId) : undefined;
  const dirty = name.trim() !== location.name || (note.trim() || null) !== location.note;

  async function afterWrite() {
    await reload();
  }

  async function handleSaveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!location) return;
    const result = await saveLocationDetails(storage, location, { name, note }, data.locations);
    if (!result.ok) {
      setDetailsError(result.error);
      setSaved(false);
      return;
    }
    setDetailsError(null);
    setSaved(true);
    await afterWrite();
  }

  async function handleDeletePlace() {
    if (!location) return;
    const result = await deleteUnusedLocation(storage, location, sessions ?? [], data.instances);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    await afterWrite();
    onBack();
  }

  async function handleDeleteEquipment(instance: GymEquipmentInstance) {
    const result = await deleteUnusedEquipment(storage, instance, sessions ?? [], data.contexts);
    setConfirmDeleteEquipment(null);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setDeleteError(null);
    setEditing(null);
    await afterWrite();
  }

  // ---- adding / editing equipment fills the screen, so the form has room to breathe on a phone ----
  if (editing) {
    const instance = editedInstance;
    return (
      <div className="atlas-gyms">
        <button
          type="button"
          className="atlas-template-editor__back"
          onClick={() => setEditing(null)}
        >
          &larr; {location.name}
        </button>
        <section className="atlas-panel">
          <EquipmentForm
            storage={storage}
            data={data}
            locationId={location.id}
            instance={instance}
            legacyName={editing.kind === 'new' ? editing.legacyName : undefined}
            onSaved={async () => {
              setEditing(null);
              await afterWrite();
            }}
            onCancel={() => setEditing(null)}
          />
        </section>
        {instance && (
          <section className="atlas-gyms__danger" aria-label="Retire this equipment">
            {instance.archived_at ? (
              <button
                type="button"
                className="atlas-btn atlas-btn--secondary"
                onClick={async () => {
                  await restoreEquipment(storage, instance);
                  setEditing(null);
                  await afterWrite();
                }}
              >
                Restore equipment
              </button>
            ) : (
              <>
                <p className="atlas-field__hint">
                  Archiving hides it from the workout picker. Past workouts keep its name.
                </p>
                <button
                  type="button"
                  className="atlas-btn atlas-btn--tertiary"
                  onClick={async () => {
                    await archiveEquipment(storage, instance);
                    setEditing(null);
                    await afterWrite();
                  }}
                >
                  Archive equipment
                </button>
              </>
            )}
            {confirmDeleteEquipment === instance.id ? (
              <div
                className="atlas-inline-confirm"
                role="group"
                aria-label={`Delete ${instance.label}?`}
              >
                <p>Delete {instance.label}? This can&rsquo;t be undone.</p>
                <button
                  type="button"
                  className="atlas-btn atlas-btn--secondary"
                  onClick={() => setConfirmDeleteEquipment(null)}
                >
                  Keep it
                </button>
                <button
                  type="button"
                  className="atlas-btn atlas-btn--primary"
                  onClick={() => void handleDeleteEquipment(instance)}
                >
                  Delete {instance.label}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="atlas-btn atlas-btn--quiet-danger"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDeleteEquipment(instance.id);
                }}
              >
                Delete equipment…
              </button>
            )}
            {deleteError && (
              <p className="atlas-field__error" role="alert">
                {deleteError}
              </p>
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="atlas-gyms">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Gyms &amp; Equipment
      </button>

      <header className="atlas-gyms__title">
        <h1>{location.name}</h1>
        {location.is_default && <span className="atlas-badge atlas-badge--accent">Default</span>}
        {!active && <span className="atlas-badge">Archived</span>}
      </header>

      {!active && (
        <section className="atlas-panel atlas-gyms__notice">
          <p>
            Archived. This place is hidden from the workout picker; the workouts you did here keep
            its name.
          </p>
          <button
            type="button"
            className="atlas-btn atlas-btn--secondary"
            onClick={async () => {
              await restoreLocationById(storage, location);
              await afterWrite();
            }}
          >
            Restore place
          </button>
        </section>
      )}

      <section className="atlas-panel" aria-labelledby={`${uid}-details`}>
        <h2 id={`${uid}-details`}>Details</h2>
        <form
          className="atlas-gyms__details"
          onSubmit={(e) => void handleSaveDetails(e)}
          noValidate
        >
          <div className="atlas-field">
            <label htmlFor={`${uid}-name`}>Name</label>
            <input
              id={`${uid}-name`}
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              aria-invalid={detailsError ? true : undefined}
              aria-describedby={detailsError ? `${uid}-name-error` : undefined}
            />
            {detailsError && (
              <p id={`${uid}-name-error`} className="atlas-field__error" role="alert">
                {detailsError}
              </p>
            )}
          </div>
          <div className="atlas-field">
            <label htmlFor={`${uid}-note`}>Notes (optional)</label>
            <input
              id={`${uid}-note`}
              type="text"
              autoComplete="off"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="atlas-gyms__actions">
            <button type="submit" className="atlas-btn atlas-btn--secondary" disabled={!dirty}>
              Save changes
            </button>
            <span className="atlas-gyms__saved" role="status">
              {saved && !dirty ? 'Saved' : ''}
            </span>
          </div>
        </form>
      </section>

      {active && (
        <section className="atlas-gyms__place-actions" aria-label="Place options">
          {location.is_default ? (
            <p className="atlas-field__hint">
              A new workout starts here unless you pick another place.
            </p>
          ) : (
            <button
              type="button"
              className="atlas-btn atlas-btn--secondary"
              onClick={async () => {
                await makeDefaultLocation(storage, data.locations, location.id);
                await afterWrite();
              }}
            >
              Make default
            </button>
          )}
        </section>
      )}

      <section className="atlas-panel" aria-labelledby={`${uid}-equipment`}>
        <h2 id={`${uid}-equipment`}>
          Equipment{equipment.length > 0 ? ` (${equipment.length})` : ''}
        </h2>
        {equipment.length === 0 ? (
          <p className="atlas-field__hint">
            Nothing configured. You can train here without it &mdash; add equipment when you want
            ATLAS to respect its loads or keep one machine&rsquo;s numbers apart from
            another&rsquo;s.
          </p>
        ) : (
          <ul className="atlas-gyms__list">
            {equipment.map((instance) => (
              <li key={instance.id}>
                <button
                  type="button"
                  className="atlas-gyms__row"
                  onClick={() => setEditing({ kind: 'edit', instanceId: instance.id })}
                >
                  <span className="atlas-gyms__row-name">{instance.label}</span>
                  <span className="atlas-gyms__row-meta">
                    {typeOf(instance)} &middot; {describeLoads(instance)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="atlas-btn atlas-btn--primary"
          onClick={() => setEditing({ kind: 'new' })}
        >
          Add equipment
        </button>
      </section>

      {legacy.length > 0 && (
        <section className="atlas-panel" aria-labelledby={`${uid}-legacy`}>
          <h2 id={`${uid}-legacy`}>Legacy equipment</h2>
          <p className="atlas-field__hint">
            Listed here before ATLAS tracked loads. Configure the ones you want it to respect;
            nothing is assumed about their weights.
          </p>
          <ul className="atlas-gyms__list">
            {legacy.map((item) => (
              <li key={item} className="atlas-gyms__legacy-row">
                <span className="atlas-gyms__row-name">{item}</span>
                <button
                  type="button"
                  className="atlas-btn atlas-btn--secondary"
                  onClick={() => setEditing({ kind: 'new', legacyName: item })}
                  aria-label={`Configure ${item}`}
                >
                  Configure
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {retired.length > 0 && (
        <details className="atlas-gyms__archived">
          <summary>Archived equipment ({retired.length})</summary>
          <ul className="atlas-gyms__list">
            {retired.map((instance) => (
              <li key={instance.id} className="atlas-gyms__legacy-row">
                <span className="atlas-gyms__row-name">
                  {instance.label} <span className="atlas-badge">Archived</span>
                </span>
                <button
                  type="button"
                  className="atlas-btn atlas-btn--secondary"
                  onClick={async () => {
                    await restoreEquipment(storage, instance);
                    await afterWrite();
                  }}
                  aria-label={`Restore ${instance.label}`}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="atlas-gyms__danger" aria-label="Retire this place">
        {active && (
          <>
            <p className="atlas-field__hint">
              Archiving hides this place from the workout picker. Past workouts here keep its name.
            </p>
            <button
              type="button"
              className="atlas-btn atlas-btn--tertiary"
              onClick={async () => {
                await archiveLocationById(storage, location);
                await afterWrite();
              }}
            >
              Archive place
            </button>
          </>
        )}
        {sessions &&
          usage.sessions === 0 &&
          usage.equipment === 0 &&
          (confirmDeletePlace ? (
            <div
              className="atlas-inline-confirm"
              role="group"
              aria-label={`Delete ${location.name}?`}
            >
              <p>Delete {location.name}? This can&rsquo;t be undone.</p>
              <button
                type="button"
                className="atlas-btn atlas-btn--secondary"
                onClick={() => setConfirmDeletePlace(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="atlas-btn atlas-btn--primary"
                onClick={() => void handleDeletePlace()}
              >
                Delete {location.name}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="atlas-btn atlas-btn--quiet-danger"
              onClick={() => setConfirmDeletePlace(true)}
            >
              Delete place…
            </button>
          ))}
        {deleteError && (
          <p className="atlas-field__error" role="alert">
            {deleteError}
          </p>
        )}
      </section>
    </div>
  );
}
