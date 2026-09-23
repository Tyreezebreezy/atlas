import { describe, expect, it } from 'vitest';
import type { Benchmark } from '@atlas/data-model';
import { evaluateBenchmarkStrict } from './evaluateBenchmarkStrict';

function benchmark(overrides: Partial<Benchmark> = {}): Benchmark {
  return {
    id: 'bm-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    metric: 'pushups',
    exercise_id: null,
    age_min: null,
    age_max: null,
    age_group: null,
    comparison_population: 'general adult men',
    percentile_thresholds: { '50': 20, '75': 29, '90': 41 },
    source: 'test fixture',
    source_url: null,
    sample_description: null,
    year: null,
    method: null,
    notes: null,
    evidence_grade: 'D',
    dataset_version: 'test-1',
    ...overrides,
  };
}

describe('evaluateBenchmarkStrict', () => {
  it('reports the exact documented percentile when the value matches an anchor exactly', () => {
    const result = evaluateBenchmarkStrict(benchmark(), 29);
    expect(result).toEqual({ status: 'MATCHED', benchmark: benchmark(), percentile: 75, observedValue: 29 });
  });

  it('reports the HIGHEST documented percentile crossed, never an interpolated value in between', () => {
    // 35 is between the 29 (P75) and 41 (P90) anchors -- must report 75, never a fabricated ~83.
    const result = evaluateBenchmarkStrict(benchmark(), 35);
    expect(result.status).toBe('MATCHED');
    if (result.status === 'MATCHED') expect(result.percentile).toBe(75);
  });

  it('reports the top documented percentile once the value exceeds every anchor, never above 90', () => {
    const result = evaluateBenchmarkStrict(benchmark(), 100);
    expect(result.status).toBe('MATCHED');
    if (result.status === 'MATCHED') expect(result.percentile).toBe(90);
  });

  it('returns NO_COMPATIBLE_BENCHMARK when the value is below every documented threshold, never a fabricated low percentile', () => {
    const result = evaluateBenchmarkStrict(benchmark(), 5);
    expect(result.status).toBe('NO_COMPATIBLE_BENCHMARK');
  });

  it('returns NO_COMPATIBLE_BENCHMARK when no benchmark definition exists', () => {
    expect(evaluateBenchmarkStrict(null, 30).status).toBe('NO_COMPATIBLE_BENCHMARK');
  });

  it('returns NO_COMPATIBLE_BENCHMARK for a benchmark with no percentile thresholds', () => {
    const result = evaluateBenchmarkStrict(benchmark({ percentile_thresholds: {} }), 30);
    expect(result.status).toBe('NO_COMPATIBLE_BENCHMARK');
  });

  it('honors lower_is_better direction (e.g. an assistance/time metric)', () => {
    const timeBenchmark = benchmark({
      metric: 'mile_time_seconds',
      direction: 'lower_is_better',
      percentile_thresholds: { '50': 600, '75': 540, '90': 480 },
    });
    // 500 seconds beats the 540 (P75) anchor but not the 480 (P90) one.
    const result = evaluateBenchmarkStrict(timeBenchmark, 500);
    expect(result.status).toBe('MATCHED');
    if (result.status === 'MATCHED') expect(result.percentile).toBe(75);
  });

  it('retains the dataset/benchmark version on a matched result for provenance', () => {
    const result = evaluateBenchmarkStrict(benchmark({ dataset_version: 'atlas-benchmarks-2026.1' }), 30);
    expect(result.status).toBe('MATCHED');
    if (result.status === 'MATCHED') expect(result.benchmark.dataset_version).toBe('atlas-benchmarks-2026.1');
  });
});
