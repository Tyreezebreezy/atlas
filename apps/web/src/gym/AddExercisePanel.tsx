import { useMemo, useState } from 'react';
import { searchExercises } from '@atlas/exercise-library';
import type { Exercise, ExerciseReplacement } from '@atlas/data-model';

type AddScope = ExerciseReplacement['scope'];

interface AddExercisePanelProps {
  allExercises: Exercise[];
  /** Exercises already planned in this workout -- don't suggest adding a duplicate. */
  excludeExerciseIds: string[];
  onCancel: () => void;
  onConfirm: (exerciseId: string, scope: AddScope) => void;
}

/** Same shape as ReplaceExercisePanel (search -> pick -> scope -> confirm), minus
 * substitute suggestions (there's no "current exercise" to suggest against) and
 * minus a reason field (an addition doesn't need justifying the way a swap does). */
export function AddExercisePanel({
  allExercises,
  excludeExerciseIds,
  onCancel,
  onConfirm,
}: AddExercisePanelProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [scope, setScope] = useState<AddScope>('today');

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const excluded = new Set(excludeExerciseIds);
    return searchExercises(allExercises, { query })
      .filter((e) => !excluded.has(e.id))
      .slice(0, 20);
  }, [query, allExercises, excludeExerciseIds]);

  if (selected) {
    return (
      <div className="atlas-replace-panel">
        <h3>Add {selected.name}?</h3>
        <div className="atlas-replace-panel__scope">
          <label>
            <input
              type="radio"
              name="add-scope"
              checked={scope === 'today'}
              onChange={() => setScope('today')}
            />
            Just today
          </label>
          <label>
            <input
              type="radio"
              name="add-scope"
              checked={scope === 'program'}
              onChange={() => setScope('program')}
            />
            Add to program too
          </label>
        </div>
        <div className="atlas-replace-panel__actions">
          <button type="button" onClick={() => setSelected(null)}>
            Back
          </button>
          <button
            type="button"
            className="atlas-template-editor__save"
            onClick={() => onConfirm(selected.id, scope)}
          >
            Confirm Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="atlas-replace-panel">
      <div className="atlas-replace-panel__header">
        <h3>Add Exercise</h3>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <label htmlFor="add-search">Search</label>
      <input
        id="add-search"
        className="atlas-library__search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search exercises…"
      />
      {searchResults.length > 0 && (
        <ul className="atlas-program-screen__list">
          {searchResults.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => setSelected(exercise)}
                aria-label={`Add ${exercise.name}`}
              >
                <span className="atlas-library__item-name" aria-hidden="true">
                  {exercise.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
