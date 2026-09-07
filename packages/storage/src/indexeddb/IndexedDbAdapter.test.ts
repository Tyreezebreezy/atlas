import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Benchmark,
  BodyMeasurement,
  Exercise,
  Milestone,
  PersonalRecord,
  WorkoutOccurrence,
} from '@atlas/data-model';
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

/**
 * bodyMeasurements has existed since v0.0.1 too, same reasoning as above --
 * v0.0.8 only added `notes`, no new store/index.
 */
describe('IndexedDbAdapter: v0.0.8 BodyMeasurement fields round-trip without a migration', () => {
  it('round-trips a BodyMeasurement including the new v0.0.8 notes field', async () => {
    const adapter = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    const now = new Date().toISOString();
    const measurement: BodyMeasurement = {
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: 'test-device',
      deleted_at: null,
      date: '2026-08-28',
      weight: 180,
      body_fat_percentage: 18.5,
      fat_mass: null,
      lean_mass: null,
      muscle_mass: null,
      water_percentage: null,
      visceral_fat: null,
      bone_mass: null,
      bmr: null,
      source: 'manual',
      notes: 'Morning weigh-in, fasted',
    };
    await adapter.bodyMeasurements.put(measurement);
    expect(await adapter.bodyMeasurements.get(measurement.id)).toEqual(measurement);
  });
});

function makeOccurrence(overrides: Partial<WorkoutOccurrence> = {}): WorkoutOccurrence {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: 'test-device',
    deleted_at: null,
    program_id: 'prog-1',
    program_day_id: 'day-1',
    original_date: '2026-09-01',
    effective_date: '2026-09-01',
    status: 'planned',
    replacement_template_id: null,
    session_id: null,
    notes: null,
    ...overrides,
  };
}

describe('IndexedDbAdapter: v0.2.0 WorkoutOccurrence (first real Dexie version bump)', () => {
  it('round-trips a WorkoutOccurrence', async () => {
    const adapter = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    const occurrence = makeOccurrence({ status: 'moved', effective_date: '2026-09-02' });
    await adapter.workoutOccurrences.put(occurrence);
    expect(await adapter.workoutOccurrences.get(occurrence.id)).toEqual(occurrence);
  });

  it('upgrades a real pre-v0.2.0 database (version 1 only) without losing existing data, and the new store works immediately after', async () => {
    const dbName = `atlas-test-upgrade-${crypto.randomUUID()}`;

    // Simulates a real owner device on v0.1.x: only the version(1) schema
    // has ever been declared against this database name.
    const legacyDb = new Dexie(dbName);
    legacyDb.version(1).stores({
      exercises: 'id, name, is_custom, deleted_at',
      programs: 'id, is_active, deleted_at',
      workoutTemplates: 'id, is_quick_workout, deleted_at',
      workoutSessions: 'id, status, started_at, deleted_at',
      exerciseNotes: 'id, exercise_id, deleted_at',
      programNotes: 'id, program_id, deleted_at',
      personalRecords: 'id, exercise_id, kind, deleted_at',
      milestones: 'id, exercise_id, deleted_at',
      benchmarks: 'id, metric, deleted_at',
      bodyMeasurements: 'id, date, deleted_at',
    });
    await legacyDb.open();
    const preExistingExercise = makeExercise({ name: 'Owner Bench Press' });
    await legacyDb.table('exercises').put(preExistingExercise);
    legacyDb.close();

    // The real app upgrade: open the SAME database name with the current
    // (version 1 + version 2) schema, exactly what happens when an
    // existing install loads v0.2.0 code for the first time.
    const upgraded = new IndexedDbAdapter(dbName);

    const survived = await upgraded.exercises.get(preExistingExercise.id);
    expect(survived?.name).toBe('Owner Bench Press');

    const occurrence = makeOccurrence();
    await upgraded.workoutOccurrences.put(occurrence);
    expect(await upgraded.workoutOccurrences.get(occurrence.id)).toEqual(occurrence);
  });
});
