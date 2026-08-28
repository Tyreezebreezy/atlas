import { useState, type FormEvent } from 'react';
import { createCustomExercise } from '@atlas/exercise-library';
import type { Exercise, MeasurementType } from '@atlas/data-model';

interface CustomExerciseFormProps {
  onCreated: (exercise: Exercise) => void;
  onCancel: () => void;
}

// Human-readable labels only -- never expose the internal enum values.
// 'reps' and 'distance_time' exist in the type but aren't meaningfully
// distinct from these four for a simple creation form (see docs/PRS.md
// "Bodyweight exercise path"), so they're not offered here.
const MEASUREMENT_TYPE_OPTIONS: { value: MeasurementType; label: string }[] = [
  { value: 'reps_weight', label: 'Weight + Reps' },
  { value: 'reps_bodyweight', label: 'Bodyweight Reps' },
  { value: 'time', label: 'Time' },
  { value: 'distance', label: 'Distance' },
];

export function CustomExerciseForm({ onCreated, onCancel }: CustomExerciseFormProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [equipment, setEquipment] = useState('');
  const [targetMuscle, setTargetMuscle] = useState('');
  const [measurementType, setMeasurementType] = useState<MeasurementType>('reps_weight');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const exercise = createCustomExercise({
      name: name.trim(),
      category: category.trim() || null,
      equipment: equipment
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      targetMuscle: targetMuscle.trim() || null,
      secondaryMuscles: [],
      instructions: [],
      measurementType,
    });
    onCreated(exercise);
  }

  return (
    <form className="atlas-custom-exercise-form" onSubmit={handleSubmit}>
      <h1>Create Custom Exercise</h1>

      <label htmlFor="ce-name">Name</label>
      <input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <label htmlFor="ce-category">Body part / category</label>
      <input id="ce-category" value={category} onChange={(e) => setCategory(e.target.value)} />

      <label htmlFor="ce-equipment">Equipment (comma-separated)</label>
      <input id="ce-equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} />

      <label htmlFor="ce-target">Target muscle</label>
      <input
        id="ce-target"
        value={targetMuscle}
        onChange={(e) => setTargetMuscle(e.target.value)}
      />

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

      <div className="atlas-custom-exercise-form__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
