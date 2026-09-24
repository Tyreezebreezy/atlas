import { describe, expect, it } from 'vitest';
import type { Benchmark, TestProtocol } from '@atlas/data-model';
import {
  benchmarkEvaluationMethod,
  evaluateBenchmarkStrict,
  type BenchmarkEvaluationContext,
  type BenchmarkObservation,
  type StrictBenchmarkEvaluation,
} from './evaluateBenchmarkStrict';
import { BENCHMARK_DATASET_VERSION, BENCHMARK_SPECS } from './benchmarkData';
import { formatPercentileDisplay } from './formatPercentile';

// A fully specified strict-anchor definition. Every threshold here is a TEST FIXTURE (the anchors are the
// handoff's own worked example), not ATLAS data -- nothing in this file is seeded or shipped.
function benchmark(overrides: Partial<Benchmark> = {}): Benchmark {
  return {
    id: 'bm-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    metric: 'bench_press_1rm_lb',
    exercise_id: 'bench',
    age_min: null,
    age_max: null,
    age_group: null,
    comparison_population: 'general adult men',
    percentile_thresholds: { '50': 33, '70': 41, '80': 47, '90': 57 },
    source: 'test fixture',
    source_url: null,
    sample_description: null,
    year: null,
    method: null,
    notes: null,
    evidence_grade: 'C',
    dataset_version: 'test-dataset-1',
    evaluation_method: 'strict_anchor',
    test_protocol_id: 'proto-1',
    unit: 'lb',
    geography: 'United States',
    population_type: 'general population',
    benchmark_version: 'bench-1.0.0',
    ...overrides,
  };
}

function protocol(overrides: Partial<TestProtocol> = {}): TestProtocol {
  return {
    id: 'proto-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Estimated 1RM from a working set',
    measurement_type: 'reps_weight',
    is_timed: false,
    cadence: null,
    rom_requirements: null,
    rest_policy: null,
    source: null,
    protocol_version: 'v1',
    notes: null,
    ...overrides,
  };
}

function observation(value: number, overrides: Partial<BenchmarkObservation> = {}): BenchmarkObservation {
  return { value, unit: 'lb', measurementType: 'reps_weight', ...overrides };
}

const withProtocol: BenchmarkEvaluationContext = { protocol: protocol() };

function evaluate(
  bm: Benchmark | null,
  obs: BenchmarkObservation,
  context: BenchmarkEvaluationContext = withProtocol,
): StrictBenchmarkEvaluation {
  return evaluateBenchmarkStrict(bm, obs, context);
}

function expectUnavailable(result: StrictBenchmarkEvaluation, code: string): void {
  expect(result.status).toBe('NO_COMPATIBLE_BENCHMARK');
  if (result.status === 'NO_COMPATIBLE_BENCHMARK') {
    expect(result.code).toBe(code);
    expect(result.reason.length).toBeGreaterThan(0);
  }
}

