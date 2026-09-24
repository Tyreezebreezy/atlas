import { DEFAULT_E1RM_ESTIMATOR, eligibleSets, eligibleSetsForExercise } from '@atlas/pr-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import {
  bestWeightSeries,
  distanceSeries,
  durationSeries,
  estimated1RMSeries,
  repsAtLoadSeries,
  repsSeries,
  volumeSeries,
  type ChartPoint,
} from './chartSeries';

/**
 * vNext Handoff 03B (§7). Everything the Strength view needs to decide -- which
 * metrics exist for an exercise, which one opens first, which loads recur,
 * which points set a record -- so none of it lives in React.
 *
 * The two ideas the view must keep apart:
 *
 * - **Estimated 1RM** converts a set into a theoretical one-rep max. It is
 *   only defined for the estimator's supported rep range (Brzycki: 1-10), so
 *   a set of 18 is never converted -- it produces no e1RM point at all.
 * - **Reps at load** is the plain fact "how many reps did I get at exactly
 *   this weight?", which is the honest progress signal when the load can't
 *   go up (a machine stack maxed at 170 lb: 12 -> 14 -> 16 -> 18 reps).
 */

export type StrengthMetricKind =
  | 'reps_at_load'
  | 'e1rm'
  | 'max_load'
  | 'volume'
  | 'reps'
  | 'duration'
  | 'distance';

export interface StrengthMetric {
  /** Stable id: the kind, e.g. `e1rm`. */
  key: string;
  kind: StrengthMetricKind;
  label: string;
  /** Suffix for values, e.g. ` lb`. Empty for durations (the caller formats seconds). */
  unit: string;
  series: ChartPoint[];
  /** Indices into `series` of points that set a new best (never the first point, which is the baseline). */
  record_indices: number[];
  /** `reps_at_load` only: the exact load the series is at. */
  load?: number;
  /** A plain-language limit of this metric worth stating next to its chart. */
  note?: string;
}

export interface StrengthView {
  metrics: StrengthMetric[];
  default_key: string;
  /** Loads used in at least two sessions, most recently used first (ties: heavier first). */
  load_options: number[];
  selected_load: number | null;
  /** Distinct equipment contexts (`training_location_id`, null = none recorded) in this exercise's history. */
  contexts: (string | null)[];
}

export interface StrengthViewOptions {
  /** Which load the reps-at-load metric shows. Falls back to the most recently used recurring load. */
  load?: number | null;
  /**
   * Equipment context. `undefined` = every session; `null` = sessions with no
   * recorded location; a string = that `TrainingLocation`. A weight-bearing
   * history at one gym must not be blended with another's -- 170 lb on one
   * machine is not 170 lb on another (see PRs "Equipment-scoped series").
   */
  trainingLocationId?: string | null;
}

/** Indices where a series reaches a strictly new best. The first point is the baseline, not a record. */
export function recordIndices(series: ChartPoint[]): number[] {
  const indices: number[] = [];
  let best = -Infinity;
  series.forEach((point, index) => {
    if (point.value > best) {
      if (index > 0) indices.push(index);
      best = point.value;
    }
  });
  return indices;
}

function metric(
  kind: StrengthMetricKind,
  label: string,
  unit: string,
  series: ChartPoint[],
  extra: { load?: number; note?: string } = {},
): StrengthMetric {
  return { key: kind, kind, label, unit, series, record_indices: recordIndices(series), ...extra };
}

/** Loads used in >=2 distinct sessions, most recently used first. */
function recurringLoads(sessions: WorkoutSession[], exerciseId: string): number[] {
  const byLoad = new Map<number, { sessionIds: Set<string>; latest: string }>();
  for (const { set, session } of eligibleSetsForExercise(sessions, exerciseId)) {
    if (set.weight == null || set.reps == null) continue;
    const entry = byLoad.get(set.weight) ?? { sessionIds: new Set<string>(), latest: '' };
    entry.sessionIds.add(session.id);
    const at = session.completed_at ?? session.started_at;
    if (at > entry.latest) entry.latest = at;
    byLoad.set(set.weight, entry);
  }
  return [...byLoad.entries()]
    .filter(([, entry]) => entry.sessionIds.size >= 2)
    .sort(([loadA, a], [loadB, b]) => b.latest.localeCompare(a.latest) || loadB - loadA)
    .map(([load]) => load);
}

function sessionsWithWeightedSets(sessions: WorkoutSession[], exerciseId: string): number {
  const ids = new Set<string>();
  for (const { set, session } of eligibleSetsForExercise(sessions, exerciseId)) {
    if (set.weight != null && set.reps != null) ids.add(session.id);
  }
  return ids.size;
}

