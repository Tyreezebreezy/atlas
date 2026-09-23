import { describe, expect, it } from 'vitest';
import type { Exercise, TrainingLocation } from '@atlas/data-model';
import { buildImportCompatibilityReport } from './buildImportCompatibilityReport';
import type { ImportPreview, ImportPreviewExercise, PlanExerciseTarget } from './types';

function exercise(overrides: Partial<Exercise> & { name: string }): Exercise {
  return {
    id: `ex-${overrides.name}`,
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
    ...overrides,
  };
}

function planned(overrides: Partial<PlanExerciseTarget> & { exercise_name: string }): PlanExerciseTarget {
  return {
    order: 0,
    exercise_id: null,
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
    ...overrides,
  };
}

function previewExercise(
  key: string,
  plannedTarget: PlanExerciseTarget,
  matched: Exercise | null,
  confidence: 'exact' | 'normalized' | 'alias' | 'unresolved',
): ImportPreviewExercise {
  return {
    key,
    planned: plannedTarget,
    match: { input_name: plannedTarget.exercise_name, matched_exercise: matched, confidence, candidates: [] },
    warnings: [],
  };
}

function workoutPreview(exercises: ImportPreviewExercise[]): ImportPreview {
  return {
    kind: 'workout',
    workout: { name: 'Test Workout', is_quick_workout: false, exercises, warnings: [] },
  };
}

function location(equipment: string[]): TrainingLocation {
  return {
    id: 'loc-1',
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Home',
    equipment,
    note: null,
  };
}

describe('buildImportCompatibilityReport', () => {
  it('categorizes an exact/normalized match into matched_exercises, not alias_matches', () => {
    const benchPress = exercise({ name: 'Barbell Bench Press', equipment: ['barbell'] });
    const preview = workoutPreview([
      previewExercise('0', planned({ exercise_name: 'Barbell Bench Press' }), benchPress, 'exact'),
    ]);
    const report = buildImportCompatibilityReport(preview);
    expect(report.matched_exercises).toHaveLength(1);
    expect(report.alias_matches).toHaveLength(0);
    expect(report.unresolved_exercises).toHaveLength(0);
  });

  it('categorizes an alias match into both matched_exercises and alias_matches', () => {
    const chinUp = exercise({ name: 'Chin-Up' });
    const preview = workoutPreview([
      previewExercise('0', planned({ exercise_name: 'Underhand Pull-Up' }), chinUp, 'alias'),
    ]);
    const report = buildImportCompatibilityReport(preview);
    expect(report.matched_exercises).toHaveLength(1);
    expect(report.alias_matches).toHaveLength(1);
    expect(report.alias_matches[0]?.match.matched_exercise?.name).toBe('Chin-Up');
  });

  it('categorizes an unresolved exercise into unresolved_exercises only', () => {
    const preview = workoutPreview([
      previewExercise('0', planned({ exercise_name: 'Zzyzx Contraption' }), null, 'unresolved'),
    ]);
    const report = buildImportCompatibilityReport(preview);
    expect(report.matched_exercises).toHaveLength(0);
    expect(report.unresolved_exercises).toHaveLength(1);
  });

  it('reports missing equipment against the active training location', () => {
    const cablePress = exercise({ name: 'Cable Chest Press', equipment: ['cable machine'] });
    const preview = workoutPreview([
      previewExercise('0', planned({ exercise_name: 'Cable Chest Press' }), cablePress, 'exact'),
    ]);
    const report = buildImportCompatibilityReport(preview, location(['dumbbell', 'barbell']));
    expect(report.missing_equipment).toEqual([
      { exercise_name: 'Cable Chest Press', equipment: ['cable machine'] },
    ]);
  });

  it('reports no missing equipment when the active location has it (case-insensitive)', () => {
    const dbPress = exercise({ name: 'DB Press', equipment: ['Dumbbell'] });
    const preview = workoutPreview([
      previewExercise('0', planned({ exercise_name: 'DB Press' }), dbPress, 'exact'),
    ]);
    const report = buildImportCompatibilityReport(preview, location(['dumbbell']));
    expect(report.missing_equipment).toEqual([]);
  });

  it('skips the equipment check entirely when no active location is given', () => {
    const cablePress = exercise({ name: 'Cable Chest Press', equipment: ['cable machine'] });
    const preview = workoutPreview([
      previewExercise('0', planned({ exercise_name: 'Cable Chest Press' }), cablePress, 'exact'),
    ]);
    const report = buildImportCompatibilityReport(preview);
    expect(report.missing_equipment).toEqual([]);
  });

  it('flags an incompatible measurement type (plan expects duration, exercise logs weight/reps)', () => {
    const benchPress = exercise({ name: 'Barbell Bench Press', measurement_type: 'reps_weight' });
    const preview = workoutPreview([
      previewExercise(
        '0',
        planned({ exercise_name: 'Barbell Bench Press', target_duration_seconds: 30, target_reps_min: null, target_reps_max: null }),
        benchPress,
        'exact',
      ),
    ]);
    const report = buildImportCompatibilityReport(preview);
    expect(report.incompatible_measurement_types).toHaveLength(1);
    expect(report.incompatible_measurement_types[0]?.exercise_name).toBe('Barbell Bench Press');
  });

  it('does not flag a compatible plan/exercise pairing', () => {
    const plank = exercise({ name: 'Plank', measurement_type: 'time' });
    const preview = workoutPreview([
      previewExercise(
        '0',
        planned({ exercise_name: 'Plank', target_duration_seconds: 60, target_reps_min: null, target_reps_max: null }),
        plank,
        'exact',
      ),
    ]);
    const report = buildImportCompatibilityReport(preview);
    expect(report.incompatible_measurement_types).toEqual([]);
  });

  it('flattens a multi-day program preview into one report', () => {
    const benchPress = exercise({ name: 'Barbell Bench Press' });
    const squat = exercise({ name: 'Barbell Squat' });
    const preview: ImportPreview = {
      kind: 'program',
      program: {
        name: 'Test Program',
        description: null,
        warnings: [],
        weeks: [
          {
            label: null,
            days: [
              {
                label: 'Monday',
                workout: {
                  name: 'Upper',
                  is_quick_workout: false,
                  warnings: [],
                  exercises: [previewExercise('0.0.0', planned({ exercise_name: 'Barbell Bench Press' }), benchPress, 'exact')],
                },
              },
              {
                label: 'Tuesday',
                workout: {
                  name: 'Lower',
                  is_quick_workout: false,
                  warnings: [],
                  exercises: [previewExercise('0.1.0', planned({ exercise_name: 'Barbell Squat' }), squat, 'exact')],
                },
              },
            ],
          },
        ],
      },
    };
    const report = buildImportCompatibilityReport(preview);
    expect(report.matched_exercises).toHaveLength(2);
  });
});
