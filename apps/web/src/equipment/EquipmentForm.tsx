import { useId, useState } from 'react';
import {
  draftFromInstance,
  EMPTY_LOAD_DRAFT,
  EQUIPMENT_TYPES,
  equipmentTypeFromText,
  OTHER_EQUIPMENT_TYPE,
  type LoadConfigDraft,
  type LoadConfigField,
  type LoadConfigMode,
} from '@atlas/equipment-engine';
import type { GymEquipmentInstance } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import { saveEquipment, type GymsData } from './equipmentActions';

interface EquipmentFormProps {
  storage: AtlasStorage;
  data: GymsData;
  locationId: string;
  /** Edit this equipment; omit to add new. */
  instance?: GymEquipmentInstance;
  /** Pre-fill the name and a plausible kind from a legacy equipment string. Never pre-fills loads. */
  legacyName?: string;
  /** Pre-select a kind when adding (e.g. what the exercise on screen calls for), if it is one of the known kinds. */
  suggestedType?: string;
  /** Name and kind only -- for adding equipment in the middle of a workout. Loads can be added later in Gyms & Equipment. */
  compact?: boolean;
  onSaved: (instance: GymEquipmentInstance, created: boolean) => void;
  onCancel: () => void;
}

const MODES: { mode: LoadConfigMode; label: string }[] = [
  { mode: 'unknown', label: 'Not sure' },
  { mode: 'exact', label: 'Exact list' },
  { mode: 'range', label: 'Range' },
  { mode: 'max', label: 'Max only' },
];

const MODE_HELP: Record<LoadConfigMode, string> = {
  unknown: "That's fine. ATLAS won't assume a maximum, and won't hold back a recommendation.",
  exact: 'List every weight it offers. Gaps are fine: 10, 15, 20, 25, 30, 40, 50.',
  range:
    'A lightest load, a heaviest load and the step between them, like 20 to 170 in steps of 10.',
  max: "ATLAS won't guess the loads below it. It only stops recommending anything heavier.",
};

function initialType(props: EquipmentFormProps): { type: string; otherName: string } {
  if (props.instance) {
    const definition = props.data.definitions.find(
      (d) => d.id === props.instance?.equipment_definition_id,
    );
    if (definition) {
      return {
        type: definition.type,
        otherName: definition.type === OTHER_EQUIPMENT_TYPE ? definition.name : '',
      };
    }
    return { type: OTHER_EQUIPMENT_TYPE, otherName: '' };
  }
  if (props.legacyName) {
    const type = equipmentTypeFromText(props.legacyName);
    return { type, otherName: type === OTHER_EQUIPMENT_TYPE ? props.legacyName.trim() : '' };
  }
  const suggested =
    props.suggestedType && EQUIPMENT_TYPES.some((t) => t.type === props.suggestedType);
  return { type: suggested ? (props.suggestedType as string) : '', otherName: '' };
}

/**
 * vNext Handoff 04B. Adds or edits one piece of equipment at a place. The same
 * form serves Gyms & Equipment (full: name, kind, loads, notes) and a workout
 * in progress (compact: name and kind). Every message is tied to its own input
 * -- `aria-invalid` plus `aria-describedby` -- so a screen reader reaches the
 * reason at the field, and nothing is conveyed by color alone.
 *
 * Loads are typed as text and parsed by `@atlas/equipment-engine`, which owns
 * what is valid; nothing here decides. Weights are lb throughout ATLAS.
 */
