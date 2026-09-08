import { useEffect, useMemo, useState } from 'react';
import { summarizeSession } from '@atlas/workout-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { formatSessionDate as formatDate, SessionDetail } from './SessionDetail';

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