export function buildStrengthView(
  allSessions: WorkoutSession[],
  exercise: Exercise,
  options: StrengthViewOptions = {},
): StrengthView {
  const exerciseSessions = allSessions.filter((s) =>
    eligibleSetsForExercise([s], exercise.id).length > 0,
  );
  const contexts = [...new Set(exerciseSessions.map((s) => s.training_location_id ?? null))];
  const sessions =
    options.trainingLocationId === undefined
      ? allSessions
      : allSessions.filter((s) => (s.training_location_id ?? null) === options.trainingLocationId);

  const metrics: StrengthMetric[] = [];
  let loadOptions: number[] = [];
  let selectedLoad: number | null = null;
  let defaultKey: string | undefined;

  if (exercise.measurement_type === 'reps_weight') {
    loadOptions = recurringLoads(sessions, exercise.id);
    selectedLoad =
      options.load != null && loadOptions.includes(options.load)
        ? options.load
        : (loadOptions[0] ?? null);

    const e1rm = estimated1RMSeries(sessions, exercise.id);
    const weight = bestWeightSeries(sessions, exercise.id);

    if (selectedLoad != null) {
      metrics.push(
        metric(
          'reps_at_load',
          `Reps @ ${selectedLoad} lb`,
          ' reps',
          repsAtLoadSeries(sessions, exercise.id, selectedLoad),
          { load: selectedLoad, note: `Best reps in a session at exactly ${selectedLoad} lb.` },
        ),
      );
    }

    const estimator = DEFAULT_E1RM_ESTIMATOR;
    const unplotted = sessionsWithWeightedSets(sessions, exercise.id) - e1rm.length;
    metrics.push(
      metric('e1rm', 'Estimated 1RM', ' lb', e1rm, {
        note:
          `Estimated from sets of ${estimator.supported_rep_min}–${estimator.supported_rep_max} reps; ` +
          `sets above ${estimator.supported_rep_max} reps are not converted to an estimate.` +
          (unplotted > 0
            ? ` ${unplotted} session${unplotted === 1 ? '' : 's'} with only higher-rep sets ${unplotted === 1 ? 'is' : 'are'} not plotted.`
            : ''),
      }),
    );
    metrics.push(metric('max_load', 'Best Weight', ' lb', weight));
    metrics.push(metric('volume', 'Volume', ' lb', volumeSeries(sessions, exercise.id)));

    // The load has stopped moving when the last two sessions topped out at the
    // same weight -- reps are then the only thing that can show progress.
    const lastTwo = weight.slice(-2);
    const loadIsFixed = lastTwo.length === 2 && lastTwo[0]?.value === lastTwo[1]?.value;
    if (selectedLoad != null && (e1rm.length === 0 || loadIsFixed)) defaultKey = 'reps_at_load';
    else if (e1rm.length >= 2) defaultKey = 'e1rm';
    else defaultKey = 'max_load';
  }

  if (exercise.measurement_type === 'reps' || exercise.measurement_type === 'reps_bodyweight') {
    metrics.push(metric('reps', 'Reps', ' reps', repsSeries(sessions, exercise.id)));
  }
  if (exercise.measurement_type === 'time' || exercise.measurement_type === 'distance_time') {
    metrics.push(metric('duration', 'Duration', '', durationSeries(sessions, exercise.id)));
  }
  if (exercise.measurement_type === 'distance' || exercise.measurement_type === 'distance_time') {
    metrics.push(metric('distance', 'Distance', ' m', distanceSeries(sessions, exercise.id)));
  }

  return {
    metrics,
    default_key: defaultKey ?? metrics[0]?.key ?? '',
    load_options: loadOptions,
    selected_load: selectedLoad,
    contexts,
  };
}

export interface TrainedExercise {
  exercise_id: string;
  session_count: number;
  last_performed_at: string;
}

/** Every exercise with completed, non-warm-up work, most recently performed first -- the Strength view's exercise picker. */
export function trainedExercises(sessions: WorkoutSession[]): TrainedExercise[] {
  const byExercise = new Map<string, { sessionIds: Set<string>; last: string }>();
  for (const { set, session } of eligibleSets(sessions)) {
    const entry = byExercise.get(set.exercise_id) ?? { sessionIds: new Set<string>(), last: '' };
    entry.sessionIds.add(session.id);
    if (set.completed_at > entry.last) entry.last = set.completed_at;
    byExercise.set(set.exercise_id, entry);
  }
  return [...byExercise.entries()]
    .map(([exercise_id, entry]) => ({
      exercise_id,
      session_count: entry.sessionIds.size,
      last_performed_at: entry.last,
    }))
    .sort((a, b) => b.last_performed_at.localeCompare(a.last_performed_at) || a.exercise_id.localeCompare(b.exercise_id));
}
