import { describe, expect, it } from 'vitest';
import { validateAtlasPlan } from './validateAtlasPlan';

function validWorkoutDoc() {
  return {
    format: 'atlas-plan-v1',
    kind: 'workout',
    exported_at: '2026-08-31T00:00:00.000Z',
    workout: {
      name: 'Upper',
      is_quick_workout: false,
      exercises: [
        {
          order: 1,
          exercise_id: null,
          exercise_name: 'Bench Press',
          target_sets: 4,
          target_reps_min: 6,
          target_reps_max: 6,
          target_weight: null,
          target_rpe: null,
          target_rir: null,
          target_duration_seconds: null,
          target_distance_meters: null,
          rest_seconds: 120,
          notes: null,
        },
      ],
    },
  };
}

describe('validateAtlasPlan', () => {
  it('accepts a valid structured workout document', () => {
    const result = validateAtlasPlan(validWorkoutDoc());
    expect(result.valid).toBe(true);
  });

  it('accepts a valid structured program document', () => {
    const doc = {
      format: 'atlas-plan-v1',
      kind: 'program',
      exported_at: '2026-08-31T00:00:00.000Z',
      program: {
        name: 'Push Pull Legs',
        description: null,
        weeks: [
          {
            label: 'Week 1',
            days: [{ label: 'Monday — Upper', workout: validWorkoutDoc().workout }],
          },
        ],
      },
    };
    const result = validateAtlasPlan(doc);
    expect(result.valid).toBe(true);
  });

  it('rejects an unsupported format version cleanly, not by coercion', () => {
    const doc = { ...validWorkoutDoc(), format: 'atlas-plan-v2' };
    const result = validateAtlasPlan(doc);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.path).toBe('$.format');
  });

  it('rejects a missing format field', () => {
    const doc = validWorkoutDoc() as Record<string, unknown>;
    delete doc.format;
    expect(validateAtlasPlan(doc).valid).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(validateAtlasPlan({}).valid).toBe(false);
  });

  it('rejects a non-object top level (empty-file-like input)', () => {
    expect(validateAtlasPlan(null).valid).toBe(false);
    expect(validateAtlasPlan('').valid).toBe(false);
    expect(validateAtlasPlan(undefined).valid).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const doc = { ...validWorkoutDoc(), kind: 'mystery' };
    expect(validateAtlasPlan(doc).valid).toBe(false);
  });

  it('rejects a negative numeric target as a malformed file, not a silent clamp', () => {
    const doc = validWorkoutDoc();
    doc.workout.exercises[0]!.target_sets = -4;
    const result = validateAtlasPlan(doc);
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.issues.some((issue) => issue.path.includes('target_sets'))).toBe(true);
  });

  it('rejects a non-finite numeric target', () => {
    const doc = validWorkoutDoc() as unknown as {
      workout: { exercises: Array<Record<string, unknown>> };
    };
    doc.workout.exercises[0]!.target_weight = Number.POSITIVE_INFINITY;
    expect(validateAtlasPlan(doc).valid).toBe(false);
  });

  it('rejects an exercise with an empty name', () => {
    const doc = validWorkoutDoc();
    doc.workout.exercises[0]!.exercise_name = '   ';
    expect(validateAtlasPlan(doc).valid).toBe(false);
  });

  it('trims surrounding whitespace on names rather than rejecting it', () => {
    const doc = validWorkoutDoc();
    doc.workout.name = '  Upper  ';
    doc.workout.exercises[0]!.exercise_name = '  Bench Press  ';
    const result = validateAtlasPlan(doc);
    expect(result.valid).toBe(true);
    if (result.valid && result.value.kind === 'workout') {
      expect(result.value.workout.name).toBe('Upper');
      expect(result.value.workout.exercises[0]?.exercise_name).toBe('Bench Press');
    }
  });

  it('accepts a valid backup document and rejects one with a malformed entity', () => {
    const validEntity = {
      id: 'ex-1',
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
      version: 1,
      device_id: 'device-1',
      deleted_at: null,
      name: 'Custom Curl',
    };
    const backup = {
      format: 'atlas-plan-v1',
      kind: 'backup',
      exported_at: '2026-08-31T00:00:00.000Z',
      device_id: 'device-1',
      entities: {
        exercises: [validEntity],
        programs: [],
        workout_templates: [],
        workout_sessions: [],
        exercise_notes: [],
        program_notes: [],
        personal_records: [],
        milestones: [],
        body_measurements: [],
      },
    };
    expect(validateAtlasPlan(backup).valid).toBe(true);

    const malformed = structuredClone(backup);
    malformed.entities.exercises = [{ id: 'ex-1' }] as unknown as (typeof validEntity)[];
    expect(validateAtlasPlan(malformed).valid).toBe(false);
  });
});