describe('evaluateBenchmarkStrict: highest documented anchor', () => {
  it('reports the exact documented percentile when the result meets an anchor exactly', () => {
    const result = evaluate(benchmark(), observation(41));
    expect(result).toMatchObject({ status: 'MATCHED', percentile: 70, threshold: 41, observedValue: 41 });
  });

  it('reports "stronger than 70%" for a 45 against P50=33 / P70=41 / P80=47 / P90=57 -- not an invented 76%', () => {
    const result = evaluate(benchmark(), observation(45));
    expect(result.status).toBe('MATCHED');
    if (result.status === 'MATCHED') {
      expect(result.percentile).toBe(70);
      expect(formatPercentileDisplay({ percentile: result.percentile }, 'general adult men')).toBe(
        'Stronger than 70% of general adult men',
      );
    }
  });

  it('never returns a percentile that is not one of the documented anchors, for any result', () => {
    const documented = new Set([50, 70, 80, 90]);
    for (let value = 33; value <= 80; value += 0.5) {
      const result = evaluate(benchmark(), observation(value));
      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') expect(documented.has(result.percentile)).toBe(true);
    }
  });

  it('reports the top documented percentile once the result exceeds every anchor, never above it', () => {
    const result = evaluate(benchmark(), observation(500));
    expect(result).toMatchObject({ status: 'MATCHED', percentile: 90 });
  });

  it('honors lower_is_better (e.g. a timed result)', () => {
    const timed = benchmark({
      metric: 'mile_time_seconds',
      unit: 'seconds',
      direction: 'lower_is_better',
      percentile_thresholds: { '50': 600, '75': 540, '90': 480 },
    });
    // 500 s beats the 540 (P75) anchor but not the 480 (P90) one.
    const result = evaluate(timed, observation(500, { unit: 'seconds' }));
    expect(result).toMatchObject({ status: 'MATCHED', percentile: 75 });
  });

  it('returns a typed result below the lowest documented threshold, never a fabricated low percentile', () => {
    expectUnavailable(evaluate(benchmark(), observation(5)), 'BELOW_LOWEST_ANCHOR');
  });

  it('returns a typed result for a benchmark with no thresholds', () => {
    expectUnavailable(evaluate(benchmark({ percentile_thresholds: {} }), observation(30)), 'NO_THRESHOLDS');
  });

  it('returns a typed result when there is no benchmark for the metric at all', () => {
    expectUnavailable(evaluate(null, observation(30)), 'NO_BENCHMARK');
  });
});

describe('evaluateBenchmarkStrict: compatibility gate', () => {
  it('is unavailable when the protocol does not match how the result was measured', () => {
    expectUnavailable(
      evaluate(benchmark(), observation(45, { measurementType: 'time' })),
      'PROTOCOL_INCOMPATIBLE',
    );
  });

  it('is unavailable when the reference names no protocol, or names one that is not on record', () => {
    expectUnavailable(evaluate(benchmark({ test_protocol_id: null }), observation(45)), 'PROTOCOL_INCOMPATIBLE');
    expectUnavailable(evaluate(benchmark(), observation(45), {}), 'PROTOCOL_INCOMPATIBLE');
    expectUnavailable(
      evaluate(benchmark(), observation(45), { protocol: protocol({ id: 'some-other-protocol' }) }),
      'PROTOCOL_INCOMPATIBLE',
    );
  });

  it('is unavailable when the result is in a different unit than the reference', () => {
    expectUnavailable(evaluate(benchmark(), observation(45, { unit: 'kg' })), 'UNIT_INCOMPATIBLE');
    expectUnavailable(evaluate(benchmark(), observation(45, { unit: null })), 'UNIT_INCOMPATIBLE');
    expectUnavailable(evaluate(benchmark({ unit: null }), observation(45)), 'UNIT_INCOMPATIBLE');
  });

  it('compares units without caring about case or spacing', () => {
    expect(evaluate(benchmark({ unit: 'LB ' }), observation(45, { unit: ' lb' })).status).toBe('MATCHED');
  });

  it('is unavailable when the person is outside the reference age band, or their age is not known', () => {
    const banded = benchmark({ age_min: 18, age_max: 30, age_group: '18-30' });
    expectUnavailable(evaluate(banded, observation(45, { subject: { age: 45 } })), 'AGE_INCOMPATIBLE');
    expectUnavailable(evaluate(banded, observation(45, { subject: { age: 12 } })), 'AGE_INCOMPATIBLE');
    expectUnavailable(evaluate(banded, observation(45)), 'AGE_INCOMPATIBLE'); // no profile: cannot be verified
    expect(evaluate(banded, observation(45, { subject: { age: 25 } })).status).toBe('MATCHED');
    // An age-agnostic reference needs no age.
    expect(evaluate(benchmark(), observation(45)).status).toBe('MATCHED');
  });

  it('is unavailable when the reference does not describe its population, or describes a different group than the person named', () => {
    expectUnavailable(evaluate(benchmark({ geography: null }), observation(45)), 'REFERENCE_INCOMPATIBLE');
    expectUnavailable(evaluate(benchmark({ population_type: '' }), observation(45)), 'REFERENCE_INCOMPATIBLE');
    expectUnavailable(
      evaluate(benchmark(), observation(45, { subject: { referenceGroup: 'trained women' } })),
      'REFERENCE_INCOMPATIBLE',
    );
    expect(
      evaluate(benchmark(), observation(45, { subject: { referenceGroup: 'General adult men' } })).status,
    ).toBe('MATCHED');
  });

  it('is unavailable when source or version provenance is missing', () => {
    expectUnavailable(evaluate(benchmark({ benchmark_version: null }), observation(45)), 'PROVENANCE_INCOMPLETE');
    expectUnavailable(evaluate(benchmark({ source: '  ' }), observation(45)), 'PROVENANCE_INCOMPLETE');
    expectUnavailable(evaluate(benchmark({ dataset_version: '' }), observation(45)), 'PROVENANCE_INCOMPLETE');
  });

  it('never falls back to an estimate: a failed gate returns no percentile at all', () => {
    const result = evaluate(benchmark({ unit: null }), observation(45));
    expect(result).not.toHaveProperty('percentile');
  });
});

