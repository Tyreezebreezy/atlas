import { useEffect, useMemo, useState } from 'react';
import { performanceContextLabel, type ContextNames } from '@atlas/equipment-engine';
import { calculatePRs } from '@atlas/pr-engine';
import {
  buildStrengthView,
  sessionsInContext,
  summarizeExercise,
  type StrengthMetric,
} from '@atlas/progress-engine';
import type { Exercise, PerformedSet, WorkoutSession } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { formatSessionDate } from '../history/formatSessionDate';
import { describePR, formatSeconds } from '../progress/formatPR';
import { TrendChart } from '../progress/TrendChart';

interface ExerciseProgressProps {
  exercise: Exercise;
  sessions: WorkoutSession[];
}

/** Whole numbers for rep counts, seconds as m:ss, everything else with its unit. */
function valueFormatter(metric: StrengthMetric): ((v: number) => string) | undefined {
  if (metric.kind === 'reps_at_load' || metric.kind === 'reps') return (v) => String(Math.round(v));
  if (metric.kind === 'duration') return formatSeconds;
  return undefined;
}

const HEADLINE_PRS = ['max_load', 'estimated_1rm', 'bodyweight', 'timed', 'distance'];

/**
 * PRs and chart series are computed live from history on every render
 * rather than read from the persisted (recalc-on-finish) PersonalRecord
 * rows -- at personal scale (dozens of sessions, not thousands) a full
 * recompute is sub-millisecond, and staying live means this view can never
 * show something stale if a recalculation trigger elsewhere ever misses.
 * See docs/PRS.md.
 *
 * vNext Handoff 03B: which metrics exist, which opens first and where the
 * records fall all come from `buildStrengthView` (progress-engine). A machine
 * with a maxed stack opens on reps-at-that-load; estimated 1RM is a separate
 * metric that never fabricates a value for sets above its supported range.
 */
