import { useEffect, useMemo, useState } from 'react';
import {
  ensureExercisesSeeded,
  formatExerciseName,
  searchExercises,
} from '@atlas/exercise-library';
import type { Exercise } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';

interface ExercisePickerProps {
  storage: AtlasStorage;
  onPick: (exercise: Exercise) => void;
  onCancel: () => void;
}

export function ExercisePicker({ storage, onPick, onCancel }: ExercisePickerProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void (async () => {
      await ensureExercisesSeeded(storage);
      setExercises(await storage.exercises.getAll());
    })();
  }, [storage]);

  const filtered = useMemo(() => searchExercises(exercises, { query }), [exercises, query]);

  return (
    <div className="atlas-exercise-picker">
      <button type="button" className="atlas-template-editor__back" onClick={onCancel}>
        &larr; Cancel
      </button>
      <h1>Add Exercise</h1>
      <input
        type="search"
        aria-label="Search exercises"
        placeholder="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="atlas-library__search"
      />
      <ul className="atlas-library__list">
        {filtered.slice(0, 50).map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => onPick(exercise)}
              aria-label={[
                formatExerciseName(exercise.name),
                exercise.category,
                exercise.equipment.join(', '),
              ]
                .filter(Boolean)
                .join(', ')}
            >
              <span className="atlas-library__item-name" aria-hidden="true">
                {formatExerciseName(exercise.name)}
              </span>
              <span className="atlas-library__item-meta" aria-hidden="true">
                {[exercise.category, exercise.equipment.join(', ')].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {filtered.length > 50 && (
        <p className="atlas-library__truncated">Showing first 50 &mdash; refine your search.</p>
      )}
    </div>
  );
}
