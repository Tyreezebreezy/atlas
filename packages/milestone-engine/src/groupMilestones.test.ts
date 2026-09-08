import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { createMilestone } from './createMilestone';
import { groupMilestones } from './groupMilestones';

function makeExercise(id: string, name: string): Exercise {
  const now = new Date().toISOString();
  return {
    id,
    created_at: now,
    updated_at: now,
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
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
  };
}

const BENCH = makeExercise('ex-bench', 'barbell bench press');
const PUSHUP = makeExercise('ex-pushup', 'push-up');
const PULLUP = makeExercise('ex-pullup', 'pull-up');
const exercisesById = new Map([
  [BENCH.id, BENCH],
  [PUSHUP.id, PUSHUP],
  [PULLUP.id, PULLUP],
]);

describe('groupMilestones', () => {
  it('groups by canonical exercise_id, not by title text', () => {
    const bench225 = createMilestone({
      title: '225 lb Bench Press',
      exerciseId: BENCH.id,
      dimension: 'weight',
      targetWeight: 225,
    });
    const pushup50 = createMilestone({
      title: '50 Push-Ups',
      exerciseId: PUSHUP.id,
      dimension: 'reps',
      targetReps: 50,
    });
    const bench135 = createMilestone({
      title: '135 lb Bench Press',
      exerciseId: BENCH.id,
      dimension: 'weight',
      targetWeight: 135,
    });

    // Deliberately out of order and interleaved, as they'd be if sorted by
    // achieved_at (the bug this replaces) -- bench appears twice, non-adjacent.
    const groups = groupMilestones([bench225, pushup50, bench135], exercisesById);

    expect(groups).toHaveLength(2);
    const benchGroup = groups.find((g) => g.exerciseId === BENCH.id);
    expect(benchGroup?.milestones).toHaveLength(2);
  });

  it('sorts within a group by semantic target ascending, not title-string order', () => {
    // Title-string order would put "100 Push-Ups" before "25 Push-Ups"
    // (string "1" < "2"); semantic order must not make that mistake.
    const p100 = createMilestone({
      title: '100 Push-Ups',
      exerciseId: PUSHUP.id,
      dimension: 'reps',
      targetReps: 100,
    });
    const p25 = createMilestone({
      title: '25 Push-Ups',
      exerciseId: PUSHUP.id,
      dimension: 'reps',
      targetReps: 25,
    });
    const p10 = createMilestone({
      title: '10 Push-Ups',
      exerciseId: PUSHUP.id,
      dimension: 'reps',
      targetReps: 10,
    });

    const groups = groupMilestones([p100, p25, p10], exercisesById);
    expect(groups[0]?.milestones.map((m) => m.target_reps)).toEqual([10, 25, 100]);
  });

  it('sorts weight-dimension milestones ascending by target weight', () => {
    const b315 = createMilestone({
      title: '315 lb Bench Press',
      exerciseId: BENCH.id,
      dimension: 'weight',
      targetWeight: 315,
    });
    const b135 = createMilestone({
      title: '135 lb Bench Press',
      exerciseId: BENCH.id,
      dimension: 'weight',
      targetWeight: 135,
    });
    const b225 = createMilestone({
      title: '225 lb Bench Press',
      exerciseId: BENCH.id,
      dimension: 'weight',
      targetWeight: 225,
    });
    const groups = groupMilestones([b315, b135, b225], exercisesById);
    expect(groups[0]?.milestones.map((m) => m.target_weight)).toEqual([135, 225, 315]);
  });

  it('sorts duration-dimension milestones ascending by target duration', () => {
    const threeMin = createMilestone({
      title: '3-Minute Plank',
      exerciseId: 'ex-plank',
      dimension: 'duration',
      targetDurationSeconds: 180,
    });
    const sixtySec = createMilestone({
      title: '60-Second Plank',
      exerciseId: 'ex-plank',
      dimension: 'duration',
      targetDurationSeconds: 60,
    });
    const twoMin = createMilestone({
      title: '2-Minute Plank',
      exerciseId: 'ex-plank',
      dimension: 'duration',
      targetDurationSeconds: 120,
    });
    const groups = groupMilestones([threeMin, sixtySec, twoMin], exercisesById);
    expect(groups[0]?.milestones.map((m) => m.target_duration_seconds)).toEqual([60, 120, 180]);
  });

  it('orders groups alphabetically by exercise display name', () => {
    const bench = createMilestone({
      title: '135 lb Bench Press',
      exerciseId: BENCH.id,
      dimension: 'weight',
      targetWeight: 135,
    });
    const pullup = createMilestone({
      title: '5 Pull-Ups',
      exerciseId: PULLUP.id,
      dimension: 'reps',
      targetReps: 5,
    });
    const pushup = createMilestone({
      title: '25 Push-Ups',
      exerciseId: PUSHUP.id,
      dimension: 'reps',
      targetReps: 25,
    });
    const groups = groupMilestones([pullup, pushup, bench], exercisesById);
    expect(groups.map((g) => g.displayName)).toEqual(['barbell bench press', 'pull-up', 'push-up']);
  });

  it('a milestone with no exercise_id gets its own singleton group by its own title, never dropped', () => {
    const custom = createMilestone({
      title: 'Squat Six Girlfriends',
      exerciseId: null,
      dimension: 'custom',
      referenceValue: 100,
      multiplier: 6,
    });
    const groups = groupMilestones([custom], exercisesById);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.displayName).toBe('Squat Six Girlfriends');
    expect(groups[0]?.milestones).toEqual([custom]);
  });

  it('achieved and not-yet-achieved milestones of the same movement land in the same group', () => {
    const achieved = {
      ...createMilestone({
        title: '135 lb Bench Press',
        exerciseId: BENCH.id,
        dimension: 'weight',
        targetWeight: 135,
      }),
      achieved_at: '2026-01-01T00:00:00.000Z',
    };
    const notYet = createMilestone({
      title: '225 lb Bench Press',
      exerciseId: BENCH.id,
      dimension: 'weight',
      targetWeight: 225,
    });
    const groups = groupMilestones([notYet, achieved], exercisesById);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.milestones).toEqual([achieved, notYet]);
  });
});
