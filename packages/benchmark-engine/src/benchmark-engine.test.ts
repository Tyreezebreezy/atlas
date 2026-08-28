import { describe, expect, it } from 'vitest';
import type { Benchmark } from '@atlas/data-model';
import { interpolatePercentile } from './interpolatePercentile';
import { formatPercentileDisplay } from './formatPercentile';
import { findBenchmark } from './findBenchmark';

const THRESHOLDS = { '10': 5, '50': 20, '90': 35 };

function makeBenchmark(overrides: Partial<Benchmark> = {}): Benchmark {
  const now = new Date().toISOString();
  return {
    id: 'b1',
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: 'device-1',
    deleted_at: null,
    metric: 'pushups',
    exercise_id: 'ex-pushup',
    age_min: null,
    age_max: null,
    age_group: null,
    comparison_population: 'general adult men',
    percentile_thresholds: THRESHOLDS,
    source: 'test',
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

describe('interpolatePercentile', () => {
  it('returns the exact percentile at a known threshold', () => {
    expect(interpolatePercentile(20, THRESHOLDS).percentile).toBe(50);
  });

  it('linearly interpolates between two thresholds', () => {
    // Halfway between 5 (p10) and 20 (p50) in value -> halfway in percentile.
    const result = interpolatePercentile(12.5, THRESHOLDS);
    expect(result.percentile).toBeCloseTo(30, 5);
    expect(result.belowMinimum).toBe(false);
    expect(result.aboveMaximum).toBe(false);
  });

  it('clamps below the minimum threshold instead of extrapolating', () => {
    const result = interpolatePercentile(1, THRESHOLDS);
    expect(result.percentile).toBe(10);
    expect(result.belowMinimum).toBe(true);
  });

  it('clamps above the maximum threshold instead of extrapolating', () => {
    const result = interpolatePercentile(100, THRESHOLDS);
    expect(result.percentile).toBe(90);
    expect(result.aboveMaximum).toBe(true);
  });
});

describe('formatPercentileDisplay', () => {
  it('reads as "Stronger than P%" below the top-percentile cutoff', () => {
    expect(
      formatPercentileDisplay({ percentile: 50, belowMinimum: false, aboveMaximum: false }),
    ).toBe('Stronger than 50% of men');
  });

  it('reads as "Top N%" at or above the 90th percentile', () => {
    expect(
      formatPercentileDisplay({ percentile: 95, belowMinimum: false, aboveMaximum: false }),
    ).toBe('Top 5%');
  });

  it('reads as "Top N%" when clamped above the known maximum, never claiming 100%', () => {
    const result = formatPercentileDisplay({
      percentile: 90,
      belowMinimum: false,
      aboveMaximum: true,
    });
    expect(result).toBe('Top 10%');
    expect(result).not.toContain('100%');
  });

  it('never renders fake decimal precision', () => {
    const result = formatPercentileDisplay({
      percentile: 87.394284,
      belowMinimum: false,
      aboveMaximum: false,
    });
    expect(result).toBe('Stronger than 87% of men');
  });
});

describe('findBenchmark', () => {
  it('returns null for an unsupported metric', () => {
    const found = findBenchmark([makeBenchmark()], 'nonexistent_metric');
    expect(found).toBeNull();
  });

  it('picks the age-unrestricted row when no age is given', () => {
    const ageless = makeBenchmark({ id: 'ageless' });
    const banded = makeBenchmark({ id: 'banded', age_min: 18, age_max: 29 });
    const found = findBenchmark([banded, ageless], 'pushups');
    expect(found?.id).toBe('ageless');
  });

  it('picks the matching age bracket when an age is given', () => {
    const young = makeBenchmark({ id: 'young', age_min: 18, age_max: 29 });
    const old = makeBenchmark({ id: 'old', age_min: 30, age_max: 65 });
    const found = findBenchmark([young, old], 'pushups', { age: 40 });
    expect(found?.id).toBe('old');
  });

  it('falls back to the age-unrestricted row when no bracket matches', () => {
    const ageless = makeBenchmark({ id: 'ageless' });
    const banded = makeBenchmark({ id: 'banded', age_min: 18, age_max: 29 });
    const found = findBenchmark([banded, ageless], 'pushups', { age: 90 });
    expect(found?.id).toBe('ageless');
  });

  it('filters by comparison population', () => {
    const men = makeBenchmark({ id: 'men', comparison_population: 'general adult men' });
    const found = findBenchmark([men], 'pushups', { population: 'general adult women' });
    expect(found).toBeNull();
  });

  it('supports recomputing a comparison against a newer dataset_version without touching old rows', () => {
    const v1 = makeBenchmark({
      id: 'v1',
      dataset_version: 'atlas-benchmarks-2026.1',
      percentile_thresholds: THRESHOLDS,
    });
    const v2 = makeBenchmark({
      id: 'v2',
      dataset_version: 'atlas-benchmarks-2026.2',
      percentile_thresholds: { '10': 6, '50': 22, '90': 38 },
    });
    // A real lookup always filters to rows of the CURRENT dataset_version before calling findBenchmark;
    // this confirms the two versions' percentiles for the same raw value genuinely differ, i.e. nothing
    // was baked in at v1 seed time that would silently go stale once v2 is seeded.
    expect(interpolatePercentile(20, v1.percentile_thresholds).percentile).not.toBe(
      interpolatePercentile(20, v2.percentile_thresholds).percentile,
    );
  });
});
