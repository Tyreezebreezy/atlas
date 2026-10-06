import { useEffect, useMemo, useState } from 'react';
import { sessionLocalDate } from '@atlas/core';
import { summarizeSession } from '@atlas/workout-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { formatSessionDate as formatDate } from './formatSessionDate';
import { SessionDetail } from './SessionDetail';

interface HistoryScreenProps {
  /** Omit when the screen is a Progress section (its tab row is the navigation). */
  onBack?: () => void;
  /** Rendered inside Progress: no back button and no page title of its own. */
  embedded?: boolean;
  /** Opens one exercise in Progress > Strength. */
  onOpenExercise?: (exerciseId: string) => void;
}

/** Months are the months of the days workouts were PERFORMED on (`sessionLocalDate`), the same day every other grouping uses. */
function monthKey(session: WorkoutSession): string {
  return sessionLocalDate(session).slice(0, 7);
}

function monthLabel(session: WorkoutSession): string {
  return new Date(`${sessionLocalDate(session)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function HistoryScreen({ onBack, embedded = false, onOpenExercise }: HistoryScreenProps) {
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

  // Newest first, grouped by calendar month so a long history stays scannable.
  const months = useMemo(() => {
    const groups: { key: string; label: string; sessions: WorkoutSession[] }[] = [];
    for (const session of completed) {
      const key = monthKey(session);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.sessions.push(session);
      else groups.push({ key, label: monthLabel(session), sessions: [session] });
    }
    return groups;
  }, [completed]);

  const selected = completed.find((s) => s.id === selectedId) ?? null;

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        {!embedded && <h1>History</h1>}
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (selected) {
    return (
      <SessionDetail
        session={selected}
        exercises={exercises}
        onBack={() => setSelectedId(null)}
        onOpenExercise={onOpenExercise}
      />
    );
  }

  return (
    <div className="atlas-history">
      {!embedded && onBack && (
        <button type="button" className="atlas-template-editor__back" onClick={onBack}>
          &larr; Back
        </button>
      )}
      {!embedded && <h1>History</h1>}
      {completed.length === 0 ? (
        <p className="atlas-program-screen__empty">
          No completed workouts yet &mdash; finish one and it'll show up here.
        </p>
      ) : (
        months.map((month) => (
          <section key={month.key} className="atlas-history__month" aria-label={month.label}>
            <h2>
              {month.label}
              <span className="atlas-history__month-count">
                {month.sessions.length} workout{month.sessions.length === 1 ? '' : 's'}
              </span>
            </h2>
            <ul className="atlas-program-screen__list">
              {month.sessions.map((session) => {
                const summary = summarizeSession(session);
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(session.id)}
                      aria-label={`${session.name}, ${formatDate(session)}, ${summary.durationMinutes} minutes, ${summary.setCount} sets`}
                    >
                      <span className="atlas-library__item-name" aria-hidden="true">
                        {formatDate(session)} &middot; {session.name}
                      </span>
                      <span className="atlas-library__item-meta" aria-hidden="true">
                        {summary.durationMinutes} min &middot; {summary.setCount} sets
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
