import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { buildImportPreview } from './buildImportPreview';
import type { PlanExerciseTarget, PlanWorkout } from './types';

function exercise(name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: `ex-${name}`,
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
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

function target(
  overrides: Partial<PlanExerciseTarget> & { order: number; exercise_name: string },
): PlanExerciseTarget {
  return {
    exercise_id: null,
    target_sets: null,
    target_reps_min: null,
    target_reps_max: null,
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

const library = [
  exercise('Bench Press'),
  exercise('Pull-Up', { measurement_type: 'reps_bodyweight' }),
];

describe('buildImportPreview', () => {
  it('marks a matched exercise resolved and an unmatched one unresolved, without crashing or dropping either', () => {
    const workout: PlanWorkout = {
      name: 'Upper',
      is_quick_workout: false,
      exercises: [
        target({ order: 1, exercise_name: 'Bench Press', target_sets: 4 }),
        target({ order: 2, exercise_name: 'Nonexistent Cable Thing' }),
      ],
    };
    const preview = buildImportPreview({ kind: 'workout', workout }, library);
    expect(preview.kind).toBe('workout');
    if (preview.kind !== 'workout') return;
    expect(preview.workout.exercises[0]?.match.confidence).toBe('exact');
    expect(preview.workout.exercises[1]?.match.confidence).toBe('unresolved');
    expect(preview.workout.warnings.some((w) => w.message.includes('could not be matched'))).toBe(
      true,
    );
  });

  it('flags duplicate exercise names within one workout', () => {
    const workout: PlanWorkout = {
      name: 'Upper',
      is_quick_workout: false,
      exercises: [
        target({ order: 1, exercise_name: 'Bench Press' }),
        target({ order: 2, exercise_name: 'bench press' }),
      ],
    };
    const preview = buildImportPreview({ kind: 'workout', workout }, library);
    if (preview.kind !== 'workout') return;
    expect(
      preview.workout.exercises[0]?.warnings.some((w) => w.message.includes('more than once')),
    ).toBe(true);
  });

  it('flags an exercise with no sets/reps/duration/distance at all', () => {
    const workout: PlanWorkout = {
      name: 'Upper',
      is_quick_workout: false,
      exercises: [target({ order: 1, exercise_name: 'Bench Press' })],
    };
    const preview = buildImportPreview({ kind: 'workout', workout }, library);
    if (preview.kind !== 'workout') return;
    expect(preview.workout.exercises[0]?.warnings.some((w) => w.message.includes('No sets'))).toBe(
      true,
    );
  });

  it('handles a bodyweight-measured exercise the same as any other for matching purposes', () => {
    const workout: PlanWorkout = {
      name: 'Upper',
      is_quick_workout: false,
      exercises: [target({ order: 1, exercise_name: 'Pull-Up', target_sets: 3 })],
    };
    const preview = buildImportPreview({ kind: 'workout', workout }, library);
    if (preview.kind !== 'workout') return;
    expect(preview.workout.exercises[0]?.match.matched_exercise?.measurement_type).toBe(
      'reps_bodyweight',
    );
  });

  it('assigns globally-unique keys across a multi-day program, not just per-day order', () => {
    const dayWorkout = (name: string): PlanWorkout => ({
      name,
      is_quick_workout: false,
      exercises: [
        target({ order: 1, exercise_name: 'Nonexistent Thing A' }),
        target({ order: 2, exercise_name: 'Nonexistent Thing B' }),
      ],
    });
    const preview = buildImportPreview(
      {
        kind: 'program',
        program: {
          name: 'PPL',
          description: null,
          weeks: [
            {
              label: null,
              days: [
                { label: 'Day 1', workout: dayWorkout('Day 1') },
                { label: 'Day 2', workout: dayWorkout('Day 2') },
              ],
            },
          ],
        },
      },
      library,
    );
    if (preview.kind !== 'program') return;
    const allKeys =
      preview.program.weeks[0]?.days.flatMap((day) => day.workout.exercises.map((e) => e.key)) ??
      [];
    expect(new Set(allKeys).size).toBe(allKeys.length);
    expect(allKeys).toEqual(['0.0.0', '0.0.1', '0.1.0', '0.1.1']);
  });

  describe('absurd numbers (an import must not be able to make Gym Mode draw a billion set rows)', () => {
    const previewOf = (overrides: Partial<PlanExerciseTarget>) => {
      const workout: PlanWorkout = {
        name: 'W',
        is_quick_workout: true,
        exercises: [target({ order: 1, exercise_name: 'Bench Press', ...overrides })],
      };
      const preview = buildImportPreview({ kind: 'workout', workout }, library);
      if (preview.kind !== 'workout') throw new Error('expected a workout preview');
      const entry = preview.workout.exercises[0];
      if (!entry) throw new Error('expected one exercise');
      return entry;
    };

    it('leaves a value beyond the supported range blank, says so, and keeps everything sane next to it', () => {
      const entry = previewOf({
        target_sets: 1_000_000_000,
        target_reps_min: 5,
        target_reps_max: 5,
        target_weight: 1e12,
        rest_seconds: 120,
      });
      expect(entry.planned.target_sets).toBeNull();
      expect(entry.planned.target_weight).toBeNull();
      expect(entry.planned.target_reps_min).toBe(5);
      expect(entry.planned.rest_seconds).toBe(120);
      const messages = entry.warnings.map((w) => w.message);
      expect(messages).toContain(
        'Sets 1000000000 is beyond the supported range (up to 100); it was left blank.',
      );
      expect(messages.some((m) => m.startsWith('Weight 1000000000000 is beyond'))).toBe(true);
    });

    it('accepts a value exactly at the limit', () => {
      const entry = previewOf({
        target_sets: 100,
        target_reps_min: 999,
        target_reps_max: 999,
        target_weight: 5000,
        target_rpe: 10,
      });
      expect(entry.planned.target_sets).toBe(100);
      expect(entry.planned.target_reps_max).toBe(999);
      expect(entry.planned.target_weight).toBe(5000);
      expect(entry.planned.target_rpe).toBe(10);
      expect(
        entry.warnings.filter((w) => w.message.includes('beyond the supported range')),
      ).toEqual([]);
    });

    it('gives every out-of-range field its own message (the panel keys warnings by text)', () => {
      const entry = previewOf({
        target_reps_min: 5000,
        target_reps_max: 5000,
        target_duration_seconds: 999_999,
        target_distance_meters: 9_999_999,
        rest_seconds: 999_999,
        target_rir: 50,
      });
      const messages = entry.warnings
        .map((w) => w.message)
        .filter((m) => m.includes('beyond the supported range'));
      expect(messages).toHaveLength(6);
      expect(new Set(messages).size).toBe(6);
    });
  });
});
