import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import { createBodyMeasurement } from '@atlas/body-composition';
import {
  calculatePRs,
  derivePREventsForExercise,
  exposureSessions,
  planPREventReconciliation,
  prEventsInPeriod,
} from '@atlas/pr-engine';
import type { Exercise, Milestone, PersonalRecordEvent, WorkoutSession } from '@atlas/data-model';
import { buildWeeklyReview, type WeeklyReviewInput } from './buildWeeklyReview';
import type { StagnationSignal } from './detectStagnation';
import { makeExercise } from './testFixtures';

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

function completedSession(sets: ReturnType<typeof set>[], completedAt: string): WorkoutSession {
  let session = startWorkoutSession({ name: 'Session', templateId: null, programId: null, programDayId: null, plannedSnapshot: [] });
  for (const s of sets) session = addPerformedSet(session, { ...s, completed_at: completedAt });
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

const lift = (exerciseId: string, weight: number, reps: number) => set({ exerciseId, weight, reps });

/** The PR event ledger the app would hold for these sessions -- built by the real derivation and reconciliation. */
function ledger(sessions: WorkoutSession[], ...exerciseIds: string[]): PersonalRecordEvent[] {
  const exposures = exposureSessions(sessions);
  return exerciseIds.flatMap((id) => {
    const exercise: Exercise = makeExercise({ id, name: id });
    return planPREventReconciliation([], derivePREventsForExercise(sessions, exercise, exposures), exposures).upsert;
  });
}

function baseInput(overrides: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    periodStart: '2026-08-03',
    periodEnd: '2026-08-09',
    sessions: [],
    prEvents: [],
    milestones: [],
    bodyMeasurements: [],
    stagnationSignals: [],
    ...overrides,
  };
}

const stall = (exerciseId: string): StagnationSignal => ({
  exercise_id: exerciseId,
  training_location_id: null,
  comparable_exposures: 3,
  first_exposure_date: '2026-07-01T00:00:00.000Z',
  last_exposure_date: '2026-08-05T00:00:00.000Z',
  reason_code: 'PROGRESS_STALLED',
});

