import { useEffect, useMemo, useState } from 'react';
import { estimated1RMSeries } from '@atlas/progress-engine';
import type { Exercise, PersonalRecord, WorkoutSession } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { describePR } from './formatPR';

interface ProgressScreenProps {
  onViewExercises: () => void;
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Reads the persisted (recalculated-on-finish) personalRecords table rather
 * than recomputing PRs live for every exercise the user has ever touched --
 * unlike ExerciseProgress (scoped to one exercise, cheap to recompute live),
 * this screen aggregates across potentially dozens of exercises, so a plain
 * indexed read of already-materialized data is the right tradeoff. See
 * docs/PRS.md "Performance."
 */
export function ProgressScreen({ onViewExercises }: ProgressScreenProps) {
  const storage = useStorage();
  const [loading, setLoading] = useState(true);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    if (!storage) return;
    void (async () => {
      const [allPRs, allExercises, allSessions] = await Promise.all([
        storage.personalRecords.getAll(),
        storage.exercises.getAll(),
        storage.workoutSessions.getAll(),
      ]);
      setPrs(allPRs);
      setExercises(new Map(allExercises.map((e) => [e.id, e])));
      setSessions(allSessions);
      setLoading(false);
    })();
  }, [storage]);

  const thisMonthCount = useMemo(() => prs.filter((p) => isThisMonth(p.achieved_at)).length, [prs]);

  const recentPRs = useMemo(
    () => [...prs].sort((a, b) => b.achieved_at.localeCompare(a.achieved_at)).slice(0, 5),
    [prs],
  );

  const strengthTrends = useMemo(() => {
    const trends: { exerciseId: string; first: number; last: number }[] = [];
    for (const pr of prs) {
      if (pr.kind !== 'estimated_1rm') continue;
      const series = estimated1RMSeries(sessions, pr.exercise_id);
      const firstPoint = series[0];
      const lastPoint = series[series.length - 1];
      if (series.length < 2 || !firstPoint || !lastPoint) continue;
      trends.push({ exerciseId: pr.exercise_id, first: firstPoint.value, last: lastPoint.value });
    }
    return trends.slice(0, 3);
  }, [prs, sessions]);

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Progress</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  return (
    <div className="atlas-progress">
      <h1>Progress</h1>

      <section className="atlas-progress__month">
        <h2>This Month</h2>
        <div className="atlas-progress__month-stat">
          <span className="atlas-progress__month-count">{thisMonthCount}</span>
          <span className="atlas-progress__month-label">{thisMonthCount === 1 ? 'PR' : 'PRs'}</span>
        </div>
      </section>

      <section>
        <h2>Recent PRs</h2>
        {recentPRs.length === 0 ? (
          <p className="atlas-program-screen__empty">
            Finish a workout to start tracking personal records.
          </p>
        ) : (
          <ul className="atlas-progress__recent-list">
            {recentPRs.map((pr) => {
              const { title, value } = describePR(pr);
              return (
                <li key={pr.id}>
                  <span className="atlas-progress__recent-exercise">
                    {exercises.get(pr.exercise_id)?.name ?? 'Exercise'}
                  </span>
                  <span className="atlas-progress__recent-value">{value}</span>
                  <span className="atlas-progress__recent-meta">
                    New {title} &middot; {formatDate(pr.achieved_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {strengthTrends.length > 0 && (
        <section>
          <h2>Estimated Strength</h2>
          <ul className="atlas-progress__trend-list">
            {strengthTrends.map((t) => (
              <li key={t.exerciseId}>
                <span className="atlas-progress__trend-exercise">
                  {exercises.get(t.exerciseId)?.name ?? 'Exercise'}
                </span>
                <span className="atlas-progress__trend-value">
                  {Math.round(t.first)} &rarr; {Math.round(t.last)} e1RM
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="atlas-progress__view-exercises" onClick={onViewExercises}>
        View Exercises
      </button>
    </div>
  );
}
