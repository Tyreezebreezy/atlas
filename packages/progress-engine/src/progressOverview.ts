import { eligibleSets } from '@atlas/pr-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { buildStrengthView, type StrengthMetricKind } from './strengthView';

/**
 * vNext Handoff 03B (§5). The Progress Overview scales with how much history
 * exists rather than presenting a wall of empty cards. This is the only place
 * that decides where "early" ends.
 *
 * Six completed workouts is roughly two weeks of a three-day program: enough
 * that most exercises have been done twice and can be compared. It is a
 * presentation threshold only -- nothing about a user's training is
 * concluded from it.
 */
export const ESTABLISHED_MIN_WORKOUTS = 6;

export type ProgressOverviewState = 'empty' | 'early' | 'established';

export function progressOverviewState(completedWorkouts: number): ProgressOverviewState {
  if (completedWorkouts <= 0) return 'empty';
  return completedWorkouts < ESTABLISHED_MIN_WORKOUTS ? 'early' : 'established';
}

export interface RecentProgressItem {
  exercise_id: string;
  metric: StrengthMetricKind;
  /** `reps_at_load` only. */
  load?: number;
  unit: string;
  from: number;
  to: number;
  delta: number;
  /** When the new best was set. */
  date: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "What improved lately", one row per exercise, measured on the SAME metric
 * the Strength view opens that exercise with (so a fixed-load machine reports
 * "+3 reps at 170 lb", not a fabricated e1RM): the newest point that set a
 * new best inside the window, and how far above the previous best it landed.
 * Exercises whose latest best is older than the window, or that have not yet
 * been done twice, produce nothing -- no trend is invented.
 */
export function recentProgress(
  sessions: WorkoutSession[],
  exercises: Map<string, Exercise>,
  options: { sinceDays?: number; limit?: number; now?: Date } = {},
): RecentProgressItem[] {
  const now = (options.now ?? new Date()).getTime();
  const since = now - (options.sinceDays ?? 30) * DAY_MS;

  const trainedRecently = new Set<string>();
  for (const { set } of eligibleSets(sessions)) {
    const at = new Date(set.completed_at).getTime();
    if (at >= since && at <= now) trainedRecently.add(set.exercise_id);
  }

  const items: RecentProgressItem[] = [];
  for (const exerciseId of trainedRecently) {
    const exercise = exercises.get(exerciseId);
    if (!exercise) continue;
    const view = buildStrengthView(sessions, exercise);
    const chosen = view.metrics.find((m) => m.key === view.default_key);
    const recordIndex = chosen?.record_indices[chosen.record_indices.length - 1];
    if (!chosen || recordIndex == null) continue;

    const point = chosen.series[recordIndex];
    const at = point ? new Date(point.date).getTime() : NaN;
    if (!point || !(at >= since && at <= now)) continue;
    const from = Math.max(...chosen.series.slice(0, recordIndex).map((p) => p.value));
    items.push({
      exercise_id: exerciseId,
      metric: chosen.kind,
      ...(chosen.load != null ? { load: chosen.load } : {}),
      unit: chosen.unit,
      from,
      to: point.value,
      delta: point.value - from,
      date: point.date,
    });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, options.limit ?? 5);
}