describe('buildWeeklyReview', () => {
  it('reports BASELINE_WEEK when there is no completed session before this period', () => {
    const session = completedSession([lift('bench', 100, 8)], '2026-08-05T10:00:00.000Z');
    const review = buildWeeklyReview(baseInput({ sessions: [session] }));
    expect(review.status_code).toBe('BASELINE_WEEK');
    expect(review.completed_sessions).toBe(1);
  });

  it('reports ON_TRACK when prior history exists, nothing is stalled, and planned sessions are met', () => {
    const priorSession = completedSession([lift('bench', 95, 8)], '2026-07-20T10:00:00.000Z');
    const thisWeek = completedSession([lift('bench', 100, 8)], '2026-08-05T10:00:00.000Z');
    const review = buildWeeklyReview(baseInput({ sessions: [priorSession, thisWeek], plannedSessions: 1 }));
    expect(review.status_code).toBe('ON_TRACK');
    expect(review.adherence_ratio).toBe(1);
  });

  it('reports INCOMPLETE_WEEK when fewer sessions completed than planned', () => {
    const priorSession = completedSession([lift('bench', 95, 8)], '2026-07-20T10:00:00.000Z');
    const thisWeek = completedSession([lift('bench', 100, 8)], '2026-08-05T10:00:00.000Z');
    const review = buildWeeklyReview(baseInput({ sessions: [priorSession, thisWeek], plannedSessions: 4 }));
    expect(review.status_code).toBe('INCOMPLETE_WEEK');
    expect(review.adherence_ratio).toBe(0.25);
  });

  it('reports REVIEW_STALLED_EXERCISE when a stagnation signal exists, taking precedence over an otherwise-complete week', () => {
    const priorSession = completedSession([lift('bench', 95, 8)], '2026-07-20T10:00:00.000Z');
    const thisWeek = completedSession([lift('bench', 100, 8)], '2026-08-05T10:00:00.000Z');
    const review = buildWeeklyReview(
      baseInput({ sessions: [priorSession, thisWeek], plannedSessions: 1, stagnationSignals: [stall('bench')] }),
    );
    expect(review.status_code).toBe('REVIEW_STALLED_EXERCISE');
    expect(review.exercises_stalled).toBe(1);
  });

  it('classifies each trained exercise as exactly one of progressed/maintained/stalled -- and leaves a first-ever exercise out of all three', () => {
    // squat improves; bench and row repeat the same numbers (no improvement); curl is first done this week.
    const prior = completedSession([lift('squat', 95, 5), lift('bench', 100, 5), lift('row', 100, 5)], '2026-07-20T10:00:00.000Z');
    const thisWeek = completedSession(
      [lift('squat', 100, 5), lift('bench', 100, 5), lift('row', 100, 5), lift('curl', 30, 10)],
      '2026-08-05T10:00:00.000Z',
    );
    const sessions = [prior, thisWeek];

    const review = buildWeeklyReview(
      baseInput({ sessions, prEvents: ledger(sessions, 'squat', 'bench', 'row', 'curl'), stagnationSignals: [stall('row')] }),
    );
    expect(review.exercises_progressed).toBe(1); // squat
    expect(review.exercises_maintained).toBe(1); // bench
    expect(review.exercises_stalled).toBe(1); // row
    // curl: nothing earlier to compare with, so it is in none of the three and is not a PR.
    expect(review.pr_count).toBe(1);
  });

  it('counts one PR per exercise performance, however many detailed records it beat', () => {
    const prior = completedSession([lift('bench', 95, 8)], '2026-07-20T10:00:00.000Z');
    const session = completedSession([lift('bench', 100, 8), lift('bench', 95, 10)], '2026-08-05T10:00:00.000Z');
    const sessions = [prior, session];
    const prEvents = ledger(sessions, 'bench');

    expect(prEvents).toHaveLength(1);
    expect(prEvents[0]?.pr_kinds.length).toBeGreaterThanOrEqual(3);
    const review = buildWeeklyReview(baseInput({ sessions, prEvents }));
    expect(review.pr_count).toBe(1);
    expect(review.exercises_progressed).toBe(1);
  });

  it('does not count a first-ever performance as a PR', () => {
    const session = completedSession([lift('bench', 100, 8), lift('bench', 105, 5)], '2026-08-05T10:00:00.000Z');
    const prEvents = ledger([session], 'bench');
    const review = buildWeeklyReview(baseInput({ sessions: [session], prEvents }));
    expect(prEvents).toEqual([]);
    expect(review.status_code).toBe('BASELINE_WEEK');
    expect(review.pr_count).toBe(0);
    expect(review.exercises_progressed).toBe(0);
  });

  it('counts an earlier PR that a later session beat: the week reports 3 PRs, not the 1 that still stands', () => {
    // Every session beats ALL of the previous one's records, so after Wednesday only Wednesday holds any.
    const prior = completedSession([lift('bench', 215, 5)], '2026-07-20T10:00:00.000Z');
    const mon = completedSession([lift('bench', 225, 5)], '2026-08-03T10:00:00.000Z');
    const tue = completedSession([lift('bench', 230, 5), lift('bench', 225, 6)], '2026-08-04T10:00:00.000Z');
    const wed = completedSession([lift('bench', 235, 5), lift('bench', 230, 6), lift('bench', 225, 7)], '2026-08-05T10:00:00.000Z');
    const sessions = [prior, mon, tue, wed];

    const standing = new Set(
      calculatePRs(sessions, makeExercise({ id: 'bench', name: 'bench' })).map((r) => r.source_session_id),
    );
    expect(standing).toEqual(new Set([prior.id, wed.id])); // Monday and Tuesday hold no record any more

    const review = buildWeeklyReview(baseInput({ sessions, prEvents: ledger(sessions, 'bench') }));
    expect(review.pr_count).toBe(3);
    expect(review.exercises_progressed).toBe(1); // one exercise, however many times it progressed
  });

  it('reports the same PR count as the ledger helper, whatever stagnation signals the caller supplies (Today passes none)', () => {
    const prior = completedSession([lift('bench', 95, 8)], '2026-07-20T10:00:00.000Z');
    const session = completedSession([lift('bench', 100, 8), lift('squat', 200, 5)], '2026-08-05T10:00:00.000Z');
    const sessions = [prior, session];
    const prEvents = ledger(sessions, 'bench', 'squat');
    const input = baseInput({ sessions, prEvents });

    const viaHelper = prEventsInPeriod(prEvents, input.periodStart, input.periodEnd);
    expect(buildWeeklyReview(input).pr_count).toBe(viaHelper.length);
    expect(buildWeeklyReview({ ...input, stagnationSignals: [stall('squat')] }).pr_count).toBe(viaHelper.length);
    expect(viaHelper.map((e) => e.exercise_id)).toEqual(['bench']); // squat was first done this week: a baseline
  });

  it('counts PR events and milestones achieved within the period, excluding ones outside it', () => {
    const baseline = completedSession([lift('bench', 90, 8)], '2026-07-01T10:00:00.000Z');
    const earlier = completedSession([lift('bench', 95, 8)], '2026-07-20T10:00:00.000Z');
    const thisWeek = completedSession([lift('bench', 100, 8)], '2026-08-05T10:00:00.000Z');
    const sessions = [baseline, earlier, thisWeek];
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
    const prEvents = ledger(sessions, 'bench');
    expect(prEvents).toHaveLength(2); // Jul 20 and Aug 5; Jul 1 is the baseline

    const review = buildWeeklyReview(baseInput({ sessions, prEvents, milestones: [achievedMilestone] }));
    expect(review.pr_count).toBe(1); // only Aug 5 is inside the period
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
