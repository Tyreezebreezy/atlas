import type {
  Benchmark,
  BenchmarkEvaluationMethod,
  BenchmarkEvaluationProvenance,
  MeasurementType,
  TestProtocol,
} from '@atlas/data-model';
import { matchProtocol } from './matchProtocol';

/**
 * A benchmark row with no `evaluation_method` is a v0.0.7 row: ATLAS-modeled
 * percentile points that were meant to be linearly interpolated. That label is
 * for compatibility only -- `evaluateBenchmarkStrict` never turns it into a
 * current claim. The stored row is never rewritten to say so.
 */
export function benchmarkEvaluationMethod(benchmark: Benchmark): BenchmarkEvaluationMethod {
  return benchmark.evaluation_method ?? 'legacy_interpolated';
}

/** A result to compare, plus everything known about how it was produced and about the person. */
export interface BenchmarkObservation {
  value: number;
  /** The unit `value` is in ("lb", "reps", "seconds"). */
  unit: string | null;
  /** The measurement type of the exercise the result came from -- what the protocol gate compares. */
  measurementType: MeasurementType | null;
  /** What ATLAS knows about the person. It holds no profile today, so an age-banded reference cannot be verified. */
  subject?: { age?: number | null; referenceGroup?: string | null };
}

export interface BenchmarkEvaluationContext {
  /** The `TestProtocol` row named by `benchmark.test_protocol_id`, when it exists. */
  protocol?: TestProtocol | null;
}

/** Why no current claim can be made -- always one typed reason, never a fallback to an estimate. */
export type BenchmarkUnavailableCode =
  | 'NO_BENCHMARK'
  | 'LEGACY_METHOD'
  | 'METHOD_UNSUPPORTED'
  | 'PROVENANCE_INCOMPLETE'
  | 'PROTOCOL_INCOMPATIBLE'
  | 'UNIT_INCOMPATIBLE'
  | 'REFERENCE_INCOMPATIBLE'
  | 'AGE_INCOMPATIBLE'
  | 'NO_THRESHOLDS'
  | 'BELOW_LOWEST_ANCHOR';

export type StrictBenchmarkEvaluation =
  | {
      status: 'MATCHED';
      benchmark: Benchmark;
      /** The highest documented percentile whose threshold the result reaches -- never a value between two anchors. */
      percentile: number;
      /** That anchor's own threshold value. */
      threshold: number;
      observedValue: number;
      provenance: BenchmarkEvaluationProvenance;
    }
  | { status: 'NO_COMPATIBLE_BENCHMARK'; code: BenchmarkUnavailableCode; reason: string };

const present = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Handoff 04A: the authoritative evaluator for every current, user-facing
 * benchmark claim. A claim needs a compatible match on everything the
 * registry records -- evaluation method, source/version provenance, test
 * protocol, unit, reference population and age band -- and if any of it is
 * missing or does not line up the answer is a typed
 * `NO_COMPATIBLE_BENCHMARK`, never an estimate. There is deliberately no
 * fallback to interpolation.
 *
 * With a match it reports the HIGHEST documented percentile threshold the
 * result reaches (a 45 against P50=33 / P70=41 / P80=47 is "P70", not a
 * fabricated 76), so a claim can always be traced to a number in the source.
 *
 * `legacy_interpolated` rows (every v0.0.7 row) and `validated_model` rows
 * (none exist yet) produce no claim here.
 */