describe('evaluateBenchmarkStrict: evaluation method', () => {
  it('treats a row with no evaluation_method (every v0.0.7 row) as legacy_interpolated and makes no claim from it', () => {
    const v007 = benchmark({ evaluation_method: undefined });
    expect(benchmarkEvaluationMethod(v007)).toBe('legacy_interpolated');
    // Even with every other field lining up perfectly.
    expectUnavailable(evaluate(v007, observation(45)), 'LEGACY_METHOD');
    expectUnavailable(evaluate(benchmark({ evaluation_method: 'legacy_interpolated' }), observation(45)), 'LEGACY_METHOD');
  });

  it('fails closed for a validated_model definition -- none exists yet, so nothing evaluates it', () => {
    const modeled = benchmark({ evaluation_method: 'validated_model' });
    expect(benchmarkEvaluationMethod(modeled)).toBe('validated_model');
    expectUnavailable(evaluate(modeled, observation(45)), 'METHOD_UNSUPPORTED');
  });

  it('reads an explicit method through unchanged', () => {
    expect(benchmarkEvaluationMethod(benchmark())).toBe('strict_anchor');
  });

  it('every benchmark row ATLAS currently seeds is legacy, so none produces a current claim', () => {
    // The seeded v0.0.7 dataset: ATLAS-modeled points, no evaluation_method or protocol/unit/version fields.
    const seeded = BENCHMARK_SPECS.map(
      (spec, index): Benchmark => ({
        id: `seed-${index}`,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        version: 1,
        device_id: 'seed',
        deleted_at: null,
        metric: spec.metric,
        exercise_id: null,
        age_min: spec.ageMin,
        age_max: spec.ageMax,
        age_group: spec.ageGroup,
        comparison_population: spec.comparisonPopulation,
        percentile_thresholds: spec.percentileThresholds,
        source: spec.source,
        source_url: spec.sourceUrl,
        sample_description: spec.sampleDescription,
        year: spec.year,
        method: spec.method,
        notes: spec.notes,
        evidence_grade: spec.evidenceGrade,
        dataset_version: BENCHMARK_DATASET_VERSION,
      }),
    );
    expect(seeded.length).toBeGreaterThan(0);
    for (const row of seeded) {
      expect(benchmarkEvaluationMethod(row)).toBe('legacy_interpolated');
      expectUnavailable(evaluate(row, observation(9999)), 'LEGACY_METHOD');
    }
  });
});

describe('evaluateBenchmarkStrict: provenance', () => {
  it('retains the method, dataset version and benchmark version on a matched result', () => {
    const result = evaluate(benchmark(), observation(45));
    expect(result.status).toBe('MATCHED');
    if (result.status === 'MATCHED') {
      expect(result.provenance).toEqual({
        method: 'strict_anchor',
        dataset_version: 'test-dataset-1',
        benchmark_version: 'bench-1.0.0',
      });
      expect(result.benchmark.source).toBe('test fixture'); // the source row travels with the claim
    }
  });
});
