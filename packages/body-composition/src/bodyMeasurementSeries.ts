import type { ChartPoint } from '@atlas/progress-engine';
import type { BodyMeasurement } from '@atlas/data-model';

/**
 * Reuses progress-engine's ChartPoint shape (date/value/sessionId) so
 * TrendChart needs no changes to render body-composition trends -- `id`
 * fills the `sessionId` slot, which TrendChart only ever uses as a React
 * key and tooltip grouping, never as an actual session reference.
 */
function seriesFor(
  measurements: BodyMeasurement[],
  valueFn: (m: BodyMeasurement) => number | null,
): ChartPoint[] {
  return measurements
    .filter((m) => valueFn(m) != null)
    .map((m) => ({ date: m.date, value: valueFn(m)!, sessionId: m.id }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function weightSeries(measurements: BodyMeasurement[]): ChartPoint[] {
  return seriesFor(measurements, (m) => m.weight);
}

export function bodyFatSeries(measurements: BodyMeasurement[]): ChartPoint[] {
  return seriesFor(measurements, (m) => m.body_fat_percentage);
}

/** A trailing average needs at least this many weigh-ins inside its window, or it is just the latest number under another name. */
export const ROLLING_MIN_WEIGH_INS = 3;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 86_400_000);
}

/**
 * vNext Handoff 03B. Trailing average of body weight, one point per weigh-in
 * that has enough company: the mean of every weigh-in in the `windowDays`
 * days ending on (and including) that weigh-in's date. A point is only
 * emitted once the window holds `ROLLING_MIN_WEIGH_INS` weigh-ins -- with
 * fewer, no average is shown rather than restating a single reading. Points
 * carry the weigh-in's own id (in `sessionId`, same as `weightSeries`) so a
 * chart can line the average up with the raw readings it smooths.
 */
export function weightRollingAverageSeries(
  measurements: BodyMeasurement[],
  windowDays = 7,
): ChartPoint[] {
  const weighed = measurements
    .filter((m) => m.weight != null)
    .map((m) => ({ m, day: dayNumber(m.date) }))
    .sort((a, b) => a.day - b.day || a.m.date.localeCompare(b.m.date));

  const points: ChartPoint[] = [];
  for (const { m, day } of weighed) {
    const inWindow = weighed.filter((other) => other.day <= day && other.day > day - windowDays);
    if (inWindow.length < ROLLING_MIN_WEIGH_INS) continue;
    const mean = inWindow.reduce((sum, other) => sum + (other.m.weight as number), 0) / inWindow.length;
    points.push({ date: m.date, value: mean, sessionId: m.id });
  }
  return points;
}
