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
