import type { BodyMeasurement, Milestone, PersonalRecord, WorkoutSession } from '@atlas/data-model';
import type { StagnationSignal } from './detectStagnation';

function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
}

function addDaysIso(dateStr: string, days: number): string {
  const d = toUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inPeriod(dateStr: string, start: string, end: string): boolean {
  const d = dateStr.slice(0, 10);
  return d >= start && d <= end;
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
  pr_count: number;
  milestone_count: number;
  exercises_progressed: number;
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
  personalRecords: PersonalRecord[];
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
  const { periodStart, periodEnd, sessions, personalRecords, milestones, bodyMeasurements, stagnationSignals } = input;
  const plannedSessions = input.plannedSessions ?? null;

  const completedInPeriod = sessions.filter(
    (s) => s.status === 'completed' && inPeriod(s.completed_at ?? s.started_at, periodStart, periodEnd),
  );
  const hasPriorHistory = sessions.some(
    (s) => s.status === 'completed' && (s.completed_at ?? s.started_at).slice(0, 10) < periodStart,
  );

  const prsInPeriod = personalRecords.filter((pr) => inPeriod(pr.achieved_at, periodStart, periodEnd));
  const milestonesInPeriod = milestones.filter(
    (m) => m.achieved_at != null && inPeriod(m.achieved_at, periodStart, periodEnd),
  );

  const trainedExerciseIds = new Set<string>();
  for (const s of completedInPeriod) {
    for (const set of s.performed_sets) trainedExerciseIds.add(set.exercise_id);
  }
  const stalledExerciseIds = new Set(stagnationSignals.map((sig) => sig.exercise_id));
  const progressedExerciseIds = new Set(prsInPeriod.map((pr) => pr.exercise_id));

  let exercisesProgressed = 0;
  let exercisesStalled = 0;
  let exercisesMaintained = 0;
  for (const exerciseId of trainedExerciseIds) {
    if (stalledExerciseIds.has(exerciseId)) exercisesStalled += 1;
    else if (progressedExerciseIds.has(exerciseId)) exercisesProgressed += 1;
    else exercisesMaintained += 1;
  }

  const periodLengthDays =
    Math.round((toUtcDate(periodEnd).getTime() - toUtcDate(periodStart).getTime()) / 86_400_000) + 1;
  const priorPeriodEnd = addDaysIso(periodStart, -1);
  const priorPeriodStart = addDaysIso(priorPeriodEnd, -(periodLengthDays - 1));

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
    pr_count: prsInPeriod.length,
    milestone_count: milestonesInPeriod.length,
    exercises_progressed: exercisesProgressed,
    exercises_maintained: exercisesMaintained,
    exercises_stalled: exercisesStalled,
    body_weight_average: bodyWeightAverage,
    prior_body_weight_average: priorBodyWeightAverage,
    status_code: statusCode,
  };
}
