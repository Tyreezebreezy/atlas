import type { Benchmark } from '@atlas/data-model';

/**
 * Finds the applicable Benchmark row for a metric, preferring an age
 * bracket that actually contains the given age. Falls back to an
 * age-unrestricted row (`age_min`/`age_max` both null) if no age is known
 * or no bracket matches. Returns null for an unsupported metric -- callers
 * show "No comparison available yet" rather than guessing.
 *
 * ATLAS does not currently collect the user's age anywhere, so in practice
 * `age` is always omitted today and this always takes the age-unrestricted
 * fallback path; the bracket-matching logic exists and is tested so a
 * future age input can use it without changes here.
 */
export function findBenchmark(
  benchmarks: Benchmark[],
  metric: string,
  options: { age?: number | null; population?: string } = {},
): Benchmark | null {
  const population = options.population ?? 'general adult men';
  const candidates = benchmarks.filter(
    (b) => b.metric === metric && b.comparison_population === population,
  );
  if (candidates.length === 0) return null;

  const ageless = candidates.find((b) => b.age_min == null && b.age_max == null) ?? null;

  if (options.age == null) return ageless ?? candidates[0] ?? null;

  const bracketMatch = candidates.find(
    (b) =>
      (b.age_min == null || options.age! >= b.age_min) &&
      (b.age_max == null || options.age! <= b.age_max),
  );
  return bracketMatch ?? ageless ?? candidates[0] ?? null;
}