export function EquipmentForm(props: EquipmentFormProps) {
  const { storage, data, locationId, instance, legacyName, compact, onSaved, onCancel } = props;
  const uid = useId();
  const start = initialType(props);

  const [label, setLabel] = useState(instance?.label ?? legacyName?.trim() ?? '');
  const [type, setType] = useState(start.type);
  const [otherName, setOtherName] = useState(start.otherName);
  const [loads, setLoads] = useState<LoadConfigDraft>(
    instance ? draftFromInstance(instance) : EMPTY_LOAD_DRAFT,
  );
  const [notes, setNotes] = useState(instance?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    label?: string;
    type?: string;
    otherName?: string;
    loads?: Partial<Record<LoadConfigField, string>>;
  }>({});

  const id = (name: string) => `${uid}-${name}`;
  // A message goes away as soon as the field it is about is edited -- a stale error under a fixed field is noise.
  const clearError = (key: 'label' | 'type' | 'otherName' | 'loads') =>
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  const setLoad = (patch: Partial<LoadConfigDraft>) => {
    setLoads((current) => ({ ...current, ...patch }));
    clearError('loads');
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const result = await saveEquipment(storage, data, {
      locationId,
      instanceId: instance?.id ?? null,
      label,
      type,
      otherName,
      loads: compact ? EMPTY_LOAD_DRAFT : loads,
      notes: compact ? '' : notes,
      legacyEquipment: legacyName ?? null,
    });
    setSaving(false);
    if (result.ok) onSaved(result.instance, result.created);
    else setErrors(result.errors);
  }

  const field = (name: string, error: string | undefined, hasHint = false) => ({
    'aria-invalid': error ? true : undefined,
    'aria-describedby':
      [hasHint ? id(`${name}-hint`) : null, error ? id(`${name}-error`) : null]
        .filter(Boolean)
        .join(' ') || undefined,
  });
  const errorText = (name: string, error: string | undefined) =>
    error ? (
      <p id={id(`${name}-error`)} className="atlas-field__error" role="alert">
        {error}
      </p>
    ) : null;

  const loadError = (key: LoadConfigField) => errors.loads?.[key];

  return (
    <form
      className="atlas-equipment-form"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-labelledby={id('title')}
    >
      <h3 id={id('title')}>
        {instance
          ? 'Edit equipment'
          : legacyName
            ? `Configure ${legacyName.trim()}`
            : 'Add equipment'}
      </h3>

      <div className="atlas-field">
        <label htmlFor={id('label')}>Name</label>
        <input
          id={id('label')}
          type="text"
          autoComplete="off"
          value={label}
          placeholder="Chest Press #1"
          onChange={(e) => {
            setLabel(e.target.value);
            clearError('label');
          }}
          {...field('label', errors.label, true)}
        />
        <p id={id('label-hint')} className="atlas-field__hint">
          Name each machine so two of a kind stay apart.
        </p>
        {errorText('label', errors.label)}
      </div>

      <div className="atlas-field">
        <label htmlFor={id('type')}>Kind</label>
        <select
          id={id('type')}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            clearError('type');
          }}
          {...field('type', errors.type)}
        >
          <option value="">Choose a kind…</option>
          {EQUIPMENT_TYPES.map((option) => (
            <option key={option.type} value={option.type}>
              {option.name}
            </option>
          ))}
          <option value={OTHER_EQUIPMENT_TYPE}>Other…</option>
        </select>
        {errorText('type', errors.type)}
      </div>

      {type === OTHER_EQUIPMENT_TYPE && (
        <div className="atlas-field">
          <label htmlFor={id('other')}>What kind?</label>
          <input
            id={id('other')}
            type="text"
            autoComplete="off"
            value={otherName}
            placeholder="Pec deck"
            onChange={(e) => {
              setOtherName(e.target.value);
              clearError('otherName');
            }}
            {...field('other', errors.otherName)}
          />
          {errorText('other', errors.otherName)}
        </div>
      )}

      {!compact && (
        <fieldset className="atlas-field atlas-equipment-form__loads">
          <legend>Available loads (lb)</legend>
          <div className="atlas-segmented" role="group" aria-label="How to describe the loads">
            {MODES.map(({ mode, label: text }) => (
              <button
                key={mode}
                type="button"
                className="atlas-segmented__option"
                aria-pressed={loads.mode === mode}
                onClick={() => setLoad({ mode })}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="atlas-field__hint">{MODE_HELP[loads.mode]}</p>

          {loads.mode === 'exact' && (
            <div className="atlas-field">
              <label htmlFor={id('exact')}>Loads</label>
              <textarea
                id={id('exact')}
                rows={3}
                value={loads.exact}
                placeholder="10, 15, 20, 25, 30, 40, 50"
                onChange={(e) => setLoad({ exact: e.target.value })}
                {...field('exact', loadError('exact'))}
              />
              {errorText('exact', loadError('exact'))}
            </div>
          )}

          {loads.mode === 'range' && (
            <div className="atlas-equipment-form__range">
              {(
                [
                  ['min', 'Lightest', '20'],
                  ['max', 'Heaviest', '170'],
                  ['increment', 'Step', '10'],
                ] as const
              ).map(([key, text, placeholder]) => (
                <div className="atlas-field" key={key}>
                  <label htmlFor={id(key)}>{text}</label>
                  <input
                    id={id(key)}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={loads[key]}
                    placeholder={placeholder}
                    onChange={(e) => setLoad({ [key]: e.target.value })}
                    {...field(key, loadError(key))}
                  />
                  {errorText(key, loadError(key))}
                </div>
              ))}
            </div>
          )}

          {loads.mode === 'max' && (
            <div className="atlas-field">
              <label htmlFor={id('max')}>Heaviest load</label>
              <input
                id={id('max')}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={loads.max}
                placeholder="170"
                onChange={(e) => setLoad({ max: e.target.value })}
                {...field('max', loadError('max'))}
              />
              {errorText('max', loadError('max'))}
            </div>
          )}
        </fieldset>
      )}

      {!compact && (
        <div className="atlas-field">
          <label htmlFor={id('notes')}>Notes (optional)</label>
          <input
            id={id('notes')}
            type="text"
            autoComplete="off"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}

      {compact && (
        <p className="atlas-field__hint">Add its loads later in More → Gyms &amp; Equipment.</p>
      )}

      <div className="atlas-equipment-form__actions">
        <button type="submit" className="atlas-btn atlas-btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save equipment'}
        </button>
        <button type="button" className="atlas-btn atlas-btn--tertiary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