export function ExerciseProgress({ exercise, sessions }: ExerciseProgressProps) {
  const storage = useStorage();
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [chosenLoad, setChosenLoad] = useState<number | null>(null);
  const [names, setNames] = useState<ContextNames | null>(null);

  const overall = useMemo(() => buildStrengthView(sessions, exercise), [sessions, exercise]);
  const contexts = overall.contexts;

  // Weight-bearing history in one context -- a place AND the machine used there -- must not be
  // blended with another's, so once an exercise has more than one context there is no "all": it
  // opens on the most recently used one (the engine lists them newest first) and the picker
  // switches between them. With a single context there is nothing to pick between.
  const [chosenContextKey, setChosenContextKey] = useState<string | undefined>(undefined);
  const contextKey =
    contexts.length > 1
      ? (contexts.find((c) => c.key === chosenContextKey)?.key ?? contexts[0]?.key)
      : undefined;

  // Names come from every place and machine, archived ones included, so a context at a place the
  // owner has since archived still reads by its name.
  useEffect(() => {
    if (!storage || contexts.length <= 1) return;
    let cancelled = false;
    void Promise.all([storage.trainingLocations.getAll(), storage.gymEquipment.getAll()]).then(
      ([places, machines]) => {
        if (cancelled) return;
        setNames({
          locations: new Map(places.map((l) => [l.id, l.name])),
          equipment: new Map(machines.map((m) => [m.id, m.label])),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [storage, contexts.length]);

  const view = useMemo(
    () => buildStrengthView(sessions, exercise, { load: chosenLoad, contextKey }),
    [sessions, exercise, chosenLoad, contextKey],
  );
  const scopedSessions = useMemo(
    () => sessionsInContext(sessions, exercise.id, contextKey),
    [sessions, exercise.id, contextKey],
  );
  const summary = useMemo(() => summarizeExercise(scopedSessions, exercise.id), [scopedSessions, exercise.id]);
  const prs = useMemo(() => calculatePRs(scopedSessions, exercise), [scopedSessions, exercise]);

  const selected = view.metrics.find((m) => m.key === (chosenKey ?? view.default_key)) ?? view.metrics[0];
  const bestReps = selected?.kind === 'reps_at_load' ? Math.max(...selected.series.map((p) => p.value)) : null;

  if (overall.metrics.length === 0 && summarizeExercise(sessions, exercise.id).sessionCount === 0) {
    return (
      <div className="atlas-exercise-progress">
        <p className="atlas-program-screen__empty">No completed workouts for this exercise yet.</p>
      </div>
    );
  }

  return (
    <div className="atlas-exercise-progress">
      {contexts.length > 1 && (
        <label className="atlas-strength__context">
          <span>Equipment</span>
          <select value={contextKey ?? ''} onChange={(e) => setChosenContextKey(e.target.value)} disabled={!names}>
            {contexts.map((c) => (
              <option key={c.key} value={c.key}>
                {names ? performanceContextLabel(c, names) : 'Loading…'}
              </option>
            ))}
          </select>
        </label>
      )}

      {view.metrics.length > 0 && selected && (
        <div className="atlas-exercise-progress__chart">
          {view.metrics.length > 1 && (
            <div
              className="atlas-exercise-progress__metric-picker"
              role="tablist"
              aria-label="Chart metric"
            >
              {view.metrics.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={selected.key === m.key}
                  className={
                    selected.key === m.key ? 'atlas-exercise-progress__metric--active' : undefined
                  }
                  onClick={() => setChosenKey(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {selected.kind === 'reps_at_load' && (
            <div className="atlas-strength__fixed-load">
              {view.load_options.length > 1 ? (
                <select
                  className="atlas-strength__load-chip atlas-strength__load-select"
                  aria-label="Load"
                  value={view.selected_load ?? ''}
                  onChange={(e) => setChosenLoad(Number(e.target.value))}
                >
                  {view.load_options.map((load) => (
                    <option key={load} value={load}>
                      {load} lb
                    </option>
                  ))}
                </select>
              ) : (
                <span className="atlas-strength__load-chip">{selected.load} lb</span>
              )}
              <span className="atlas-strength__fixed-load-text">reps per session at this load</span>
              {bestReps != null && <strong>Best {bestReps}</strong>}
            </div>
          )}

          {selected.kind === 'e1rm' && selected.series.length === 0 ? (
            <p className="atlas-trend-chart__empty">
              No estimated 1RM yet. {selected.note}
              {view.load_options.length > 0 ? ' Reps at load shows your progress instead.' : ''}
            </p>
          ) : (
            <>
              <TrendChart
                key={selected.key + String(selected.load ?? '')}
                points={selected.series}
                unit={selected.unit}
                formatValue={valueFormatter(selected)}
                recordIndices={selected.record_indices}
                title={selected.label}
              />
              {selected.note && selected.series.length > 0 && (
                <p className="atlas-strength__note">{selected.note}</p>
              )}
            </>
          )}
        </div>
      )}

      <dl className="atlas-exercise-progress__stats">
        <div>
          <dt>Last</dt>
          <dd>{describeSets(summary.lastSets)}</dd>
        </div>
        {prs
          .filter((p) => HEADLINE_PRS.includes(p.kind))
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

      {/* Only loads used more than once: a load tried a single time is a first number, not a rep record. */}
      {prs.some((p) => p.kind === 'rep_at_load' && view.load_options.includes(p.load ?? NaN)) && (
        <div className="atlas-exercise-progress__rep-bests">
          <h3>Best reps at each load</h3>
          <ul>
            {prs
              .filter((p) => p.kind === 'rep_at_load' && view.load_options.includes(p.load ?? NaN))
              .sort((a, b) => (b.load ?? 0) - (a.load ?? 0))
              .map((pr) => (
                <li key={pr.id}>
                  {pr.load} lb × {pr.value}
                </li>
              ))}
          </ul>
        </div>
      )}

      {prs.some((p) => p.kind === 'rep_range') && (
        <div className="atlas-exercise-progress__rep-bests">
          <h3>Best weight at each rep count</h3>
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

      <div className="atlas-exercise-progress__history">
        <h3>History</h3>
        <ul>
          {[...scopedSessions]
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
                    {formatSessionDate(s)}
                  </span>
                  <span className="atlas-exercise-progress__history-sets">
                    {describeSets(sets)}
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

/** "170 × 18, 16, 15": consecutive sets at the same weight share it, so a fixed-load day reads at a glance. */
function describeSets(sets: PerformedSet[]): string {
  const parts: string[] = [];
  let openWeight: number | null = null;
  for (const set of sets) {
    if (set.weight != null && set.reps != null) {
      if (openWeight === set.weight) parts[parts.length - 1] += `, ${set.reps}`;
      else parts.push(`${set.weight} × ${set.reps}`);
      openWeight = set.weight;
    } else {
      parts.push(describeSet(set));
      openWeight = null;
    }
  }
  return parts.join(', ');
}
