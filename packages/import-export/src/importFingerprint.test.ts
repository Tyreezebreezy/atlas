import { describe, expect, it } from 'vitest';
import { computeImportFingerprint } from './importFingerprint';
import { findExistingImportByFingerprint } from './applyImport';
import type { Program, WorkoutTemplate } from '@atlas/data-model';

const workout = {
  kind: 'workout' as const,
  workout: {
    name: 'Gym Pump',
    is_quick_workout: true,
    exercises: [
      {
        order: 1,
        exercise_id: null,
        exercise_name: 'Bench Press',
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        target_weight: null,
        target_rpe: null,
        target_rir: null,
        target_duration_seconds: null,
        target_distance_meters: null,
        rest_seconds: null,
        notes: null,
      },
    ],
  },
};

describe('computeImportFingerprint', () => {
  it('is identical for the same content re-exported at a different time', () => {
    const first = computeImportFingerprint(workout);
    const reExported = computeImportFingerprint(JSON.parse(JSON.stringify(workout)));
    expect(reExported).toBe(first);
  });

  it('differs for genuinely different content', () => {
    const changed = {
      ...workout,
      workout: { ...workout.workout, name: 'Different Workout' },
    };
    expect(computeImportFingerprint(changed)).not.toBe(computeImportFingerprint(workout));
  });
});

describe('findExistingImportByFingerprint', () => {
  function makeProgram(overrides: Partial<Program>): Program {
    const now = new Date().toISOString();
    return {
      id: 'p1',
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: 'seed',
      deleted_at: null,
      name: 'Program',
      description: null,
      is_active: false,
      weeks: [],
      progression_mode: 'fixed',
      sequence_position: 0,
      ...overrides,
    };
  }

  function makeTemplate(overrides: Partial<WorkoutTemplate>): WorkoutTemplate {
    const now = new Date().toISOString();
    return {
      id: 't1',
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: 'seed',
      deleted_at: null,
      name: 'Template',
      exercises: [],
      is_quick_workout: true,
      groups: [],
      ...overrides,
    };
  }

  it('finds a previously-imported Program with a matching fingerprint', () => {
    const program = makeProgram({ import_fingerprint: 'abc123' });
    const found = findExistingImportByFingerprint('abc123', [program], []);
    expect(found?.id).toBe(program.id);
  });

  it('finds a previously-imported WorkoutTemplate with a matching fingerprint', () => {
    const template = makeTemplate({ import_fingerprint: 'abc123' });
    const found = findExistingImportByFingerprint('abc123', [], [template]);
    expect(found?.id).toBe(template.id);
  });

  it('ignores a soft-deleted match -- a removed import is not a duplicate to warn about', () => {
    const deleted = makeProgram({
      import_fingerprint: 'abc123',
      deleted_at: '2026-01-01T00:00:00.000Z',
    });
    expect(findExistingImportByFingerprint('abc123', [deleted], [])).toBeNull();
  });

  it('returns null when nothing matches (including a program authored directly, never imported)', () => {
    const authored = makeProgram({ import_fingerprint: null });
    expect(findExistingImportByFingerprint('abc123', [authored], [])).toBeNull();
  });
});