export function evaluateBenchmarkStrict(
  benchmark: Benchmark | null,
  observation: BenchmarkObservation,
  context: BenchmarkEvaluationContext = {},
): StrictBenchmarkEvaluation {
  const unavailable = (code: BenchmarkUnavailableCode, reason: string): StrictBenchmarkEvaluation => ({
    status: 'NO_COMPATIBLE_BENCHMARK',
    code,
    reason,
  });

  if (!benchmark) return unavailable('NO_BENCHMARK', 'No benchmark definition for this metric.');

  const method = benchmarkEvaluationMethod(benchmark);
  if (method === 'legacy_interpolated') {
    return unavailable(
      'LEGACY_METHOD',
      'This reference table was modeled from summary statistics rather than documented percentile anchors, so ATLAS does not state a percentile from it.',
    );
  }
  if (method !== 'strict_anchor') {
    return unavailable('METHOD_UNSUPPORTED', 'No validated model is available for this reference yet.');
  }

  if (!present(benchmark.source) || !present(benchmark.dataset_version) || !present(benchmark.benchmark_version)) {
    return unavailable('PROVENANCE_INCOMPLETE', 'The reference is missing its source or version details.');
  }

  // Protocol: the reference must name how the result is measured, and this result must have been measured that way.
  if (!present(benchmark.test_protocol_id)) {
    return unavailable(
      'PROTOCOL_INCOMPATIBLE',
      'The reference does not say how the result should be measured, so it cannot be matched to yours.',
    );
  }
  const protocol = context.protocol ?? null;
  if (protocol && protocol.id !== benchmark.test_protocol_id) {
    return unavailable('PROTOCOL_INCOMPATIBLE', 'The reference names a different test protocol than the one provided.');
  }
  const protocolMatch = observation.measurementType
    ? matchProtocol(protocol, observation.measurementType)
    : ({ compatible: false, reason: 'MEASUREMENT_TYPE_MISMATCH' } as const);
  if (!protocolMatch.compatible) {
    return unavailable(
      'PROTOCOL_INCOMPATIBLE',
      protocolMatch.reason === 'NO_PROTOCOL_CONFIGURED'
        ? 'The reference names a test protocol that is not on record.'
        : 'The reference was measured a different way than this result.',
    );
  }

  // Unit.
  if (!present(benchmark.unit)) {
    return unavailable('UNIT_INCOMPATIBLE', 'The reference does not record the unit it uses.');
  }
  if (!observation.unit || !same(observation.unit, benchmark.unit)) {
    return unavailable(
      'UNIT_INCOMPATIBLE',
      `The reference is in ${benchmark.unit.trim()}; this result is${observation.unit ? ` in ${observation.unit.trim()}` : ' in an unknown unit'}.`,
    );
  }

  // Reference population: the row must say who it describes, and where the person names a group it must be that one.
  if (!present(benchmark.comparison_population) || !present(benchmark.geography) || !present(benchmark.population_type)) {
    return unavailable('REFERENCE_INCOMPATIBLE', 'The reference does not say which population it describes.');
  }
  const group = observation.subject?.referenceGroup;
  if (present(group) && !same(group, benchmark.comparison_population)) {
    return unavailable('REFERENCE_INCOMPATIBLE', `The reference describes ${benchmark.comparison_population}, not ${group.trim()}.`);
  }

  // Age band: a banded reference can only be matched to a person whose age is known and falls inside it.
  if (benchmark.age_min != null || benchmark.age_max != null) {
    const band = `${benchmark.age_min ?? 0}${benchmark.age_max != null ? `–${benchmark.age_max}` : '+'}`;
    const age = observation.subject?.age;
    if (age == null) {
      return unavailable('AGE_INCOMPATIBLE', `The reference covers ages ${band} and your age is not recorded.`);
    }
    if ((benchmark.age_min != null && age < benchmark.age_min) || (benchmark.age_max != null && age > benchmark.age_max)) {
      return unavailable('AGE_INCOMPATIBLE', `The reference covers ages ${band}, which does not include age ${age}.`);
    }
  }

  // Highest documented anchor reached.
  const direction = benchmark.direction ?? 'higher_is_better';
  const entries = Object.entries(benchmark.percentile_thresholds)
    .map(([percentile, value]) => ({ percentile: Number(percentile), value }))
    .filter((e) => Number.isFinite(e.percentile));
  if (entries.length === 0) {
    return unavailable('NO_THRESHOLDS', 'The reference has no documented thresholds.');
  }

  let reached: { percentile: number; value: number } | null = null;
  for (const entry of entries) {
    const meets = direction === 'higher_is_better' ? observation.value >= entry.value : observation.value <= entry.value;
    if (meets && (!reached || entry.percentile > reached.percentile)) reached = entry;
  }
  if (!reached) {
    return unavailable('BELOW_LOWEST_ANCHOR', 'This result is below the lowest documented threshold.');
  }

  return {
    status: 'MATCHED',
    benchmark,
    percentile: reached.percentile,
    threshold: reached.value,
    observedValue: observation.value,
    provenance: {
      method,
      dataset_version: benchmark.dataset_version,
      benchmark_version: benchmark.benchmark_version,
    },
  };
}
