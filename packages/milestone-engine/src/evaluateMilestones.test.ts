import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  discardWorkoutSession,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import { createBodyMeasurement } from '@atlas/body-composition';
import type { BodyMeasurement, WorkoutSession } from '@atlas/data-model';
import { createMilestone } from './createMilestone';
import { evaluateMilestone, evaluateMilestones } from './evaluateMilestones';
import { newlyAchievedMilestones } from './detectNewMilestones';

function set(input: Partial<LogSetInput> & { exerciseId: string }) {
  return createPerformedSet({
    setIndex: 0,
    setType: 'working',
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    rir: null,
    notes: null,
    ...input,
  });
}

function completedSession(
  exerciseId: string,
  sets: ReturnType<typeof set>[],
  completedAt: string,
): WorkoutSession {
  let session = startWorkoutSession({
    name: 'Session',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
  });
  for (const s of sets) {
    session = addPerformedSet(session, { ...s, completed_at: completedAt });
  }
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

function weighIn(date: string, weight: number): BodyMeasurement {
  return createBodyMeasurement({ date, weight });
}

describe('evaluateMilestone: dimensions', () => {
  it('weight: achieved once a set reaches the target weight', () => {
    const milestone = createMilestone({
      title: '225 Bench',
      exerciseId: 'bench',
      dimension: 'weight',
      targetWeight: 225,
    });
    const notYet = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 205, reps: 5 })],
      '2026-08-01T10:00:00.000Z',
    );
    const achieves = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 225, reps: 1 })],
      '2026-08-08T10:00:00.000Z',
    );

    const result = evaluateMilestone(milestone, [notYet, achieves], []);
    expect(result.achieved_at).toBe('2026-08-08T10:00:00.000Z');
    expect(result.origin_session_id).toBe(achieves.id);
  });

  it('weight_and_reps: requires both thresholds on the SAME set', () => {
    const milestone = createMilestone({
      title: '225 For Reps',
      exerciseId: 'bench',
      dimension: 'weight_and_reps',
      targetWeight: 225,
      targetReps: 5,
    });
    // 225x1 alone doesn't satisfy it (not enough reps at that weight)
    const heavySingle = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 225, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const notAchieved = evaluateMilestone(milestone, [heavySingle], []);
    expect(notAchieved.achieved_at).toBeNull();

    const realDeal = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 225, reps: 5 })],
      '2026-08-08T10:00:00.000Z',
    );
    const achieved = evaluateMilestone(milestone, [heavySingle, realDeal], []);
    expect(achieved.achieved_at).toBe('2026-08-08T10:00:00.000Z');
  });

  it('reps: bodyweight rep target, no weight involved', () => {
    const milestone = createMilestone({
      title: '50 Push-Ups',
      exerciseId: 'pushup',
      dimension: 'reps',
      targetReps: 50,
    });
    const session = completedSession(
      'pushup',
      [set({ exerciseId: 'pushup', reps: 50 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = evaluateMilestone(milestone, [session], []);
    expect(result.achieved_at).toBe('2026-08-01T10:00:00.000Z');
  });

  it('duration: timed target', () => {
    const milestone = createMilestone({
      title: '2-Minute Plank',
      exerciseId: 'plank',
      dimension: 'duration',
      targetDurationSeconds: 120,
    });
    const session = completedSession(
      'plank',
      [set({ exerciseId: 'plank', durationSeconds: 123 })],
      '2026-08-01T10:00:00.000Z',
    );
    expect(evaluateMilestone(milestone, [session], []).achieved_at).not.toBeNull();
  });

  it('distance: distance target', () => {
    const milestone = createMilestone({
      title: '100yd Carry',
      exerciseId: 'carry',
      dimension: 'distance',
      targetDistanceMeters: 91.4,
    });
    const session = completedSession(
      'carry',
      [set({ exerciseId: 'carry', distanceMeters: 100 })],
      '2026-08-01T10:00:00.000Z',
    );
    expect(evaluateMilestone(milestone, [session], []).achieved_at).not.toBeNull();
  });

  it('volume: session-scoped total, not a single set', () => {
    const milestone = createMilestone({
      title: '10k Volume',
      exerciseId: 'bench',
      dimension: 'volume',
      targetVolume: 10000,
    });
    const session = completedSession(
      'bench',
      [
        set({ exerciseId: 'bench', weight: 225, reps: 8 }),
        set({ exerciseId: 'bench', weight: 225, reps: 8 }),
        set({ exerciseId: 'bench', weight: 225, reps: 8 }),
      ],
      '2026-08-01T10:00:00.000Z',
    );
    // 225*8*3 = 5400, not enough
    expect(evaluateMilestone(milestone, [session], []).achieved_at).toBeNull();

    const biggerSession = completedSession(
      'bench',
      Array.from({ length: 6 }, () => set({ exerciseId: 'bench', weight: 225, reps: 8 })),
      '2026-08-08T10:00:00.000Z',
    );
    // 225*8*6 = 10800
    const result = evaluateMilestone(milestone, [session, biggerSession], []);
    expect(result.achieved_at).toBe('2026-08-08T10:00:00.000Z');
  });

  it('custom equivalent: target_weight computed from reference * multiplier at creation', () => {
    const milestone = createMilestone({
      title: 'Squat Six Girlfriends',
      exerciseId: 'squat',
      dimension: 'custom',
      referenceValue: 100,
      multiplier: 6,
    });
    expect(milestone.target_weight).toBe(600);
    const session = completedSession(
      'squat',
      [set({ exerciseId: 'squat', weight: 600, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    expect(evaluateMilestone(milestone, [session], []).achieved_at).not.toBeNull();
  });
});

describe('evaluateMilestone: bodyweight_multiplier (v0.0.8 dynamic resolution)', () => {
  it('resolves the target from the latest logged bodyweight on or before the set date, and freezes it into target_weight on achievement', () => {
    const milestone = createMilestone({
      title: '2x Bodyweight Deadlift',
      exerciseId: 'deadlift',
      dimension: 'bodyweight_multiplier',
      multiplier: 2,
    });
    expect(milestone.target_weight).toBeNull(); // no static target at creation anymore

    const bodyMeasurements = [weighIn('2026-07-01', 180), weighIn('2026-08-15', 175)];
    // Set on 2026-08-01 -- latest weigh-in on/before that date is the 180 lb one, not the later 175 lb one.
    const session = completedSession(
      'deadlift',
      [set({ exerciseId: 'deadlift', weight: 365, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );

    const result = evaluateMilestone(milestone, [session], bodyMeasurements);
    expect(result.achieved_at).not.toBeNull();
    expect(result.target_weight).toBe(360); // 180 * 2, not 175 * 2
  });

  it('does not achieve when the set falls short of the resolved target', () => {
    const milestone = createMilestone({
      title: '2x Bodyweight Deadlift',
      exerciseId: 'deadlift',
      dimension: 'bodyweight_multiplier',
      multiplier: 2,
    });
    const bodyMeasurements = [weighIn('2026-07-01', 180)];
    const session = completedSession(
      'deadlift',
      [set({ exerciseId: 'deadlift', weight: 350, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    expect(evaluateMilestone(milestone, [session], bodyMeasurements).achieved_at).toBeNull();
  });

  it('falls back to the latest available bodyweight when none exists on or before the workout date', () => {
    const milestone = createMilestone({
      title: '2x Bodyweight Deadlift',
      exerciseId: 'deadlift',
      dimension: 'bodyweight_multiplier',
      multiplier: 2,
    });
    // Only weigh-in is AFTER the workout -- backfilling an old session before ever logging bodyweight.
    const bodyMeasurements = [weighIn('2026-09-01', 180)];
    const session = completedSession(
      'deadlift',
      [set({ exerciseId: 'deadlift', weight: 365, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = evaluateMilestone(milestone, [session], bodyMeasurements);
    expect(result.achieved_at).not.toBeNull();
    expect(result.target_weight).toBe(360);
  });

  it('cannot be evaluated when no bodyweight measurement exists at all', () => {
    const milestone = createMilestone({
      title: '2x Bodyweight Deadlift',
      exerciseId: 'deadlift',
      dimension: 'bodyweight_multiplier',
      multiplier: 2,
    });
    const session = completedSession(
      'deadlift',
      [set({ exerciseId: 'deadlift', weight: 365, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    expect(evaluateMilestone(milestone, [session], []).achieved_at).toBeNull();
  });

  it('does not retroactively alter an already-achieved milestone when a later, lower bodyweight is logged', () => {
    const milestone = createMilestone({
      title: '2x Bodyweight Deadlift',
      exerciseId: 'deadlift',
      dimension: 'bodyweight_multiplier',
      multiplier: 2,
    });
    const bodyMeasurements = [weighIn('2026-07-01', 180)];
    const session = completedSession(
      'deadlift',
      [set({ exerciseId: 'deadlift', weight: 365, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );

    const achieved = evaluateMilestone(milestone, [session], bodyMeasurements);
    expect(achieved.achieved_at).not.toBeNull();
    expect(achieved.target_weight).toBe(360);

    // A big weight-loss measurement logged AFTER achievement must not change anything on re-evaluation.
    const laterMeasurements = [...bodyMeasurements, weighIn('2026-09-01', 150)];
    const reEvaluated = evaluateMilestone(achieved, [session], laterMeasurements);
    expect(reEvaluated).toEqual(achieved);
    expect(reEvaluated.target_weight).toBe(360);
  });
});

describe('evaluateMilestone: state rules', () => {
  it('an inactive milestone is never evaluated', () => {
    const milestone = {
      ...createMilestone({
        title: 'X',
        exerciseId: 'bench',
        dimension: 'weight',
        targetWeight: 100,
      }),
      active: false,
    };
    const session = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 500, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    expect(evaluateMilestone(milestone, [session], []).achieved_at).toBeNull();
  });

  it('an already-achieved milestone is returned unchanged, never re-evaluated', () => {
    const achieved = {
      ...createMilestone({
        title: 'X',
        exerciseId: 'bench',
        dimension: 'weight',
        targetWeight: 100,
      }),
      achieved_at: '2020-01-01T00:00:00.000Z',
      origin_session_id: 'old-session',
      origin_set_id: 'old-set',
    };
    const session = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 500, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = evaluateMilestone(achieved, [session], []);
    expect(result).toEqual(achieved);
  });

  it('historical insertion: backfilling an earlier qualifying session assigns the earlier date', () => {
    const milestone = createMilestone({
      title: '225 Bench',
      exerciseId: 'bench',
      dimension: 'weight',
      targetWeight: 225,
    });
    const recent = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 225, reps: 1 })],
      '2026-08-15T10:00:00.000Z',
    );
    const olderQualifying = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 230, reps: 1 })],
      '2026-07-01T10:00:00.000Z',
    );

    const result = evaluateMilestone(milestone, [recent, olderQualifying], []);
    expect(result.achieved_at).toBe('2026-07-01T10:00:00.000Z');
    expect(result.origin_session_id).toBe(olderQualifying.id);
  });

  it('discarded sessions are excluded (never contribute to achievement)', () => {
    const milestone = createMilestone({
      title: '225 Bench',
      exerciseId: 'bench',
      dimension: 'weight',
      targetWeight: 225,
    });
    let discarded = startWorkoutSession({
      name: 'Abandoned',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
    });
    discarded = addPerformedSet(discarded, set({ exerciseId: 'bench', weight: 500, reps: 1 }));
    discarded = discardWorkoutSession(discarded);

    expect(evaluateMilestone(milestone, [discarded], []).achieved_at).toBeNull();
  });

  it('a skipped exercise (marked but with no sets) never satisfies a milestone', () => {
    const milestone = createMilestone({
      title: '10 Push-Ups',
      exerciseId: 'pushup',
      dimension: 'reps',
      targetReps: 10,
    });
    let session = startWorkoutSession({
      name: 'Partial',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
    });
    session = {
      ...session,
      skipped_exercises: [{ exercise_id: 'pushup', reason: null, skipped_at: session.updated_at }],
    };
    session = completeWorkoutSession(session);

    expect(evaluateMilestone(milestone, [session], []).achieved_at).toBeNull();
  });

  it('a milestone with no exercise_id is never evaluated (can never be achieved yet)', () => {
    const milestone = createMilestone({
      title: 'No exercise',
      exerciseId: null,
      dimension: 'weight',
      targetWeight: 100,
    });
    const session = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 500, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    expect(evaluateMilestone(milestone, [session], []).achieved_at).toBeNull();
  });

  it('origin session/set are persisted on achievement', () => {
    const milestone = createMilestone({
      title: '225 Bench',
      exerciseId: 'bench',
      dimension: 'weight',
      targetWeight: 225,
    });
    const session = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 225, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const result = evaluateMilestone(milestone, [session], []);
    expect(result.origin_session_id).toBe(session.id);
    expect(result.origin_set_id).toBe(session.performed_sets[0]?.id);
  });
});

describe('evaluateMilestones (batch) and newlyAchievedMilestones', () => {
  it('evaluates a batch and detects exactly the ones that newly flip to achieved', () => {
    const m1 = createMilestone({
      title: '225 Bench',
      exerciseId: 'bench',
      dimension: 'weight',
      targetWeight: 225,
    });
    const m2 = createMilestone({
      title: '50 Push-Ups',
      exerciseId: 'pushup',
      dimension: 'reps',
      targetReps: 50,
    });
    const alreadyDone = {
      ...createMilestone({
        title: 'Old',
        exerciseId: 'bench',
        dimension: 'weight',
        targetWeight: 100,
      }),
      achieved_at: '2020-01-01T00:00:00.000Z',
    };

    const session = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 225, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const before = [m1, m2, alreadyDone];
    const after = evaluateMilestones(before, [session], []);

    const newlyAchieved = newlyAchievedMilestones(before, after);
    expect(newlyAchieved).toHaveLength(1);
    expect(newlyAchieved[0]?.title).toBe('225 Bench');
  });
});
