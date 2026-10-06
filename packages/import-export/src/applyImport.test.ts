import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { applyImport } from './applyImport';
import { buildImportPreview } from './buildImportPreview';
import type { PlanExerciseTarget, PlanWorkout } from './types';

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

async function seededStorage() {
  const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
  const benchPress = {
    id: 'ex-bench',
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Bench Press',
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight' as const,
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
  };
  await storage.exercises.put(benchPress);
  await storage.exercises.put({ ...benchPress, id: 'ex-row', name: 'Cable Row' });
  return storage;
}

describe('applyImport', () => {
  it('saves a matched workout with no user resolutions needed', async () => {
    const storage = await seededStorage();
    const workout: PlanWorkout = {
      name: 'Upper',
      is_quick_workout: false,
      exercises: [
        target({
          order: 1,
          exercise_name: 'Bench Press',
          target_sets: 4,
          target_reps_min: 6,
          target_reps_max: 6,
        }),
      ],
    };
    const preview = buildImportPreview(
      { kind: 'workout', workout },
      await storage.exercises.getAll(),
    );

    const result = await applyImport(preview, {}, storage);

    expect(result.workout_template?.exercises).toHaveLength(1);
    expect(result.created_exercises).toEqual([]);
    const saved = await storage.workoutTemplates.getAll();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.exercises[0]?.exercise_id).toBe('ex-bench');
    // A standalone workout import must be reachable from the Quick Workout
    // library -- there's no Program for it to attach to instead. Forced
    // true regardless of what the source document said, per applyImport.ts.
    expect(saved[0]?.is_quick_workout).toBe(true);
  });

  it('folds a repeated exercise into one entry, adding up the sets and keeping the first prescription', async () => {
    const storage = await seededStorage();
    const workout: PlanWorkout = {
      name: 'Pull',
      is_quick_workout: false,
      exercises: [
        target({
          order: 1,
          exercise_name: 'Cable Row',
          target_sets: 2,
          target_reps_min: 10,
          target_reps_max: 12,
        }),
        target({
          order: 2,
          exercise_name: 'Bench Press',
          target_sets: 3,
          target_reps_min: 5,
          target_reps_max: 5,
        }),
        target({
          order: 3,
          exercise_name: 'cable row',
          target_sets: 4,
          target_reps_min: 6,
          target_reps_max: 8,
        }),
      ],
    };
    const preview = buildImportPreview(
      { kind: 'workout', workout },
      await storage.exercises.getAll(),
    );
    expect(
      preview.kind === 'workout' &&
        preview.workout.exercises[2]?.warnings.map((w) => w.message).join(' '),
    ).toMatch(/merged into the first/);

    const result = await applyImport(preview, {}, storage);

    const saved = result.workout_template!.exercises;
    expect(saved.map((p) => p.exercise_id)).toEqual(['ex-row', 'ex-bench']);
    expect(saved[0]).toMatchObject({ target_sets: 6, target_reps_min: 10, target_reps_max: 12 });
  });

  it('drops a skipped unresolved exercise rather than blocking the whole import', async () => {
    const storage = await seededStorage();
    const workout: PlanWorkout = {
      name: 'Upper',
      is_quick_workout: false,
      exercises: [
        target({ order: 1, exercise_name: 'Bench Press', target_sets: 4 }),
        target({ order: 2, exercise_name: 'Made Up Exercise' }),
      ],
    };
    const preview = buildImportPreview(
      { kind: 'workout', workout },
      await storage.exercises.getAll(),
    );
    if (preview.kind !== 'workout') throw new Error('expected workout');
    const unresolvedKey = preview.workout.exercises[1]!.key;

    const result = await applyImport(preview, { [unresolvedKey]: { action: 'skip' } }, storage);

    expect(result.workout_template?.exercises).toHaveLength(1);
    expect(result.workout_template?.exercises[0]?.exercise_id).toBe('ex-bench');
  });

  it('creates a custom exercise for an unresolved item when the user chooses to', async () => {
    const storage = await seededStorage();
    const workout: PlanWorkout = {
      name: 'Upper',
      is_quick_workout: false,
      exercises: [target({ order: 1, exercise_name: 'Reverse Nordic Curl', target_sets: 3 })],
    };
    const preview = buildImportPreview(
      { kind: 'workout', workout },
      await storage.exercises.getAll(),
    );
    if (preview.kind !== 'workout') throw new Error('expected workout');
    const key = preview.workout.exercises[0]!.key;

    const result = await applyImport(preview, { [key]: { action: 'create_custom' } }, storage);

    expect(result.created_exercises).toHaveLength(1);
    expect(result.created_exercises[0]?.name).toBe('Reverse Nordic Curl');
    expect(result.created_exercises[0]?.is_custom).toBe(true);
    const persisted = await storage.exercises.get(result.created_exercises[0]!.id);
    expect(persisted).toBeDefined();
    expect(result.workout_template?.exercises[0]?.exercise_id).toBe(
      result.created_exercises[0]?.id,
    );
  });

  it('saves a multi-day program with resolutions addressed by globally-unique key, not colliding across days', async () => {
    const storage = await seededStorage();
    const dayWorkout = (): PlanWorkout => ({
      name: 'Day',
      is_quick_workout: false,
      exercises: [
        target({ order: 1, exercise_name: 'Bench Press', target_sets: 4 }),
        target({ order: 2, exercise_name: 'Unknown Move' }),
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
                { label: 'Day 1', workout: dayWorkout() },
                { label: 'Day 2', workout: dayWorkout() },
              ],
            },
          ],
        },
      },
      await storage.exercises.getAll(),
    );
    if (preview.kind !== 'program') throw new Error('expected program');

    // Day 1's unknown exercise: create custom. Day 2's: skip. Both share the
    // same in-day order (2), so this only works if keys are truly unique.
    const day1UnknownKey = preview.program.weeks[0]!.days[0]!.workout.exercises[1]!.key;
    const day2UnknownKey = preview.program.weeks[0]!.days[1]!.workout.exercises[1]!.key;
    expect(day1UnknownKey).not.toBe(day2UnknownKey);

    const result = await applyImport(
      preview,
      { [day1UnknownKey]: { action: 'create_custom' }, [day2UnknownKey]: { action: 'skip' } },
      storage,
    );

    expect(result.created_exercises).toHaveLength(1);
    const templates = await storage.workoutTemplates.getAll();
    expect(templates).toHaveLength(2);
    const day1Template = templates.find((t) => t.exercises.length === 2);
    const day2Template = templates.find((t) => t.exercises.length === 1);
    expect(day1Template).toBeDefined();
    expect(day2Template).toBeDefined();
    // Unlike a standalone workout import, a program day's template is
    // reached through its ProgramDay -- it must not also appear as a Quick
    // Workout.
    expect(day1Template?.is_quick_workout).toBe(false);
    expect(day2Template?.is_quick_workout).toBe(false);
  });

  it('turns a PlanExerciseGroup into a real ExerciseGroup once both members resolve', async () => {
    const storage = await seededStorage();
    const workout: PlanWorkout = {
      name: 'Pump',
      is_quick_workout: false,
      exercises: [
        target({ order: 1, exercise_name: 'Bench Press', target_sets: 3, group_key: 'ss1' }),
        target({ order: 2, exercise_name: 'Cable Row', target_sets: 3, group_key: 'ss1' }),
      ],
      groups: [{ key: 'ss1', type: 'superset', rounds: 3, rest_after_seconds: 45 }],
    };
    const preview = buildImportPreview(
      { kind: 'workout', workout },
      await storage.exercises.getAll(),
    );

    const result = await applyImport(preview, {}, storage);

    expect(result.workout_template?.groups).toHaveLength(1);
    const group = result.workout_template!.groups[0]!;
    expect(group).toMatchObject({ type: 'superset', rounds: 3, rest_after_seconds: 45 });
    const members = result.workout_template!.exercises.filter((e) => e.group_id === group.id);
    expect(members).toHaveLength(2);
  });

  it('ungroups a superset that loses a member to skip, rather than shipping a one-member group', async () => {
    const storage = await seededStorage();
    const workout: PlanWorkout = {
      name: 'Pump',
      is_quick_workout: false,
      exercises: [
        target({ order: 1, exercise_name: 'Bench Press', target_sets: 3, group_key: 'ss1' }),
        target({ order: 2, exercise_name: 'Totally Unknown Move', group_key: 'ss1' }),
      ],
      groups: [{ key: 'ss1', type: 'superset', rounds: 3, rest_after_seconds: null }],
    };
    const preview = buildImportPreview(
      { kind: 'workout', workout },
      await storage.exercises.getAll(),
    );
    if (preview.kind !== 'workout') throw new Error('expected workout');
    const unresolvedKey = preview.workout.exercises[1]!.key;

    const result = await applyImport(preview, { [unresolvedKey]: { action: 'skip' } }, storage);

    expect(result.workout_template?.exercises).toHaveLength(1);
    expect(result.workout_template?.groups).toEqual([]);
    expect(result.workout_template?.exercises[0]?.group_id).toBeNull();
  });
});
