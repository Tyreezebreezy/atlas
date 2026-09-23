import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import { createBodyMeasurement } from '@atlas/body-composition';
import type { Milestone, PersonalRecord, WorkoutSession } from '@atlas/data-model';
import { buildWeeklyReview, type WeeklyReviewInput } from './buildWeeklyReview';
import type { StagnationSignal } from './detectStagnation';

function set(input: Partial<LogSetInput> & { exerciseId: string }) {
  return createPerformedSet({
    setIndex: 0,
    setType: 'normal',
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

function completedSession(exerciseId: string, sets: ReturnType<typeof set>[], completedAt: string): WorkoutSession {
  let session = startWorkoutSession({ name: 'Session', templateId: null, programId: null, programDayId: null, plannedSnapshot: [] });
  for (const s of sets) session = addPerformedSet(session, { ...s, completed_at: completedAt });
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

function pr(overrides: Partial<PersonalRecord> & { exercise_id: string; achieved_at: string }): PersonalRecord {
  return {
    id: `pr-${overrides.exercise_id}-${overrides.achieved_at}`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    kind: 'max_load',
    value: 100,
    reps: 5,
    source_session_id: 'sess-1',
    source_set_id: 'set-1',
    training_location_id: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    periodStart: '2026-08-03',
    periodEnd: '2026-08-09',
    sessions: [],
    personalRecords: [],
    milestones: [],
    bodyMeasurements: [],
    stagnationSignals: [],
    ...overrides,
  };
}

describe('buildWeeklyReview', () => {
  it('reports BASELINE_WEEK when there is no completed session before this period', () => {
    const session = completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-05T10:00:00.000Z');
    const review = buildWeeklyReview(baseInput({ sessions: [session] }));
    expect(review.status_code).toBe('BASELINE_WEEK');
    expect(review.completed_sessions).toBe(1);
  });

  it('reports ON_TRACK when prior history exists, nothing is stalled, and planned sessions are met', () => {
    const priorSession = completedSession('bench', [set({ exerciseId: 'bench', weight: 95, reps: 8 })], '2026-07-20T10:00:00.000Z');
    const thisWeek = completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-05T10:00:00.000Z');
    const review = buildWeeklyReview(
      baseInput({ sessions: [priorSession, thisWeek], plannedSessions: 1 }),
    );
    expect(review.status_code).toBe('ON_TRACK');
    expect(review.adherence_ratio).toBe(1);
  });

  it('reports INCOMPLETE_WEEK when fewer sessions completed than planned', () => {
    const priorSession = completedSession('bench', [set({ exerciseId: 'bench', weight: 95, reps: 8 })], '2026-07-20T10:00:00.000Z');
    const thisWeek = completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-05T10:00:00.000Z');
    const review = buildWeeklyReview(baseInput({ sessions: [priorSession, thisWeek], plannedSessions: 4 }));
    expect(review.status_code).toBe('INCOMPLETE_WEEK');
    expect(review.adherence_ratio).toBe(0.25);
  });

  it('reports REVIEW_STALLED_EXERCISE when a stagnation signal exists, taking precedence over an otherwise-complete week', () => {
    const priorSession = completedSession('bench', [set({ exerciseId: 'bench', weight: 95, reps: 8 })], '2026-07-20T10:00:00.000Z');
    const thisWeek = completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-05T10:00:00.000Z');
    const signal: StagnationSignal = {
      exercise_id: 'bench',
      training_location_id: null,
      comparable_exposures: 3,
      first_exposure_date: '2026-07-01T00:00:00.000Z',
      last_exposure_date: '2026-08-05T00:00:00.000Z',
      reason_code: 'PROGRESS_STALLED',
    };
    const review = buildWeeklyReview(
      baseInput({ sessions: [priorSession, thisWeek], plannedSessions: 1, stagnationSignals: [signal] }),
    );
    expect(review.status_code).toBe('REVIEW_STALLED_EXERCISE');
    expect(review.exercises_stalled).toBe(1);
  });

  it('classifies each trained exercise as exactly one of progressed/maintained/stalled', () => {
    const priorSession = completedSession('bench', [set({ exerciseId: 'bench', weight: 95, reps: 8 })], '2026-07-20T10:00:00.000Z');
    const squatSet = set({ exerciseId: 'squat', weight: 200, reps: 5 });
    const benchSet = set({ exerciseId: 'bench', weight: 100, reps: 8 });
    const rowSet = set({ exerciseId: 'row', weight: 100, reps: 8 });
    let session = startWorkoutSession({ name: 'Session', templateId: null, programId: null, programDayId: null, plannedSnapshot: [] });
    session = addPerformedSet(session, { ...squatSet, completed_at: '2026-08-05T10:00:00.000Z' });
    session = addPerformedSet(session, { ...benchSet, completed_at: '2026-08-05T10:00:00.000Z' });
    session = addPerformedSet(session, { ...rowSet, completed_at: '2026-08-05T10:00:00.000Z' });
    session = completeWorkoutSession(session);
    session = { ...session, completed_at: '2026-08-05T10:00:00.000Z' };

    const squatPr = pr({ exercise_id: 'squat', achieved_at: '2026-08-05T10:00:00.000Z', source_session_id: session.id });
    const rowStall: StagnationSignal = {
      exercise_id: 'row',
      training_location_id: null,
      comparable_exposures: 3,
      first_exposure_date: '2026-07-01T00:00:00.000Z',
      last_exposure_date: '2026-08-05T00:00:00.000Z',
      reason_code: 'PROGRESS_STALLED',
    };

    const review = buildWeeklyReview(
      baseInput({
        sessions: [priorSession, session],
        personalRecords: [squatPr],
        stagnationSignals: [rowStall],
      }),
    );
    expect(review.exercises_progressed).toBe(1); // squat
    expect(review.exercises_maintained).toBe(1); // bench
    expect(review.exercises_stalled).toBe(1); // row
  });

  it('counts PRs and milestones achieved within the period, excluding ones outside it', () => {
    const inPeriod = pr({ exercise_id: 'bench', achieved_at: '2026-08-05T10:00:00.000Z' });
    const outOfPeriod = pr({ exercise_id: 'bench', achieved_at: '2026-07-01T10:00:00.000Z' });
    const achievedMilestone: Milestone = {
      id: 'm-1',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-08-06T00:00:00.000Z',
      version: 2,
      device_id: 'seed',
      deleted_at: null,
      title: 'X',
      exercise_id: 'bench',
      dimension: 'weight',
      target_weight: 100,
      target_reps: null,
      target_volume: null,
      target_duration_seconds: null,
      target_distance_meters: null,
      target_bodyweight_multiplier: null,
      reference_value: null,
      multiplier: null,
      is_builtin: false,
      active: true,
      achieved_at: '2026-08-06T00:00:00.000Z',
      origin_session_id: 'sess-1',
      origin_set_id: 'set-1',
    };
    const review = buildWeeklyReview(
      baseInput({ personalRecords: [inPeriod, outOfPeriod], milestones: [achievedMilestone] }),
    );
    expect(review.pr_count).toBe(1);
    expect(review.milestone_count).toBe(1);
  });

  it('averages body weight within the period and compares it to the equal-length PRIOR period, never mutating raw entries', () => {
    const bodyMeasurements = [
      createBodyMeasurement({ date: '2026-07-27', weight: 180 }), // prior period (7/27-8/2)
      createBodyMeasurement({ date: '2026-08-04', weight: 176 }), // this period (8/3-8/9)
      createBodyMeasurement({ date: '2026-08-06', weight: 174 }), // this period
    ];
    const review = buildWeeklyReview(baseInput({ bodyMeasurements }));
    expect(review.body_weight_average).toBe(175); // (176+174)/2
    expect(review.prior_body_weight_average).toBe(180);
    // Raw entries untouched.
    expect(bodyMeasurements[0]?.weight).toBe(180);
  });

  it('leaves adherence_ratio and planned_sessions null when nothing planned is known', () => {
    const review = buildWeeklyReview(baseInput());
    expect(review.planned_sessions).toBeNull();
    expect(review.adherence_ratio).toBeNull();
  });
});
