export interface PercentileResult {
  /** 0-100, linearly interpolated between the two bracketing thresholds. */
  percentile: number;
  /** True when the value was below the lowest known threshold -- percentile is clamped to that threshold, not extrapolated. */
  belowMinimum: boolean;
  /** True when the value was above the highest known threshold -- percentile is clamped, never claimed as 100. */
  aboveMaximum: boolean;
}

/**
 * Deterministic linear interpolation between the percentile/value points in
 * a Benchmark's `percentile_thresholds` (e.g. `{ "50": 20, "90": 30 }`).
 * Never extrapolates past the known range -- a value outside the table is
 * clamped to the nearest known percentile with `belowMinimum`/`aboveMaximum`
 * set, so the caller can render "below the range we have data for" rather
 * than a fabricated percentile.
 *
 * @deprecated Legacy/compatibility only (Handoff 04A). Interpolating between
 * anchors states a percentile no source documents, so nothing user-facing may
 * call this -- current comparisons go through `evaluateBenchmarkStrict`. It
 * stays, isolated and unused by the app, so v0.0.7-era behavior remains
 * readable and testable; `singleEvaluator.test.ts` fails if `apps/web` imports it.
 */
export function interpolatePercentile(
  value: number,
  thresholds: Record<string, number>,
): PercentileResult {
  const points = Object.entries(thresholds)
    .map(([percentile, thresholdValue]) => ({
      percentile: Number(percentile),
      value: thresholdValue,
    }))
    .sort((a, b) => a.percentile - b.percentile);

  if (points.length === 0) {
    throw new Error('interpolatePercentile: percentile_thresholds must have at least one entry');
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    throw new Error('interpolatePercentile: unreachable -- points is non-empty');
  }

  if (value <= first.value) {
    return { percentile: first.percentile, belowMinimum: value < first.value, aboveMaximum: false };
  }
  if (value >= last.value) {
    return { percentile: last.percentile, belowMinimum: false, aboveMaximum: value > last.value };
  }

  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i];
    const hi = points[i + 1];
    if (!lo || !hi) continue;
    if (value >= lo.value && value <= hi.value) {
      const range = hi.value - lo.value;
      const t = range === 0 ? 0 : (value - lo.value) / range;
      return {
        percentile: lo.percentile + t * (hi.percentile - lo.percentile),
        belowMinimum: false,
        aboveMaximum: false,
      };
    }
  }

  // Unreachable given the boundary checks above (every value is either
  // <= first, >= last, or between two consecutive points).
  return { percentile: last.percentile, belowMinimum: false, aboveMaximum: false };
}
