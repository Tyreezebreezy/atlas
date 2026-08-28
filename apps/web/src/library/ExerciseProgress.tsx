import { useMemo, useState } from 'react';
import { calculatePRs } from '@atlas/pr-engine';
import {
  bestWeightSeries,
  distanceSeries,
  durationSeries,
  estimated1RMSeries,
  repsSeries,
  summarizeExercise,
  volumeSeries,
  type ChartPoint,
} from '@atlas/progress-engine';
import type { Exercise, PerformedSet, WorkoutSession } from '@atlas/data-model';
import { describePR, formatSeconds } from '../progress/formatPR';
import { TrendChart } from '../progress/TrendChart';

interface ExerciseProgressProps {
  exercise: Exercise;
  sessions: WorkoutSession[];
}

interface MetricOption {
  key: string;
  label: string;
  series: ChartPoint[];
  unit?: string;
  formatValue?: (v: number) => string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * PRs and chart series are computed live from history on every render
 * rather than read from the persisted (recalc-on-finish) PersonalRecord
 * rows -- at personal scale (dozens of sessions, not thousands) a full
 * recompute is sub-millisecond, and staying live means this view can never
 * show something stale if a recalculation trigger elsewhere ever misses.
 * See docs/PRS.md.
 */
export function ExerciseProgress({ exercise, sessions }: ExerciseProgressProps) {
  const summary = useMemo(() => summarizeExercise(sessions, exercise.id), [sessions, exercise.id]);
  const prs = useMemo(() => calculatePRs(sessions, exercise), [sessions, exercise]);

  const metrics = useMemo<MetricOption[]>(() => {
    const options: MetricOption[] = [];
    if (exercise.measurement_type === 'reps_weight') {
      options.push({
        key: 'e1rm',
        label: 'Estimated 1RM',
        series: estimated1RMSeries(sessions, exercise.id),
        unit: ' lb',
      });
      options.push({
        key: 'weight',
        label: 'Best Weight',
        series: bestWeightSeries(sessions, exercise.id),
        unit: ' lb',
      });
      options.push({
        key: 'volume',
        label: 'Volume',
        series: volumeSeries(sessions, exercise.id),
        unit: ' lb',
      });
    }
    if (exercise.measurement_type === 'reps' || exercise.measurement_type === 'reps_bodyweight') {
      options.push({
        key: 'reps',
        label: 'Reps',
        series: repsSeries(sessions, exercise.id),
        unit: ' reps',
      });
    }
    if (exercise.measurement_type === 'time' || exercise.measurement_type === 'distance_time') {
      options.push({
        key: 'duration',
        label: 'Duration',
        series: durationSeries(sessions, exercise.id),
        formatValue: formatSeconds,
      });
    }
    if (exercise.measurement_type === 'distance' || exercise.measurement_type === 'distance_time') {
      options.push({
        key: 'distance',
        label: 'Distance',
        series: distanceSeries(sessions, exercise.id),
        unit: ' m',
      });
    }
    return options;
  }, [sessions, exercise.id, exercise.measurement_type]);

  const [activeMetric, setActiveMetric] = useState(metrics[0]?.key);
  const selected = metrics.find((m) => m.key === activeMetric) ?? metrics[0];

  if (summary.sessionCount === 0) {
    return (
      <div className="atlas-exercise-progress">
        <p className="atlas-program-screen__empty">No completed workouts for this exercise yet.</p>
      </div>
    );
  }

  return (
    <div className="atlas-exercise-progress">
      <dl className="atlas-exercise-progress__stats">
        <div>
          <dt>Last</dt>
          <dd>{summary.lastSets.map((s) => describeSet(s)).join(', ')}</dd>
        </div>
        {prs
          .filter(
            (p) =>
              p.kind === 'max_load' ||
              p.kind === 'estimated_1rm' ||
              p.kind === 'bodyweight' ||
              p.kind === 'timed' ||
              p.kind === 'distance',
          )
          .map((pr) => {
            const { title, value } = describePR(pr);
            return (
              <div key={pr.id}>
                <dt>{title}</dt>
                <dd>{value}</dd>
              </div>
            );
          })}
        <div>
          <dt>Sessions</dt>
          <dd>{summary.sessionCount}</dd>
        </div>
      </dl>

      {prs.some((p) => p.kind === 'rep_range') && (
        <div className="atlas-exercise-progress__rep-bests">
          <h3>Rep Bests</h3>
          <ul>
            {prs
              .filter((p) => p.kind === 'rep_range')
              .sort((a, b) => (a.reps ?? 0) - (b.reps ?? 0))
              .map((pr) => (
                <li key={pr.id}>{describePR(pr).value}</li>
              ))}
          </ul>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="atlas-exercise-progress__chart">
          {metrics.length > 1 && (
            <div
              className="atlas-exercise-progress__metric-picker"
              role="tablist"
              aria-label="Chart metric"
            >
              {metrics.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={selected?.key === m.key}
                  className={
                    selected?.key === m.key ? 'atlas-exercise-progress__metric--active' : undefined
                  }
                  onClick={() => setActiveMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <TrendChart
              points={selected.series}
              unit={selected.unit}
              formatValue={selected.formatValue}
            />
          )}
        </div>
      )}

      <div className="atlas-exercise-progress__history">
        <h3>History</h3>
        <ul>
          {[...sessions]
            .filter(
              (s) =>
                s.status === 'completed' &&
                s.performed_sets.some((set) => set.exercise_id === exercise.id),
            )
            .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
            .map((s) => {
              const sets = s.performed_sets.filter((set) => set.exercise_id === exercise.id);
              return (
                <li key={s.id}>
                  <span className="atlas-exercise-progress__history-date">
                    {formatDate(s.completed_at ?? s.started_at)}
                  </span>
                  <span className="atlas-exercise-progress__history-sets">
                    {sets.map((set) => describeSet(set)).join(', ')}
                  </span>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}

function describeSet(set: PerformedSet): string {
  if (set.weight != null && set.reps != null) return `${set.weight} × ${set.reps}`;
  if (set.reps != null) return `${set.reps} reps`;
  if (set.duration_seconds != null) return formatSeconds(set.duration_seconds);
  if (set.distance_meters != null) return `${set.distance_meters} m`;
  return '—';
}
