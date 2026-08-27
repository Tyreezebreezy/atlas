import { useState } from 'react';
import type { LogSetInput } from '@atlas/workout-engine';
import type { Exercise, PerformedSet, PlannedExercise } from '@atlas/data-model';

interface DraftValues {
  weight: string;
  reps: string;
  duration: string;
  distance: string;
}

const EMPTY_DRAFT: DraftValues = { weight: '', reps: '', duration: '', distance: '' };

interface ExerciseLoggerProps {
  exercise: Exercise;
  planned: PlannedExercise;
  performedSets: PerformedSet[];
  previousSets: PerformedSet[];
  onCompleteSet: (input: LogSetInput) => void;
  onRemoveCompletedSet: (setId: string) => void;
}

function formatSet(set: PerformedSet): string {
  if (set.weight != null && set.reps != null) return `${set.weight} × ${set.reps}`;
  if (set.reps != null) return `${set.reps} reps`;
  if (set.duration_seconds != null) return `${set.duration_seconds}s`;
  if (set.distance_meters != null) return `${set.distance_meters}m`;
  return '—';
}

export function ExerciseLogger({
  exercise,
  planned,
  performedSets,
  previousSets,
  onCompleteSet,
  onRemoveCompletedSet,
}: ExerciseLoggerProps) {
  const plannedRowCount = planned.target_sets ?? Math.max(performedSets.length, 1);
  const [extraRows, setExtraRows] = useState(0);
  const totalRows = Math.max(plannedRowCount, performedSets.length) + extraRows;

  const [drafts, setDrafts] = useState<Record<number, DraftValues>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const showsWeight = exercise.measurement_type === 'reps_weight';
  const showsReps =
    exercise.measurement_type === 'reps_weight' ||
    exercise.measurement_type === 'reps' ||
    exercise.measurement_type === 'reps_bodyweight';
  const showsDuration =
    exercise.measurement_type === 'time' || exercise.measurement_type === 'distance_time';
  const showsDistance =
    exercise.measurement_type === 'distance' || exercise.measurement_type === 'distance_time';

  function draftFor(index: number): DraftValues {
    const existing = drafts[index];
    if (existing) return existing;
    const lastCompleted = performedSets[performedSets.length - 1];
    const lastPrevious = previousSets[previousSets.length - 1];
    const weight = lastCompleted?.weight ?? lastPrevious?.weight ?? planned.target_weight;
    return {
      ...EMPTY_DRAFT,
      weight: weight != null ? String(weight) : '',
      reps: planned.target_reps_min != null ? String(planned.target_reps_min) : '',
      duration:
        planned.target_duration_seconds != null ? String(planned.target_duration_seconds) : '',
      distance:
        planned.target_distance_meters != null ? String(planned.target_distance_meters) : '',
    };
  }

  function updateDraft(index: number, patch: Partial<DraftValues>) {
    setDrafts((prev) => ({ ...prev, [index]: { ...draftFor(index), ...patch } }));
  }

  function handleComplete(index: number) {
    const draft = draftFor(index);
    onCompleteSet({
      exerciseId: exercise.id,
      setIndex: index,
      setType: 'working',
      weight: showsWeight && draft.weight !== '' ? Number(draft.weight) : null,
      reps: showsReps && draft.reps !== '' ? Number(draft.reps) : null,
      durationSeconds: showsDuration && draft.duration !== '' ? Number(draft.duration) : null,
      distanceMeters: showsDistance && draft.distance !== '' ? Number(draft.distance) : null,
      rpe: null,
      rir: null,
      notes: null,
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  return (
    <div className="atlas-gym-exercise">
      <h2>{exercise.name}</h2>

      {previousSets.length > 0 && (
        <div className="atlas-gym-exercise__previous">
          <h3>Previous</h3>
          <p>{previousSets.map(formatSet).join(' · ')}</p>
        </div>
      )}

      {(planned.target_sets ?? planned.target_reps_min ?? planned.target_weight) != null && (
        <p className="atlas-gym-exercise__planned">
          Planned: {planned.target_sets ?? '?'} &times; {planned.target_reps_min ?? '?'}
          {planned.target_reps_max && planned.target_reps_max !== planned.target_reps_min
            ? `–${planned.target_reps_max}`
            : ''}
          {planned.target_weight ? ` @ ${planned.target_weight} lb` : ''}
        </p>
      )}

      <table className="atlas-gym-exercise__sets">
        <thead>
          <tr>
            <th scope="col">Set</th>
            {showsWeight && <th scope="col">Weight</th>}
            {showsReps && <th scope="col">Reps</th>}
            {showsDuration && <th scope="col">Sec</th>}
            {showsDistance && <th scope="col">Meters</th>}
            <th scope="col">
              <span className="atlas-sr-only">Done</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRows }, (_, index) => {
            const performed = performedSets[index];
            if (performed) {
              return (
                <tr key={performed.id}>
                  <td>{index + 1}</td>
                  {showsWeight && <td>{performed.weight ?? '—'}</td>}
                  {showsReps && <td>{performed.reps ?? '—'}</td>}
                  {showsDuration && <td>{performed.duration_seconds ?? '—'}</td>}
                  {showsDistance && <td>{performed.distance_meters ?? '—'}</td>}
                  <td>
                    {confirmDeleteId === performed.id ? (
                      <span className="atlas-gym-exercise__confirm">
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveCompletedSet(performed.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Remove
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="atlas-gym-exercise__done"
                        aria-label={`Set ${index + 1} complete, tap to remove`}
                        onClick={() => setConfirmDeleteId(performed.id)}
                      >
                        &#10003;
                      </button>
                    )}
                  </td>
                </tr>
              );
            }

            const draft = draftFor(index);
            const isRemovableDraft = index === totalRows - 1 && index >= plannedRowCount;
            return (
              <tr key={`draft-${index}`}>
                <td>{index + 1}</td>
                {showsWeight && (
                  <td>
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`Set ${index + 1} weight`}
                      value={draft.weight}
                      onChange={(e) => updateDraft(index, { weight: e.target.value })}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                )}
                {showsReps && (
                  <td>
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label={`Set ${index + 1} reps`}
                      value={draft.reps}
                      onChange={(e) => updateDraft(index, { reps: e.target.value })}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                )}
                {showsDuration && (
                  <td>
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label={`Set ${index + 1} seconds`}
                      value={draft.duration}
                      onChange={(e) => updateDraft(index, { duration: e.target.value })}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                )}
                {showsDistance && (
                  <td>
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`Set ${index + 1} distance`}
                      value={draft.distance}
                      onChange={(e) => updateDraft(index, { distance: e.target.value })}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                )}
                <td>
                  {isRemovableDraft ? (
                    <button
                      type="button"
                      aria-label={`Remove set ${index + 1}`}
                      onClick={() => setExtraRows((n) => Math.max(0, n - 1))}
                    >
                      &times;
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="atlas-gym-exercise__complete"
                      aria-label={`Complete set ${index + 1}`}
                      onClick={() => handleComplete(index)}
                    >
                      &#9675;
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button
        type="button"
        className="atlas-library__create"
        onClick={() => setExtraRows((n) => n + 1)}
      >
        + Set
      </button>
    </div>
  );
}
