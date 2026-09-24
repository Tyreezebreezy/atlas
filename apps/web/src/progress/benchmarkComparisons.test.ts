import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BENCHMARK_DATASET_VERSION, BENCHMARK_SPECS } from '@atlas/benchmark-engine';
import type { Benchmark, Exercise, PersonalRecord, TestProtocol } from '@atlas/data-model';
import { BenchmarkList, benchmarkComparisons } from './BenchmarkComparisons';

const NOW = '2026-09-24T12:00:00.000Z';

function exercise(id: string, name: string, measurement: Exercise['measurement_type']): Exercise {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    version: 1,
    device_id: 'test',
    deleted_at: null,
    name,
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: measurement,
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
  };
}

const BENCH = exercise('bench', 'barbell bench press', 'reps_weight');
const PUSHUP = exercise('pushup', 'push-up', 'reps_bodyweight');
const EXERCISES = new Map([BENCH, PUSHUP].map((e) => [e.id, e]));

function pr(exerciseId: string, kind: PersonalRecord['kind'], value: number): PersonalRecord {
  return {
    id: `pr-${exerciseId}-${kind}`,
    created_at: NOW,
    updated_at: NOW,
    version: 1,
    device_id: 'test',
    deleted_at: null,
    exercise_id: exerciseId,
    kind,
    value,
    reps: null,
    achieved_at: NOW,
    source_session_id: 's',
    source_set_id: 'x',
    training_location_id: null,
  };
}

/** A row shaped exactly like the ones ATLAS seeds today (no evaluation_method, protocol, unit, geography or benchmark_version). */
function seededRow(metric: string, exerciseId: string): Benchmark {
  const spec = BENCHMARK_SPECS.find((s) => s.metric === metric);
  if (!spec) throw new Error(`no seeded spec for ${metric}`);
  return {
    id: `seed-${metric}`,
    created_at: NOW,
    updated_at: NOW,
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    metric,
    exercise_id: exerciseId,
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
  };
}

const PROTOCOL: TestProtocol = {
  id: 'proto-e1rm',
  created_at: NOW,
  updated_at: NOW,
  version: 1,
  device_id: 'test',
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
};

// A fully specified strict-anchor definition. The anchors are the handoff's own worked example -- a TEST FIXTURE, not seeded data.
function strictBench(overrides: Partial<Benchmark> = {}): Benchmark {
  return {
    ...seededRow('bench_press_1rm_lb', 'bench'),
    id: 'strict-bench',
    age_min: null,
    age_max: null,
    age_group: null,
    percentile_thresholds: { '50': 33, '70': 41, '80': 47, '90': 57 },
    source: 'Test fixture reference',
    sample_description: 'A fixture population',
    evaluation_method: 'strict_anchor',
    test_protocol_id: PROTOCOL.id,
    unit: 'lb',
    geography: 'United States',
    population_type: 'general population',
    benchmark_version: 'bench-1.0.0',
    dataset_version: 'fixture-2026.1',
    ...overrides,
  };
}

const render = (list: ReturnType<typeof benchmarkComparisons>) =>
  renderToStaticMarkup(createElement(BenchmarkList, { comparisons: list }));

