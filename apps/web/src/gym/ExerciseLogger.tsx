import { useEffect, useState } from 'react';
import { type LogSetInput, remainingSeconds } from '@atlas/workout-engine';
import type { Exercise, PerformedSet, PlannedExercise, TimerState } from '@atlas/data-model';
import { loadSettings } from '../settings/settings';

interface DraftValues {
  weight: string;
  reps: string;
  duration: string;
  distance: string;
}

const EMPTY_DRAFT: DraftValues = { weight: '', reps: '', duration: '', distance: '' };

// ponytail: TimerState always needs a fixed duration/ends_at, so a timed
// exercise with no target duration still needs *some* ceiling to start a
// timer against. No real working set runs an hour; revisit if a genuinely
// open-ended stopwatch mode is ever requested.
const OPEN_ENDED_EXERCISE_SECONDS = 3600;

interface TimedDurationCellProps {
  targetSeconds: number | null;
  activeTimer: TimerState | null;
  draftValue: string;
  onStart: (durationSeconds: number) => void;
  onStop: () => void;
  onManualChange: (value: string) => void;
}

/** Not started -> optional local pre-countdown (ephemeral, never persisted) -> running (persisted TimerState, timestamp-derived) -> stopped, draft pre-filled with elapsed seconds. */
function TimedDurationCell({
  targetSeconds,
  activeTimer,
  draftValue,
  onStart,
  onStop,
  onManualChange,
}: TimedDurationCellProps) {
  const [settings] = useState(loadSettings);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      onStart(targetSeconds ?? OPEN_ENDED_EXERCISE_SECONDS);
      return;
    }
    const timeout = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(timeout);
  }, [countdown, onStart, targetSeconds]);

  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  if (countdown !== null) {
    return (
      <span className="atlas-timed-cell__countdown" aria-live="polite">
        {countdown}&hellip;
      </span>
    );
  }

  if (activeTimer) {
    const remaining = remainingSeconds(activeTimer);
    const elapsed = activeTimer.duration_seconds - remaining;
    const display = targetSeconds != null ? remaining : elapsed;
    return (
      <span className="atlas-timed-cell__running">
        <span aria-live="polite">{display}s</span>
        <button type="button" onClick={onStop}>
          Stop
        </button>
      </span>
    );
  }

  return (
    <span className="atlas-timed-cell__idle">
      <input
        type="number"
        inputMode="numeric"
        aria-label="Seconds"
        value={draftValue}
        onChange={(e) => onManualChange(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        onClick={() =>
          settings.preCountdownEnabled
            ? setCountdown(settings.preCountdownSeconds)
            : onStart(targetSeconds ?? OPEN_ENDED_EXERCISE_SECONDS)
        }
      >
        Start
      </button>
    </span>
  );
}

interface ExerciseLoggerProps {
  exercise: Exercise;
  planned: PlannedExercise;
  performedSets: PerformedSet[];
  previousSets: PerformedSet[];
  activeTimer: TimerState | null;
  onCompleteSet: (input: LogSetInput) => void;
  onRemoveCompletedSet: (setId: string) => void;
  onStartExerciseTimer: (durationSeconds: number) => void;
  onStopExerciseTimer: () => void;
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
  activeTimer,
  onCompleteSet,
  onRemoveCompletedSet,
  onStartExerciseTimer,
  onStopExerciseTimer,
}: ExerciseLoggerProps) {
  const plannedRowCount = planned.target_sets ?? Math.max(performedSets.length, 1);
  const [extraRows, setExtraRows] = useState(0);
  const totalRows = Math.max(plannedRowCount, performedSets.length) + extraRows;
  // Only one timer can run at a time (session.active_timer is a single slot),
  // so only the next not-yet-completed row ever offers Start/Stop; any extra
  // draft rows beyond it fall back to plain manual entry.
  const nextDraftIndex = performedSets.length;

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
                {showsDuration && index === nextDraftIndex ? (
                  <td>
                    <TimedDurationCell
                      targetSeconds={planned.target_duration_seconds}
                      activeTimer={
                        activeTimer?.kind === 'exercise' && activeTimer.exercise_id === exercise.id
                          ? activeTimer
                          : null
                      }
                      draftValue={draft.duration}
                      onStart={onStartExerciseTimer}
                      onStop={() => {
                        if (activeTimer) {
                          const elapsed =
                            activeTimer.duration_seconds - remainingSeconds(activeTimer);
                          updateDraft(index, { duration: String(elapsed) });
                        }
                        onStopExerciseTimer();
                      }}
                      onManualChange={(value) => updateDraft(index, { duration: value })}
                    />
                  </td>
                ) : (
                  showsDuration && (
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
                  )
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
