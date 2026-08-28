import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Benchmark, Exercise, Milestone, PersonalRecord } from '@atlas/data-model';
import { IndexedDbAdapter } from './IndexedDbAdapter';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: 'test-device',
    deleted_at: null,
    name: 'Bench Press',
    aliases: [],
    category: 'chest',
    equipment: ['barbell'],
    target_muscle: 'chest',
    secondary_muscles: ['triceps'],
    instructions: [],
    movement_pattern: 'horizontal_push',
    is_unilateral: false,
    measurement_type: 'reps_weight',
    default_rest_seconds: 120,
    is_custom: false,
    source: 'test',
    source_id: null,
    user_notes: null,
    enrichment: null,
    ...overrides,
  };
}

describe('IndexedDbAdapter', () => {
  let adapter: IndexedDbAdapter;

  beforeEach(() => {
    adapter = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
  });

  it('round-trips put/get', async () => {
    const exercise = makeExercise();
    await adapter.exercises.put(exercise);
    const fetched = await adapter.exercises.get(exercise.id);
    expect(fetched).toEqual(exercise);
  });

  it('excludes soft-deleted entities from getAll but keeps them gettable by id', async () => {
    const exercise = makeExercise();
    await adapter.exercises.put(exercise);
    await adapter.exercises.softDelete(exercise.id);

    expect(await adapter.exercises.getAll()).toHaveLength(0);

    const fetched = await adapter.exercises.get(exercise.id);
    expect(fetched?.deleted_at).not.toBeNull();
  });

  it('keeps repositories isolated from each other', async () => {
    await adapter.exercises.put(makeExercise());
    expect(await adapter.programs.getAll()).toHaveLength(0);
  });

  it('putMany bulk inserts', async () => {
    const batch = [makeExercise(), makeExercise(), makeExercise()];
    await adapter.exercises.putMany(batch);

    const all = await adapter.exercises.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((e) => e.id).sort()).toEqual(batch.map((e) => e.id).sort());
  });
});

/**
 * personalRecords/milestones/benchmarks tables have existed since v0.0.1
 * (the Dexie store and SQLite table both predate any row ever being
 * written to them). v0.0.6 only added new fields to the Milestone/Benchmark
 * shape -- no new store, no new index -- so these round-trip with zero
 * Dexie version bump, proving the "whole document" storage design handles
 * this kind of schema growth without a migration. See docs/DATA_MODEL.md.
 */
describe('IndexedDbAdapter: v0.0.6 PR/Milestone/Benchmark fields round-trip without a migration', () => {
  let adapter: IndexedDbAdapter;

  beforeEach(() => {
    adapter = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
  });

  it('round-trips a PersonalRecord (schema unchanged since v0.0.1)', async () => {
    const now = new Date().toISOString();
    const pr: PersonalRecord = {
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: 'test-device',
      deleted_at: null,
      exercise_id: 'bench',
      kind: 'max_load',
      value: 225,
      reps: 1,
      achieved_at: now,
      source_session_id: 'session-1',
      source_set_id: 'set-1',
    };
    await adapter.personalRecords.put(pr);
    expect(await adapter.personalRecords.get(pr.id)).toEqual(pr);
  });

  it('round-trips a Milestone including the new v0.0.6 fields', async () => {
    const now = new Date().toISOString();
    const milestone: Milestone = {
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: 'test-device',
      deleted_at: null,
      title: 'Squat Six Girlfriends',
      exercise_id: 'squat',
      dimension: 'custom',
      target_weight: 600,
      target_reps: null,
      target_volume: null,
      target_duration_seconds: null,
      target_distance_meters: null,
      target_bodyweight_multiplier: null,
      reference_value: 100,
      multiplier: 6,
      is_builtin: false,
      active: true,
      achieved_at: null,
      origin_session_id: null,
      origin_set_id: null,
    };
    await adapter.milestones.put(milestone);
    expect(await adapter.milestones.get(milestone.id)).toEqual(milestone);
  });

  it('round-trips a Benchmark including the new v0.0.6 fields', async () => {
    const now = new Date().toISOString();
    const benchmark: Benchmark = {
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: 'test-device',
      deleted_at: null,
      metric: 'pushups',
      exercise_id: 'pushup',
      age_min: 20,
      age_max: 29,
      age_group: '20-29',
      comparison_population: 'general adult men',
      percentile_thresholds: { '50': 30, '90': 50 },
      source: 'ATLAS-modeled',
      source_url: null,
      sample_description: null,
      year: 2026,
      method: null,
      notes: null,
      evidence_grade: 'D',
      dataset_version: 'atlas-benchmarks-2026.1',
    };
    await adapter.benchmarks.put(benchmark);
    expect(await adapter.benchmarks.get(benchmark.id)).toEqual(benchmark);
  });
});