describe('benchmark comparisons run through the strict evaluator', () => {
  it('states no percentile for the rows ATLAS seeds today (legacy, modeled points), whatever the result', () => {
    const rows = [seededRow('pushups', 'pushup'), seededRow('bench_press_1rm_lb', 'bench')];
    const comparisons = benchmarkComparisons(rows, [pr('pushup', 'bodyweight', 25), pr('bench', 'estimated_1rm', 205)], EXERCISES);

    expect(comparisons).toHaveLength(2);
    for (const c of comparisons) {
      expect(c.evaluation.status).toBe('NO_COMPATIBLE_BENCHMARK');
      if (c.evaluation.status === 'NO_COMPATIBLE_BENCHMARK') expect(c.evaluation.code).toBe('LEGACY_METHOD');
    }
    const html = render(comparisons);
    expect(html).toContain('No verified comparison available for this result.');
    expect(html).not.toMatch(/Stronger than|Top \d/);
    expect(html).not.toMatch(/\d+%/); // no percentage of any kind
    expect(html).toContain('Reference on file:'); // the source stays inspectable
    expect(html).not.toContain('error'); // a quiet state, not an error
  });

  it('shows a verified comparison at the highest documented anchor reached -- never an interpolated one', () => {
    const [comparison] = benchmarkComparisons([strictBench()], [pr('bench', 'estimated_1rm', 45)], EXERCISES, [PROTOCOL]);
    expect(comparison?.evaluation).toMatchObject({ status: 'MATCHED', percentile: 70, threshold: 41 });

    const html = render([comparison!]);
    expect(html).toContain('Stronger than 70% of general adult men');
    expect(html).not.toContain('76%');
    expect(html).not.toContain('No verified comparison');
  });

  it('keeps the source, protocol, reference population and version provenance inspectable under Details', () => {
    const comparisons = benchmarkComparisons([strictBench()], [pr('bench', 'estimated_1rm', 45)], EXERCISES, [PROTOCOL]);
    const html = render(comparisons);
    expect(html).toContain('<summary>Details</summary>');
    for (const fragment of [
      'Test fixture reference',
      'A fixture population',
      'general adult men (United States)',
      'measured as Estimated 1RM from a working set',
      'Highest documented threshold reached: P70 (41 lb)',
      'Nothing is estimated between thresholds',
      'Dataset fixture-2026.1',
      'benchmark bench-1.0.0',
    ]) {
      expect(html).toContain(fragment);
    }
    expect(html).not.toMatch(/evidence|grade/i); // the letter grade never reaches the card
  });

  it('puts verified comparisons before unavailable ones, in a stable order', () => {
    const rows = [seededRow('pushups', 'pushup'), strictBench()];
    const comparisons = benchmarkComparisons(
      rows,
      [pr('pushup', 'bodyweight', 25), pr('bench', 'estimated_1rm', 45)],
      EXERCISES,
      [PROTOCOL],
    );
    expect(comparisons.map((c) => [c.benchmark.metric, c.evaluation.status])).toEqual([
      ['bench_press_1rm_lb', 'MATCHED'],
      ['pushups', 'NO_COMPATIBLE_BENCHMARK'],
    ]);
  });

  it('is unavailable, not wrong, when the reference is age-banded and ATLAS holds no age', () => {
    const banded = strictBench({ age_min: 18, age_max: 30, age_group: '18-30' });
    const [comparison] = benchmarkComparisons([banded], [pr('bench', 'estimated_1rm', 45)], EXERCISES, [PROTOCOL]);
    expect(comparison?.evaluation).toMatchObject({ status: 'NO_COMPATIBLE_BENCHMARK', code: 'AGE_INCOMPATIBLE' });
    expect(render([comparison!])).toContain('your age is not recorded');
  });

  it('is unavailable when the reference uses a different unit than the result', () => {
    const kilos = strictBench({ unit: 'kg' });
    const [comparison] = benchmarkComparisons([kilos], [pr('bench', 'estimated_1rm', 45)], EXERCISES, [PROTOCOL]);
    expect(comparison?.evaluation).toMatchObject({ status: 'NO_COMPATIBLE_BENCHMARK', code: 'UNIT_INCOMPATIBLE' });
  });

  it('is unavailable when the protocol the reference names is not on record', () => {
    const [comparison] = benchmarkComparisons([strictBench()], [pr('bench', 'estimated_1rm', 45)], EXERCISES, []);
    expect(comparison?.evaluation).toMatchObject({ status: 'NO_COMPATIBLE_BENCHMARK', code: 'PROTOCOL_INCOMPATIBLE' });
  });

  it('shows nothing for a metric the person has no matching PR for, and one card per metric', () => {
    expect(benchmarkComparisons([seededRow('pushups', 'pushup')], [], EXERCISES)).toEqual([]);
    // A second stored version of the same metric must not produce a second card.
    const twice = benchmarkComparisons(
      [strictBench({ id: 'a' }), strictBench({ id: 'b', dataset_version: 'fixture-2026.2' })],
      [pr('bench', 'estimated_1rm', 45)],
      EXERCISES,
      [PROTOCOL],
    );
    expect(twice).toHaveLength(1);
  });

  it('leaves the stored benchmark rows exactly as they were', () => {
    const rows = [seededRow('pushups', 'pushup'), strictBench()];
    const snapshot = structuredClone(rows);
    benchmarkComparisons(rows, [pr('pushup', 'bodyweight', 25), pr('bench', 'estimated_1rm', 45)], EXERCISES, [PROTOCOL]);
    expect(rows).toEqual(snapshot);
  });
});
