import { useMemo } from 'react';
import { recentProgress, trainedExercises } from '@atlas/progress-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import { ExerciseProgress } from '../library/ExerciseProgress';
import type { ProgressData } from './progressData';

interface StrengthViewProps {
  data: ProgressData;
  /** Pre-selected by a link from another section; otherwise the most sensible default. */
  exerciseId: string | null;
  onSelectExercise: (exerciseId: string | null) => void;
  onViewExercises: () => void;
}

/**
 * vNext Handoff 03B (§7). One exercise at a time: pick an exercise, pick a
 * metric, read one chart, then its PR history. Different exercises are never
 * plotted on the same line.
 */
export function StrengthView({ data, exerciseId, onSelectExercise, onViewExercises }: StrengthViewProps) {
  const { sessions, exercises } = data;

  const trained = useMemo(
    () => trainedExercises(sessions).filter((t) => exercises.has(t.exercise_id)),
    [sessions, exercises],
  );

  // Opens on whatever improved most recently -- usually what the owner came to see -- and
  // otherwise on what they trained last.
  const defaultId = useMemo(
    () => recentProgress(sessions, exercises, { limit: 1 })[0]?.exercise_id ?? trained[0]?.exercise_id ?? null,
    [sessions, exercises, trained],
  );

  const selectedId =
    exerciseId && trained.some((t) => t.exercise_id === exerciseId) ? exerciseId : defaultId;
  const selected = selectedId ? exercises.get(selectedId) : undefined;

  if (trained.length === 0 || !selected) {
    return (
      <div className="atlas-strength">
        <section className="atlas-panel atlas-overview__empty">
          <h2>No strength data yet</h2>
          <p>Once you finish a workout, each exercise gets its own chart and record history here.</p>
        </section>
        <button type="button" className="atlas-btn atlas-btn--tertiary" onClick={onViewExercises}>
          Browse exercise library
        </button>
      </div>
    );
  }

  return (
    <div className="atlas-strength">
      <label className="atlas-strength__picker">
        <span>Exercise</span>
        <select value={selected.id} onChange={(e) => onSelectExercise(e.target.value)}>
          {trained.map((t) => (
            <option key={t.exercise_id} value={t.exercise_id}>
              {formatExerciseName(exercises.get(t.exercise_id)?.name ?? 'Exercise')}
            </option>
          ))}
        </select>
      </label>
      <ExerciseProgress key={selected.id} exercise={selected} sessions={sessions} />
    </div>
  );
}
