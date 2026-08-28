import type { BodyMeasurement } from '@atlas/data-model';

/**
 * The bodyweight to use for a `bodyweight_multiplier` milestone check on a
 * given date, per the documented selection rule: the latest measurement on
 * or before that date; if none exists (e.g. the workout predates the first
 * ever logged weight), the latest measurement available at all, even if it
 * falls after the date. Returns null only when no weighed measurement
 * exists anywhere -- callers treat that as "cannot be evaluated yet," never
 * as zero.
 */
export function resolveBodyweightForDate(
  measurements: BodyMeasurement[],
  date: string,
): number | null {
  const weighed = measurements.filter(
    (m): m is BodyMeasurement & { weight: number } => m.weight != null,
  );
  if (weighed.length === 0) return null;

  const onOrBefore = weighed.filter((m) => m.date <= date);
  const pool = onOrBefore.length > 0 ? onOrBefore : weighed;

  return [...pool].sort((a, b) => b.date.localeCompare(a.date))[0]!.weight;
}
