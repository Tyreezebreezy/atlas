import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, WorkoutSession } from '@atlas/data-model';

export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface SessionDetailProps {
  session: WorkoutSession;
  exercises: Map<string, Exercise>;
  onBack: () => void;
  /** vNext Handoff 03B: when set, each exercise links to its Strength view. */
  onOpenExercise?: (exerciseId: string) => void;
}

/** Shared by History (browsing performed sessions) and Today's "View
 * Session" on a completed occurrence (v0.2.4) -- same detail view either
 * way, since a session is a session regardless of how the owner navigated
 * to it. */
export function SessionDetail({ session, exercises, onBack, onOpenExercise }: SessionDetailProps) {
  const byExercise = new Map<string, typeof session.performed_sets>();
  for (const set of session.performed_sets) {
    const list = byExercise.get(set.exercise_id) ?? [];
    list.push(set);
    byExercise.set(set.exercise_id, list);
  }

  return (
    <div className="atlas-history-detail">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>{session.name}</h1>
      <p className="atlas-history-detail__meta">
        {formatSessionDate(session.started_at)}
        {session.session_note ? ` · ${session.session_note}` : ''}
      </p>
      {[...byExercise.entries()].map(([exerciseId, sets]) => (
        <div key={exerciseId} className="atlas-history-detail__exercise">
          <h2>{formatExerciseName(exercises.get(exerciseId)?.name ?? 'Unknown exercise')}</h2>
          {onOpenExercise && exercises.has(exerciseId) && (
            <button
              type="button"
              className="atlas-link-button"
              onClick={() => onOpenExercise(exerciseId)}
            >
              View strength progress
            </button>
          )}
          <ul>
            {sets
              .sort((a, b) => a.set_index - b.set_index)
              .map((set) => (
                <li key={set.id}>
                  {set.weight != null && set.reps != null
                    ? `${set.weight} × ${set.reps}`
                    : (set.reps ?? set.duration_seconds ?? set.distance_meters ?? '—')}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {session.performed_sets.length === 0 && <p>No sets were logged for this workout.</p>}
    </div>
  );
}
