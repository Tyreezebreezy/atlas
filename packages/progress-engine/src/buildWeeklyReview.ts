import { addDaysToIso, localDateOfInstant, sessionLocalDate } from '@atlas/core';
import { exposureSessions, prEventsInPeriod, type ExposureSessions } from '@atlas/pr-engine';
import type { BodyMeasurement, Milestone, PersonalRecordEvent, WorkoutSession } from '@atlas/data-model';
import type { StagnationSignal } from './detectStagnation';

/** `day` is a `YYYY-MM-DD` calendar date -- a session's local day, or a body measurement's own date. */
function inPeriod(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

/**
 * vNext Handoff 04B. Every "which day does this belong to" question in a weekly
 * review goes through the SESSION's local calendar day (`sessionLocalDate`):
 * the day the workout was performed on the device's clock, recorded when it
 * started -- or, for a session recorded before that existed, the viewer-local
 * day of its completion. Never the UTC date: slicing an ISO timestamp put a
 * 9 pm Sunday workout in the US into Monday's week.
 */
function sessionDay(session: WorkoutSession): string {
  return sessionLocalDate(session);
}

/** True when the exercise was trained in the period in a session that was NOT its first in that equipment context -- i.e. there is an earlier performance to compare it with. */
function hasComparisonInPeriod(
  exposures: ExposureSessions,
  exerciseId: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  for (const history of exposures.get(exerciseId)?.values() ?? []) {
    if (history.slice(1).some((s) => inPeriod(sessionDay(s), periodStart, periodEnd))) return true;
  }
  return false;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type WeeklyReviewStatus = 'BASELINE_WEEK' | 'ON_TRACK' | 'REVIEW_STALLED_EXERCISE' | 'INCOMPLETE_WEEK';

export interface WeeklyReview {
  period_start: string;
  period_end: string;
  planned_sessions: number | null;
  completed_sessions: number;
  adherence_ratio: number | null;
  /** Headline PRs -- exercise performances that beat an earlier record, one per exercise per session per equipment context, counted from the PR event history (`PersonalRecordEvent`). NOT the number of `PersonalRecord` rows, and not only the records that still stand: a PR a later session beat is still a PR that happened. A first-ever performance is a baseline, not a PR. */
  pr_count: number;
  milestone_count: number;
  /** Exercises trained this period that earned a headline PR. */
  exercises_progressed: number;
  /** Exercises trained this period with an earlier performance to compare against, no headline PR and no stall flag. An exercise whose only sessions this period were its first has nothing to compare yet and is in none of the three. */
  exercises_maintained: number;
  exercises_stalled: number;
  body_weight_average: number | null;
  prior_body_weight_average: number | null;
  status_code: WeeklyReviewStatus;
}

export interface WeeklyReviewInput {
  /** Inclusive, YYYY-MM-DD. Any weekly boundary convention works -- this function doesn't assume Mon-Sun. */
  periodStart: string;
  periodEnd: string;
  sessions: WorkoutSession[];
  /** The PR event history (pr-engine `derivePREventsForExercise`, persisted as `PersonalRecordEvent`) -- the historical layer, so a PR a later session beat still counts. Deliberately not the current-best `PersonalRecord` rows. */
  prEvents: PersonalRecordEvent[];
  milestones: Milestone[];
  bodyMeasurements: BodyMeasurement[];
  /** Precomputed by the caller (e.g. one detectStagnation call per exercise the owner trains) -- progress-engine doesn't own the exercise library, so it can't enumerate "every exercise" itself. */
  stagnationSignals: StagnationSignal[];
  /** Precomputed by the caller from the active Program's own schedule -- deliberately not resolved here, to avoid a new progress-engine -> program-engine dependency for one number. Null when there's no active program or it can't be resolved (e.g. a Sequential-mode program with no fixed weekly count). */
  plannedSessions?: number | null;
}

/**
 * vNext Handoff 02 (research pack v2 §20). A deterministic, fact-based
 * summary -- no LLM, no generated prose. Every count is a direct read over
 * already-existing records for the given period; nothing here is stored
 * anywhere, so recomputing for a different period or after a correction
 * "just works" the same way `calculatePRs`/`evaluateMilestones` do.
 */
export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const { periodStart, periodEnd, sessions, prEvents, milestones, bodyMeasurements, stagnationSignals } = input;
  const plannedSessions = input.plannedSessions ?? null;

  const completedInPeriod = sessions.filter(
    (s) => s.status === 'completed' && inPeriod(sessionDay(s), periodStart, periodEnd),
  );
  const hasPriorHistory = sessions.some((s) => s.status === 'completed' && sessionDay(s) < periodStart);

  const exposures = exposureSessions(sessions);
  // A PR belongs to the day of the workout that earned it -- the very day that
  // workout is counted under in `completed_sessions` -- so the session count and
  // the PR count of one week can never bucket differently.
  const dayBySessionId = new Map(sessions.map((s) => [s.id, sessionDay(s)]));
  const headlinePRs = prEventsInPeriod(
    prEvents,
    periodStart,
    periodEnd,
    (event) => dayBySessionId.get(event.session_id) ?? localDateOfInstant(event.achieved_at),
  );
  // A milestone belongs to the day of the workout that reached it when that is known.
  const milestoneDay = (m: Milestone): string =>
    (m.origin_session_id ? dayBySessionId.get(m.origin_session_id) : undefined) ?? localDateOfInstant(m.achieved_at ?? '');
  const milestonesInPeriod = milestones.filter(
    (m) => m.achieved_at != null && inPeriod(milestoneDay(m), periodStart, periodEnd),
  );

  const trainedExerciseIds = new Set<string>();
  for (const s of completedInPeriod) {
    for (const set of s.performed_sets) trainedExerciseIds.add(set.exercise_id);
  }
  const stalledExerciseIds = new Set(stagnationSignals.map((sig) => sig.exercise_id));
  const progressedExerciseIds = new Set(headlinePRs.map((event) => event.exercise_id));

  let exercisesProgressed = 0;
  let exercisesStalled = 0;
  let exercisesMaintained = 0;
  for (const exerciseId of trainedExerciseIds) {
    if (stalledExerciseIds.has(exerciseId)) exercisesStalled += 1;
    else if (progressedExerciseIds.has(exerciseId)) exercisesProgressed += 1;
    else if (hasComparisonInPeriod(exposures, exerciseId, periodStart, periodEnd)) exercisesMaintained += 1;
  }

  // Both are calendar dates (`YYYY-MM-DD`), so UTC midnights an exact number of days apart count the days.
  const periodLengthDays =
    Math.round((Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86_400_000) + 1;
  const priorPeriodEnd = addDaysToIso(periodStart, -1);
  const priorPeriodStart = addDaysToIso(priorPeriodEnd, -(periodLengthDays - 1));

  const bodyWeightAverage = average(
    bodyMeasurements
      .filter((m) => m.weight != null && inPeriod(m.date, periodStart, periodEnd))
      .map((m) => m.weight as number),
  );
  const priorBodyWeightAverage = average(
    bodyMeasurements
      .filter((m) => m.weight != null && inPeriod(m.date, priorPeriodStart, priorPeriodEnd))
      .map((m) => m.weight as number),
  );

  const adherenceRatio =
    plannedSessions != null && plannedSessions > 0 ? completedInPeriod.length / plannedSessions : null;

  let statusCode: WeeklyReviewStatus;
  if (!hasPriorHistory) statusCode = 'BASELINE_WEEK';
  else if (exercisesStalled > 0) statusCode = 'REVIEW_STALLED_EXERCISE';
  else if (plannedSessions != null && completedInPeriod.length < plannedSessions) statusCode = 'INCOMPLETE_WEEK';
  else statusCode = 'ON_TRACK';

  return {
    period_start: periodStart,
    period_end: periodEnd,
    planned_sessions: plannedSessions,
    completed_sessions: completedInPeriod.length,
    adherence_ratio: adherenceRatio,
    pr_count: headlinePRs.length,
    milestone_count: milestonesInPeriod.length,
    exercises_progressed: exercisesProgressed,
    exercises_maintained: exercisesMaintained,
    exercises_stalled: exercisesStalled,
    body_weight_average: bodyWeightAverage,
    prior_body_weight_average: priorBodyWeightAverage,
    status_code: statusCode,
  };
}
