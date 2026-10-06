import { useMemo, useState } from 'react';
import { formatExerciseName, searchExercises } from '@atlas/exercise-library';
import { suggestSubstitutes } from '@atlas/substitution-engine';
import type { Exercise, ExerciseReplacement } from '@atlas/data-model';

interface ReplaceExercisePanelProps {
  currentExercise: Exercise;
  allExercises: Exercise[];
  /** Other exercises already planned in this workout -- never suggest replacing one exercise with another already in the same session. */
  excludeExerciseIds: string[];
  /** Whether the workout comes from a saved workout that "Update program too" could change. A freestyle workout has none. */
  canChangeProgram: boolean;
  onCancel: () => void;
  onConfirm: (
    replacementExerciseId: string,
    reason: string | null,
    scope: ExerciseReplacement['scope'],
  ) => void;
}

export function ReplaceExercisePanel({
  currentExercise,
  allExercises,
  excludeExerciseIds,
  canChangeProgram,
  onCancel,
  onConfirm,
}: ReplaceExercisePanelProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [scope, setScope] = useState<ExerciseReplacement['scope']>('today');
  const [reason, setReason] = useState('');

  const suggestions = useMemo(
    () => suggestSubstitutes(currentExercise, allExercises, { excludeExerciseIds, limit: 5 }),
    [currentExercise, allExercises, excludeExerciseIds],
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const excluded = new Set([currentExercise.id, ...excludeExerciseIds]);
    return searchExercises(allExercises, { query })
      .filter((e) => !excluded.has(e.id))
      .slice(0, 20);
  }, [query, allExercises, currentExercise.id, excludeExerciseIds]);

  if (selected) {
    return (
      <div className="atlas-replace-panel">
        <h3>Replace with {formatExerciseName(selected.name)}?</h3>
        {canChangeProgram && (
          <div className="atlas-replace-panel__scope">
            <label>
              <input
                type="radio"
                name="replace-scope"
                checked={scope === 'today'}
                onChange={() => setScope('today')}
              />
              Just today
            </label>
            <label>
              <input
                type="radio"
                name="replace-scope"
                checked={scope === 'program'}
                onChange={() => setScope('program')}
              />
              Update program too
            </label>
          </div>
        )}
        <label htmlFor="replace-reason">Reason (optional)</label>
        <textarea
          id="replace-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Machine was taken"
        />
        <div className="atlas-replace-panel__actions">
          <button type="button" onClick={() => setSelected(null)}>
            Back
          </button>
          <button
            type="button"
            className="atlas-template-editor__save"
            onClick={() => onConfirm(selected.id, reason, scope)}
          >
            Confirm Replace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="atlas-replace-panel">
      <div className="atlas-replace-panel__header">
        <h3>Replace {formatExerciseName(currentExercise.name)}</h3>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="atlas-replace-panel__suggestions">
          <h4>Suggested</h4>
          <ul className="atlas-program-screen__list">
            {suggestions.map((candidate) => (
              <li key={candidate.exercise.id}>
                <button
                  type="button"
                  onClick={() => setSelected(candidate.exercise)}
                  aria-label={`Replace with ${formatExerciseName(candidate.exercise.name)}`}
                >
                  <span className="atlas-library__item-name" aria-hidden="true">
                    {formatExerciseName(candidate.exercise.name)}
                  </span>
                  <span className="atlas-library__item-meta" aria-hidden="true">
                    {candidate.reasons[0] ?? 'Related'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label htmlFor="replace-search">Or search</label>
      <input
        id="replace-search"
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
                aria-label={`Replace with ${formatExerciseName(exercise.name)}`}
              >
                <span className="atlas-library__item-name" aria-hidden="true">
                  {formatExerciseName(exercise.name)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
