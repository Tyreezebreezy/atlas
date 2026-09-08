import { useEffect, useMemo, useState } from 'react';
import { summarizeSession } from '@atlas/workout-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface SessionDetailProps {
  session: WorkoutSession;
  exercises: Map<string, Exercise>;
  onBack: () => void;
}

function SessionDetail({ session, exercises, onBack }: SessionDetailProps) {
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
        {formatDate(session.started_at)}
        {session.session_note ? ` · ${session.session_note}` : ''}
      </p>
      {[...byExercise.entries()].map(([exerciseId, sets]) => (
        <div key={exerciseId} className="atlas-history-detail__exercise">
          <h2>{formatExerciseName(exercises.get(exerciseId)?.name ?? 'Unknown exercise')}</h2>
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

interface HistoryScreenProps {
  onBack: () => void;
}

export function HistoryScreen({ onBack }: HistoryScreenProps) {
  const storage = useStorage();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!storage) return;
    void (async () => {
      const [allSessions, allExercises] = await Promise.all([
        storage.workoutSessions.getAll(),
        storage.exercises.getAll(),
      ]);
      setSessions(allSessions);
      setExercises(new Map(allExercises.map((e) => [e.id, e])));
      setLoading(false);
    })();
  }, [storage]);

  const completed = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'completed')
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [sessions],
  );

  const selected = completed.find((s) => s.id === selectedId) ?? null;

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>History</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (selected) {
    return (
      <SessionDetail session={selected} exercises={exercises} onBack={() => setSelectedId(null)} />
    );
  }

  return (
    <div className="atlas-history">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>History</h1>
      {completed.length === 0 ? (
        <p className="atlas-program-screen__empty">
          No completed workouts yet &mdash; finish one and it'll show up here.
        </p>
      ) : (
        <ul className="atlas-program-screen__list">
          {completed.map((session) => {
            const summary = summarizeSession(session);
            return (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(session.id)}
                  aria-label={`${session.name}, ${formatDate(session.started_at)}, ${summary.durationMinutes} minutes, ${summary.setCount} sets`}
                >
                  <span className="atlas-library__item-name" aria-hidden="true">
                    {formatDate(session.started_at)} &middot; {session.name}
                  </span>
                  <span className="atlas-library__item-meta" aria-hidden="true">
                    {summary.durationMinutes} min &middot; {summary.setCount} sets
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
