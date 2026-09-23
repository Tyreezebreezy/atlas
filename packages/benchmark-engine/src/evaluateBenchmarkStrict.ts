import type { Benchmark } from '@atlas/data-model';

export type StrictBenchmarkEvaluation =
  | { status: 'MATCHED'; benchmark: Benchmark; percentile: number; observedValue: number }
  | { status: 'NO_COMPATIBLE_BENCHMARK'; reason: string };

/**
 * vNext Handoff 02 (research pack v2 §14.2). Additive alongside the
 * existing, untouched v0.0.7 `interpolatePercentile` (which the live
 * v0.0.7 UI keeps using exactly as before) -- this is the stricter
 * evaluator for the new benchmark-registry infrastructure: it reports only
 * the HIGHEST documented percentile threshold the observed value actually
 * meets, never a value interpolated between two anchor points. A value
 * between P75 and P90 reports P75, not a fabricated P83. A value below
 * every documented threshold, or a benchmark with no thresholds at all,
 * returns a typed `NO_COMPATIBLE_BENCHMARK` result rather than
 * synthesizing one. Does not itself check protocol compatibility -- callers
 * gate on `matchProtocol` first when protocol matching matters.
 */
export function evaluateBenchmarkStrict(
  benchmark: Benchmark | null,
  observedValue: number,
): StrictBenchmarkEvaluation {
  if (!benchmark) {
    return { status: 'NO_COMPATIBLE_BENCHMARK', reason: 'No benchmark definition for this metric.' };
  }
  const direction = benchmark.direction ?? 'higher_is_better';
  const entries = Object.entries(benchmark.percentile_thresholds)
    .map(([percentile, value]) => ({ percentile: Number(percentile), value }))
    .filter((e) => Number.isFinite(e.percentile));
  if (entries.length === 0) {
    return { status: 'NO_COMPATIBLE_BENCHMARK', reason: 'Benchmark has no percentile thresholds.' };
  }

  let crossed: { percentile: number; value: number } | null = null;
  for (const entry of entries) {
    const meets =
      direction === 'higher_is_better' ? observedValue >= entry.value : observedValue <= entry.value;
    if (meets && (!crossed || entry.percentile > crossed.percentile)) crossed = entry;
  }
  if (!crossed) {
    return {
      status: 'NO_COMPATIBLE_BENCHMARK',
      reason: 'Observed value does not reach the lowest documented threshold.',
    };
  }
  return { status: 'MATCHED', benchmark, percentile: crossed.percentile, observedValue };
}
