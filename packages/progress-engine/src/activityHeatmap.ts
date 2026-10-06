import { localIsoDate, sessionLocalDate } from '@atlas/core';
import { summarizeSession } from '@atlas/workout-engine';
import type { WorkoutSession } from '@atlas/data-model';

export type ActivityMetric = 'workouts' | 'minutes' | 'sets';

export interface ActivityDay {
  /** YYYY-MM-DD, device-local calendar date. */
  date: string;
  value: number;
}

/**
 * One value per calendar day over the trailing `days` window, keyed by the
 * calendar day each workout was performed on (`sessionLocalDate`: recorded on
 * the device when it started, else the viewer-local day of its completion --
 * never UTC, so a workout finished at 11pm lands on the day it was actually
 * done). Every day in the window is
 * present, including zero-activity days, so a calendar-grid UI never has
 * to backfill gaps itself. Metric is a simple tally of what was actually
 * logged (workout count, total minutes, or total sets) -- no derived
 * "intensity score."
 */
export function computeActivityHeatmap(
  sessions: WorkoutSession[],
  metric: ActivityMetric = 'workouts',
  days = 365,
  now: Date = new Date(),
): ActivityDay[] {
  const completed = sessions.filter((s) => s.status === 'completed');
  const byDate = new Map<string, number>();

  for (const session of completed) {
    const date = sessionLocalDate(session);
    const value =
      metric === 'workouts'
        ? 1
        : metric === 'minutes'
          ? summarizeSession(session).durationMinutes
          : summarizeSession(session).setCount;
    byDate.set(date, (byDate.get(date) ?? 0) + value);
  }

  const result: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = localIsoDate(d);
    result.push({ date: key, value: byDate.get(key) ?? 0 });
  }
  return result;
}
