import { useMemo, useState, type FormEvent } from 'react';
import { createCustomExercise } from '@atlas/exercise-library';
import {
  getMuscle,
  groupName,
  muscleName,
  musclesForSvgId,
  musclesInGroup,
  MUSCLE_GROUPS,
  MUSCLE_TAXONOMY_VERSION,
} from '@atlas/anatomy';
import type { Exercise, MeasurementType } from '@atlas/data-model';
import { BodyMap } from '../anatomy/BodyMap';

interface CustomExerciseFormProps {
  onCreated: (exercise: Exercise) => void;
  onCancel: () => void;
}

// Human-readable labels only -- never expose the internal enum values.
const MEASUREMENT_TYPE_OPTIONS: { value: MeasurementType; label: string }[] = [
  { value: 'reps_weight', label: 'Weight + Reps' },
  { value: 'reps_bodyweight', label: 'Bodyweight Reps' },
  { value: 'time', label: 'Time' },
  { value: 'distance', label: 'Distance' },
];

type MuscleMode = 'primary' | 'secondary';

export function CustomExerciseForm({ onCreated, onCancel }: CustomExerciseFormProps) {
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState('');
  const [measurementType, setMeasurementType] = useState<MeasurementType>('reps_weight');
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [mode, setMode] = useState<MuscleMode>('primary');

  const targetIds = mode === 'primary' ? primary : secondary;
  const setTargetIds = mode === 'primary' ? setPrimary : setSecondary;

  function toggleMuscleIds(ids: string[]) {
    const current = new Set(targetIds);
    const allPresent = ids.every((id) => current.has(id));
    const next = new Set(current);
    if (allPresent) {
      for (const id of ids) next.delete(id);
    } else {
      for (const id of ids) next.add(id);
    }
    setTargetIds([...next]);
  }

  const bodyStates = useMemo(
    () => [
      ...primary.map((id) => ({ muscleId: id, state: 'primary' as const })),
      ...secondary.map((id) => ({ muscleId: id, state: 'secondary' as const })),
    ],
    [primary, secondary],
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    // Legacy `category` (used by the older muscle-group analytics) is derived
    // from the first primary muscle's group so custom exercises never land as
    // "Uncategorized"; the structured muscle_map is the source of truth.
    const category =
      primary.length > 0 ? groupName(getMuscle(primary[0]!)!.group_id) : null;
    const exercise = createCustomExercise({
      name: name.trim(),
      category,
      equipment: equipment
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      targetMuscle: primary.length > 0 ? primary[0]! : null,
      secondaryMuscles: [],
      instructions: [],
      measurementType,
      muscleMap:
        primary.length > 0 || secondary.length > 0
          ? {
              primary,
              secondary,
              provenance: 'user',
              taxonomy_version: MUSCLE_TAXONOMY_VERSION,
            }
          : null,
    });
    onCreated(exercise);
  }

  return (
    <form className="atlas-custom-exercise-form" onSubmit={handleSubmit}>
      <h1>Create Custom Exercise</h1>

      <label htmlFor="ce-name">Name</label>
      <input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <label htmlFor="ce-equipment">Equipment (comma-separated)</label>
      <input id="ce-equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} />

      <label htmlFor="ce-measurement-type">How is this logged?</label>
      <select
        id="ce-measurement-type"
        value={measurementType}
        onChange={(e) => setMeasurementType(e.target.value as MeasurementType)}
      >
        {MEASUREMENT_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <h2>Muscles</h2>
      <div className="atlas-custom-exercise-form__mode" role="group" aria-label="Muscle role">
        <button
          type="button"
          className={
            mode === 'primary'
              ? 'atlas-custom-exercise-form__mode-button atlas-custom-exercise-form__mode-button--active'
              : 'atlas-custom-exercise-form__mode-button'
          }
          aria-pressed={mode === 'primary'}
          onClick={() => setMode('primary')}
        >
          Primary
        </button>
        <button
          type="button"
          className={
            mode === 'secondary'
              ? 'atlas-custom-exercise-form__mode-button atlas-custom-exercise-form__mode-button--active'
              : 'atlas-custom-exercise-form__mode-button'
          }
          aria-pressed={mode === 'secondary'}
          onClick={() => setMode('secondary')}
        >
          Secondary
        </button>
      </div>
      <p className="atlas-custom-exercise-form__hint">
        Tap a muscle to add or remove it as {mode}. Use Front / Back to see both sides.
      </p>

      <BodyMap
        states={bodyStates}
        onSelectRegion={(svgId) => toggleMuscleIds(musclesForSvgId(svgId))}
      />

      <div className="atlas-custom-exercise-form__groups">
        {MUSCLE_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className="atlas-custom-exercise-form__group"
            onClick={() => toggleMuscleIds(musclesInGroup(group.id).map((m) => m.id))}
          >
            {group.name}
          </button>
        ))}
      </div>

      <p className="atlas-custom-exercise-form__summary">
        <strong>Primary:</strong> {primary.length > 0 ? primary.map(muscleName).join(', ') : 'None'}
        <br />
        <strong>Secondary:</strong>{' '}
        {secondary.length > 0 ? secondary.map(muscleName).join(', ') : 'None'}
      </p>

      <div className="atlas-custom-exercise-form__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
