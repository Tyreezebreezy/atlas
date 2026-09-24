import { formatExerciseName } from '@atlas/exercise-library';
import {
  evaluateBenchmarkStrict,
  findBenchmark,
  formatPercentileDisplay,
  type StrictBenchmarkEvaluation,
} from '@atlas/benchmark-engine';
import type { Benchmark, Exercise, PersonalRecord, PrKind, TestProtocol } from '@atlas/data-model';

// Which PR demonstrates a benchmark metric, and the unit that PR's value is in --
// e.g. "pushups" is measured by the exercise's `bodyweight`-kind PR (most reps in
// one set), in reps. ATLAS stores weight in lb throughout. Benchmarks with no
// exerciseName (e.g. grip strength -- no ATLAS exercise for it) have no entry
// here and are simply not shown, since there is no PR to compare.
const BENCHMARK_OBSERVATION: Record<string, { prKind: PrKind; unit: string }> = {
  pushups: { prKind: 'bodyweight', unit: 'reps' },
  pullups: { prKind: 'bodyweight', unit: 'reps' },
  bench_press_1rm_lb: { prKind: 'estimated_1rm', unit: 'lb' },
  plank_seconds: { prKind: 'timed', unit: 'seconds' },
};

export interface BenchmarkComparison {
  key: string;
  benchmark: Benchmark;
  exerciseName: string;
  /** The name of the test protocol the benchmark names, when it is on record. */
  protocolName: string | null;
  evaluation: StrictBenchmarkEvaluation;
}

/**
 * vNext Handoff 04A. One comparison per benchmark metric the person has a
 * matching PR for, each decided by `evaluateBenchmarkStrict` -- the only
 * evaluator a current claim may come from. A comparison that cannot be
 * verified (legacy reference table, no protocol, unit or age-band mismatch...)
 * is kept, as an unavailable state, rather than shown with an estimated
 * percentile. Verified comparisons come first.
 */
export function benchmarkComparisons(
  benchmarks: Benchmark[],
  prs: PersonalRecord[],
  exercises: Map<string, Exercise>,
  protocols: TestProtocol[] = [],
): BenchmarkComparison[] {
  const protocolsById = new Map(protocols.map((p) => [p.id, p]));
  const results: BenchmarkComparison[] = [];
  for (const metric of new Set(benchmarks.map((b) => b.metric))) {
    const observed = BENCHMARK_OBSERVATION[metric];
    const benchmark = findBenchmark(benchmarks, metric);
    if (!observed || !benchmark?.exercise_id) continue;
    const pr = prs.find((p) => p.exercise_id === benchmark.exercise_id && p.kind === observed.prKind);
    if (!pr) continue;

    const exercise = exercises.get(benchmark.exercise_id);
    const protocol = benchmark.test_protocol_id ? (protocolsById.get(benchmark.test_protocol_id) ?? null) : null;
    results.push({
      key: benchmark.id,
      benchmark,
      exerciseName: formatExerciseName(exercise?.name ?? 'Exercise'),
      protocolName: protocol?.name ?? null,
      evaluation: evaluateBenchmarkStrict(
        benchmark,
        { value: pr.value, unit: observed.unit, measurementType: exercise?.measurement_type ?? null },
        { protocol },
      ),
    });
  }
  // Array.prototype.sort is stable: verified first, otherwise the given order.
  return results.sort((a, b) => Number(b.evaluation.status === 'MATCHED') - Number(a.evaluation.status === 'MATCHED'));
}

function VerifiedDetails({ comparison }: { comparison: BenchmarkComparison }) {
  const { benchmark, evaluation, protocolName } = comparison;
  if (evaluation.status !== 'MATCHED') return null;
  return (
    <>
      <p>{benchmark.source}</p>
      {benchmark.sample_description && <p>{benchmark.sample_description}</p>}
      <p>
        Compared with {benchmark.comparison_population}
        {benchmark.geography ? ` (${benchmark.geography})` : ''}
        {protocolName ? ` · measured as ${protocolName}` : ''}.
      </p>
      <p>
        Highest documented threshold reached: P{evaluation.percentile} ({evaluation.threshold} {benchmark.unit}).
        Nothing is estimated between thresholds.
      </p>
      <p>
        Dataset {evaluation.provenance.dataset_version} · benchmark {evaluation.provenance.benchmark_version}
      </p>
    </>
  );
}

/** Where you stand against a reference population. Worded and styled apart from PRs and milestones on purpose. */
export function BenchmarkList({ comparisons }: { comparisons: BenchmarkComparison[] }) {
  return (
    <ul className="atlas-benchmarks">
      {comparisons.map((comparison) => {
        const { key, benchmark, exerciseName, evaluation } = comparison;
        if (evaluation.status === 'MATCHED') {
          return (
            <li key={key} className="atlas-benchmark-card">
              <span className="atlas-benchmark-card__tag">Benchmark</span>
              <span className="atlas-benchmark-card__exercise">{exerciseName}</span>
              <span className="atlas-benchmark-card__display">
                {formatPercentileDisplay({ percentile: evaluation.percentile }, benchmark.comparison_population)}
              </span>
              <details className="atlas-benchmark-card__source">
                <summary>Details</summary>
                <VerifiedDetails comparison={comparison} />
              </details>
            </li>
          );
        }
        return (
          <li key={key} className="atlas-benchmark-card atlas-benchmark-card--unavailable">
            <span className="atlas-benchmark-card__tag">Benchmark</span>
            <span className="atlas-benchmark-card__exercise">{exerciseName}</span>
            <span className="atlas-benchmark-card__display">No verified comparison available for this result.</span>
            <details className="atlas-benchmark-card__source">
              <summary>Details</summary>
              <p>{evaluation.reason}</p>
              <p>
                ATLAS states a percentile only when a reference&rsquo;s method, test protocol, unit, population and
                age band all match your result, and never estimates between documented thresholds.
              </p>
              <p>Reference on file: {benchmark.source}</p>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
