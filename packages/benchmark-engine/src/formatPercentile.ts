import type { PercentileResult } from './interpolatePercentile';

/**
 * Clean, non-fake-precise display text -- never "87.394284%", never
 * "stronger than 100% of men". High percentiles read as "Top N%" (matches
 * the handoff's own "Top 5%" example); everything else reads as
 * "Stronger than P% of {population}". Capped to [1, 99] either way.
 */
export function formatPercentileDisplay(result: PercentileResult, population = 'men'): string {
  const clamped = Math.min(99, Math.max(1, Math.round(result.percentile)));
  if (result.aboveMaximum || clamped >= 90) {
    const topN = Math.max(1, 100 - clamped);
    return `Top ${topN}%`;
  }
  return `Stronger than ${clamped}% of ${population}`;
}
