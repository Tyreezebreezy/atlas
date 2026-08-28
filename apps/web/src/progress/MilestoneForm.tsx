import { useState, type FormEvent } from 'react';
import { createMilestone } from '@atlas/milestone-engine';
import type { Exercise, Milestone, MilestoneDimension } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import { ExercisePicker } from '../program/ExercisePicker';

interface MilestoneFormProps {
  storage: AtlasStorage;
  onCreated: (milestone: Milestone) => void;
  onCancel: () => void;
}

// Human-readable labels only -- never expose the internal enum values, same
// rule as CustomExerciseForm's measurement-type select.
const DIMENSION_OPTIONS: { value: MilestoneDimension; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'reps', label: 'Reps' },
  { value: 'weight_and_reps', label: 'Weight for Reps' },
  { value: 'volume', label: 'Total Volume (one session)' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance', label: 'Distance' },
  { value: 'bodyweight_multiplier', label: 'Bodyweight Multiple' },
  { value: 'custom', label: 'Custom Formula' },
];

function parseNum(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export function MilestoneForm({ storage, onCreated, onCancel }: MilestoneFormProps) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [title, setTitle] = useState('');
  const [dimension, setDimension] = useState<MilestoneDimension>('weight');
  const [targetWeight, setTargetWeight] = useState('');
  const [targetReps, setTargetReps] = useState('');
  const [targetVolume, setTargetVolume] = useState('');
  const [targetDurationSeconds, setTargetDurationSeconds] = useState('');
  const [targetDistanceMeters, setTargetDistanceMeters] = useState('');
  const [referenceValue, setReferenceValue] = useState('');
  const [multiplier, setMultiplier] = useState('');

  if (!exercise) {
    return <ExercisePicker storage={storage} onPick={setExercise} onCancel={onCancel} />;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !exercise) return;
    onCreated(
      createMilestone({
        title: title.trim(),
        exerciseId: exercise.id,
        dimension,
        targetWeight: parseNum(targetWeight),
        targetReps: parseNum(targetReps),
        targetVolume: parseNum(targetVolume),
        targetDurationSeconds: parseNum(targetDurationSeconds),
        targetDistanceMeters: parseNum(targetDistanceMeters),
        referenceValue: dimension === 'custom' ? parseNum(referenceValue) : null,
        multiplier: parseNum(multiplier),
      }),
    );
  }

  return (
    <form className="atlas-milestone-form" onSubmit={handleSubmit}>
      <h1>New Milestone</h1>

      <div className="atlas-milestone-form__exercise">
        <span>{exercise.name}</span>
        <button type="button" onClick={() => setExercise(null)}>
          Change
        </button>
      </div>

      <label htmlFor="ms-title">Title</label>
      <input
        id="ms-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. 225 lb Bench Press"
        required
      />

      <label htmlFor="ms-dimension">Type</label>
      <select
        id="ms-dimension"
        value={dimension}
        onChange={(e) => setDimension(e.target.value as MilestoneDimension)}
      >
        {DIMENSION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {dimension === 'weight' && (
        <>
          <label htmlFor="ms-weight">Target weight (lb)</label>
          <input
            id="ms-weight"
            type="number"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            required
          />
        </>
      )}

      {dimension === 'reps' && (
        <>
          <label htmlFor="ms-reps">Target reps</label>
          <input
            id="ms-reps"
            type="number"
            value={targetReps}
            onChange={(e) => setTargetReps(e.target.value)}
            required
          />
        </>
      )}

      {dimension === 'weight_and_reps' && (
        <>
          <label htmlFor="ms-weight2">Target weight (lb)</label>
          <input
            id="ms-weight2"
            type="number"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            required
          />
          <label htmlFor="ms-reps2">Target reps</label>
          <input
            id="ms-reps2"
            type="number"
            value={targetReps}
            onChange={(e) => setTargetReps(e.target.value)}
            required
          />
        </>
      )}

      {dimension === 'volume' && (
        <>
          <label htmlFor="ms-volume">Target volume (lb)</label>
          <input
            id="ms-volume"
            type="number"
            value={targetVolume}
            onChange={(e) => setTargetVolume(e.target.value)}
            required
          />
        </>
      )}

      {dimension === 'duration' && (
        <>
          <label htmlFor="ms-duration">Target duration (seconds)</label>
          <input
            id="ms-duration"
            type="number"
            value={targetDurationSeconds}
            onChange={(e) => setTargetDurationSeconds(e.target.value)}
            required
          />
        </>
      )}

      {dimension === 'distance' && (
        <>
          <label htmlFor="ms-distance">Target distance (meters)</label>
          <input
            id="ms-distance"
            type="number"
            value={targetDistanceMeters}
            onChange={(e) => setTargetDistanceMeters(e.target.value)}
            required
          />
        </>
      )}

      {dimension === 'custom' && (
        <>
          <label htmlFor="ms-reference">Reference value</label>
          <input
            id="ms-reference"
            type="number"
            value={referenceValue}
            onChange={(e) => setReferenceValue(e.target.value)}
            required
          />
          <label htmlFor="ms-multiplier">Multiplier</label>
          <input
            id="ms-multiplier"
            type="number"
            step="0.01"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            required
          />
        </>
      )}

      {dimension === 'bodyweight_multiplier' && (
        <>
          <label htmlFor="ms-bw-multiplier">Multiplier (e.g. 2 for 2&times; bodyweight)</label>
          <input
            id="ms-bw-multiplier"
            type="number"
            step="0.01"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            required
          />
          <p className="atlas-milestone-form__hint">
            Resolved against your logged bodyweight automatically -- log a weight entry under Body
            first.
          </p>
        </>
      )}

      <div className="atlas-milestone-form__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
