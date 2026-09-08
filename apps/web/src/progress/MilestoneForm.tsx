import { useState, type FormEvent } from 'react';
import { createMilestone } from '@atlas/milestone-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, Milestone, MilestoneDimension } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import { ExercisePicker } from '../program/ExercisePicker';

// Non-blocking guidance only -- an unusual combination is never prevented,
// just flagged, per the explicit "prefer hints over inflexible validation"
// instruction. Returns null when the dimension and the exercise's own
// measurement_type are compatible.
function dimensionMismatchHint(exercise: Exercise, dimension: MilestoneDimension): string | null {
  const type = exercise.measurement_type;
  const needsWeight =
    dimension === 'weight' ||
    dimension === 'weight_and_reps' ||
    dimension === 'volume' ||
    dimension === 'bodyweight_multiplier' ||
    dimension === 'custom';
  const needsReps = dimension === 'reps' || dimension === 'weight_and_reps';

  const displayName = formatExerciseName(exercise.name);
  if (needsWeight && type !== 'reps_weight') {
    return `${displayName} doesn't log a weight, so this milestone may never be achievable. "Reps" is usually the better fit for a bodyweight exercise.`;
  }
  if (dimension === 'duration' && type !== 'time' && type !== 'distance_time') {
    return `${displayName} doesn't log a duration, so this milestone may never be achievable.`;
  }
  if (dimension === 'distance' && type !== 'distance' && type !== 'distance_time') {
    return `${displayName} doesn't log a distance, so this milestone may never be achievable.`;
  }
  if (needsReps && (type === 'time' || type === 'distance')) {
    return `${displayName} is logged by ${type === 'time' ? 'duration' : 'distance'}, not reps, so this milestone may never be achievable.`;
  }
  return null;
}

interface MilestoneFormProps {
  storage: AtlasStorage;
  /** Present when editing an existing milestone; omitted when creating a new one. */
  existingMilestone?: Milestone;
  /** Required alongside `existingMilestone` -- the caller already has the
   * full exercise map loaded, so this form never needs its own fetch just
   * to resolve one id back to a name. */
  existingExercise?: Exercise;
  onSaved: (milestone: Milestone) => void;
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

export function MilestoneForm({
  storage,
  existingMilestone,
  existingExercise,
  onSaved,
  onCancel,
}: MilestoneFormProps) {
  const [exercise, setExercise] = useState<Exercise | null>(existingExercise ?? null);
  const [title, setTitle] = useState(existingMilestone?.title ?? '');
  const [dimension, setDimension] = useState<MilestoneDimension>(
    existingMilestone?.dimension ?? 'weight',
  );
  const [targetWeight, setTargetWeight] = useState(
    existingMilestone?.target_weight?.toString() ?? '',
  );
  const [targetReps, setTargetReps] = useState(existingMilestone?.target_reps?.toString() ?? '');
  const [targetVolume, setTargetVolume] = useState(
    existingMilestone?.target_volume?.toString() ?? '',
  );
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(
    existingMilestone?.target_duration_seconds?.toString() ?? '',
  );
  const [targetDistanceMeters, setTargetDistanceMeters] = useState(
    existingMilestone?.target_distance_meters?.toString() ?? '',
  );
  const [referenceValue, setReferenceValue] = useState(
    existingMilestone?.reference_value?.toString() ?? '',
  );
  const [multiplier, setMultiplier] = useState(existingMilestone?.multiplier?.toString() ?? '');

  if (!exercise) {
    return <ExercisePicker storage={storage} onPick={setExercise} onCancel={onCancel} />;
  }

  const mismatchHint = dimensionMismatchHint(exercise, dimension);
  const forksBuiltin = existingMilestone?.is_builtin ?? false;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !exercise) return;
    const fields = {
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
    };

    // createMilestone recomputes every target_* field consistently
    // (notably 'custom''s target_weight = referenceValue * multiplier) --
    // reused here rather than hand-mapping camelCase to snake_case a
    // second time for the in-place-edit path below.
    const recomputed = createMilestone(fields);

    if (existingMilestone && !forksBuiltin) {
      // In-place edit of an owner-created milestone: keep its identity and
      // history, take the freshly recomputed target fields.
      onSaved({
        ...recomputed,
        id: existingMilestone.id,
        created_at: existingMilestone.created_at,
        device_id: existingMilestone.device_id,
        active: existingMilestone.active,
        achieved_at: existingMilestone.achieved_at,
        origin_session_id: existingMilestone.origin_session_id,
        origin_set_id: existingMilestone.origin_set_id,
        version: existingMilestone.version + 1,
      });
      return;
    }

    // Either a brand-new milestone, or a substantial edit of an immutable
    // built-in template -- v0.2.3 Part F forks that into the owner's own
    // new custom milestone rather than rewriting the shared catalog entry
    // (the caller demotes the original built-in back to catalog-only once
    // it sees the saved milestone has a different id than what it passed in).
    onSaved(recomputed);
  }

  return (
    <form className="atlas-milestone-form" onSubmit={handleSubmit}>
      <h1>{existingMilestone ? 'Edit Milestone' : 'New Milestone'}</h1>
      {forksBuiltin && (
        <p className="atlas-milestone-form__hint">
          This built-in goal can't be changed directly -- saving creates your own copy with these
          values, and removes this one from your active goals.
        </p>
      )}

      <div className="atlas-milestone-form__exercise">
        <span>{formatExerciseName(exercise.name)}</span>
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

      {mismatchHint && <p className="atlas-milestone-form__warning">{mismatchHint}</p>}

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
