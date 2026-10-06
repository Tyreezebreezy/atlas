import {
  DEFAULT_E1RM_ESTIMATOR,
  eligibleSets,
  eligibleSetsForExercise,
  performanceContextKey,
  performanceContextOf,
  sessionContextKey,
} from '@atlas/pr-engine';
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

/**
 * vNext Handoff 04B. One comparable context an exercise has been done in: a
 * training location plus the actual machine (`gym_equipment_id`), either of
 * which may be null for history that never recorded it. The Strength picker is
 * built from these, so it shows exactly the contexts the data holds -- no more.
 */
export interface StrengthContext {
  /** `performanceContextKey` -- hand it back as `StrengthViewOptions.contextKey` to scope a view to this context. */
  key: string;
  training_location_id: string | null;
  gym_equipment_id: string | null;
  session_count: number;
  last_performed_at: string;
}

export interface StrengthView {
  metrics: StrengthMetric[];
  default_key: string;
  /** Loads used in at least two sessions, most recently used first (ties: heavier first). */
  load_options: number[];
  selected_load: number | null;
  /**
   * Distinct comparable contexts in this exercise's history (every session, not
   * only the scoped ones), most recently used first. One entry means there is
   * nothing to pick between; with several, the first is where a view should
   * open -- weight-bearing history in one context is never blended with
   * another's.
   */
  contexts: StrengthContext[];
}

export interface StrengthViewOptions {
  /** Which load the reps-at-load metric shows. Falls back to the most recently used recurring load. */
  load?: number | null;
  /**
   * Comparable context (`StrengthContext.key`). `undefined` = every session.
   * A weight-bearing history in one context must not be blended with another's:
   * 170 lb on one machine is not 170 lb on another, even at the same gym (see
   * PRs "Equipment-scoped series").
   */
  contextKey?: string;
}

/** Every comparable context an exercise has completed work in, most recently used first. */
export function strengthContexts(sessions: WorkoutSession[], exercise: Exercise): StrengthContext[] {
  const byKey = new Map<string, { context: StrengthContext; ids: Set<string> }>();
  for (const { session } of eligibleSetsForExercise(sessions, exercise.id)) {
    const parts = performanceContextOf(session, exercise.id);
    const key = performanceContextKey(parts);
    const at = session.completed_at ?? session.started_at;
    const entry = byKey.get(key) ?? { context: { key, ...parts, session_count: 0, last_performed_at: '' }, ids: new Set<string>() };
    entry.ids.add(session.id);
    if (at > entry.context.last_performed_at) entry.context.last_performed_at = at;
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .map(({ context, ids }) => ({ ...context, session_count: ids.size }))
    .sort((a, b) => b.last_performed_at.localeCompare(a.last_performed_at) || a.key.localeCompare(b.key));
}

/** The sessions in which `exerciseId` ran in one context, or every session when `contextKey` is undefined. */
export function sessionsInContext(
  sessions: WorkoutSession[],
  exerciseId: string,
  contextKey: string | undefined,
): WorkoutSession[] {
  if (contextKey === undefined) return sessions;
  return sessions.filter((s) => sessionContextKey(s, exerciseId) === contextKey);
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
  const contexts = strengthContexts(allSessions, exercise);
  const sessions = sessionsInContext(allSessions, exercise.id, options.contextKey);

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
