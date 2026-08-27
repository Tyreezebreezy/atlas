import { useState, type FormEvent } from 'react';
import { createCustomExercise } from '@atlas/exercise-library';
import type { Exercise } from '@atlas/data-model';

interface CustomExerciseFormProps {
  onCreated: (exercise: Exercise) => void;
  onCancel: () => void;
}

export function CustomExerciseForm({ onCreated, onCancel }: CustomExerciseFormProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [equipment, setEquipment] = useState('');
  const [targetMuscle, setTargetMuscle] = useState('');

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
      measurementType: 'reps_weight',
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

      <div className="atlas-custom-exercise-form__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
