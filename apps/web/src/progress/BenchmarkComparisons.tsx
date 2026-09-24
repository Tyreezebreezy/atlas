import { formatExerciseName } from '@atlas/exercise-library';
import {
  findBenchmark,
  formatPercentileDisplay,
  interpolatePercentile,
} from '@atlas/benchmark-engine';
import type { Benchmark, Exercise, PersonalRecord, PrKind } from '@atlas/data-model';

// Which PR kind demonstrates a benchmark metric, e.g. "pushups" is measured
// by the exercise's `bodyweight`-kind PR (most reps in one set). Benchmarks
// with no exerciseName (e.g. grip strength -- no ATLAS exercise for it) have
// no entry here and are simply not shown, since there's no PR to compare.
const BENCHMARK_PR_KIND: Record<string, PrKind> = {
  pushups: 'bodyweight',
  pullups: 'bodyweight',
  bench_press_1rm_lb: 'estimated_1rm',
  plank_seconds: 'timed',
};

export interface BenchmarkComparison {
  benchmark: Benchmark;
  exerciseName: string;
  display: string;
}

/**
 * The comparisons that already existed on the old Trends tab, unchanged in
 * what they compute. vNext Handoff 03B deliberately does not touch how a
 * comparison is derived: the legacy `interpolatePercentile` and the newer
 * `evaluateBenchmarkStrict` still disagree about interpolation, and reconciling
 * them (plus any new benchmark claims or seeding) is a separate handoff. This
 * is the ONLY place the legacy call is made, so that conflict stays contained.
 */
export function benchmarkComparisons(
  benchmarks: Benchmark[],
  prs: PersonalRecord[],
  exercises: Map<string, Exercise>,
): BenchmarkComparison[] {
  const results: BenchmarkComparison[] = [];
  for (const benchmark of benchmarks) {
    if (!benchmark.exercise_id) continue;
    const prKind = BENCHMARK_PR_KIND[benchmark.metric];
    if (!prKind) continue;
    const pr = prs.find((p) => p.exercise_id === benchmark.exercise_id && p.kind === prKind);
    if (!pr) continue;
    const found = findBenchmark(benchmarks, benchmark.metric);
    if (!found) continue;
    const percentile = interpolatePercentile(pr.value, found.percentile_thresholds);
    results.push({
      benchmark: found,
      exerciseName: formatExerciseName(exercises.get(benchmark.exercise_id)?.name ?? 'Exercise'),
      display: formatPercentileDisplay(percentile, found.comparison_population),
    });
  }
  return results;
}

/** Where you stand against a reference population. Worded and styled apart from PRs and milestones on purpose. */
export function BenchmarkList({ comparisons }: { comparisons: BenchmarkComparison[] }) {
  return (
    <ul className="atlas-benchmarks">
      {comparisons.map(({ benchmark, exerciseName, display }) => (
        <li key={benchmark.id} className="atlas-benchmark-card">
          <span className="atlas-benchmark-card__tag">Benchmark</span>
          <span className="atlas-benchmark-card__exercise">{exerciseName}</span>
          <span className="atlas-benchmark-card__display">{display}</span>
          <details className="atlas-benchmark-card__source">
            <summary>Source</summary>
            <p>{benchmark.source}</p>
            {benchmark.sample_description && <p>{benchmark.sample_description}</p>}
          </details>
        </li>
      ))}
    </ul>
  );
}
