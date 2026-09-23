import { eligibleSetsForExercise, type EligibleSet } from '@atlas/pr-engine';
import { resolveBodyweightForDate } from '@atlas/body-composition';
import type { BodyMeasurement, Milestone, PerformedSet, Program, WorkoutSession } from '@atlas/data-model';

interface MilestoneMatch {
  achievedAt: string;
  /** Null for a match with no single originating session (e.g. a body-weight goal, or a benchmark achievement the caller precomputed without one). */
  sessionId: string | null;
  /** Null for every dimension except the original per-set ones -- consistency/program-completion/body-weight/benchmark-threshold have no single originating set. */
  setId: string | null;
  /** Set only for 'bodyweight_multiplier' -- the resolved weight*multiplier target at the moment of achievement, frozen into target_weight so it never silently drifts if a later BodyMeasurement changes. */
  resolvedTargetWeight?: number;
}

/**
 * vNext Handoff 02. Additional data the four new non-exercise-scoped
 * dimensions need, kept optional so every existing call site (tests,
 * `evaluateMilestonesForSession.ts`) keeps compiling unchanged.
 * `benchmarkAchievements` is precomputed by the caller (milestone-engine
 * has no dependency on benchmark-engine) -- one entry per benchmark the
 * owner currently qualifies for, at whatever percentile they've reached.
 */
export interface MilestoneEvalContext {
  programs?: Program[];
  benchmarkAchievements?: BenchmarkAchievementInput[];
}

export interface BenchmarkAchievementInput {
  benchmark_id: string;
  percentile: number;
  achieved_at: string;
  session_id?: string | null;
}

/**
 * 'custom' precomputes `target_weight` at creation time (`reference_value *
 * multiplier`, see createMilestone.ts) -- a deliberately fixed number, so it
 * reduces to a plain weight-threshold check. 'bodyweight_multiplier' has no
 * static target: `bodyweightAtSet` (the resolved logged bodyweight as of
 * this particular set's date, see findSetMatch) times `milestone.multiplier`
 * is computed fresh for every candidate set, per the documented selection
 * rule in docs/BODY_COMPOSITION.md.
 */
function checkSet(
  milestone: Milestone,
  set: PerformedSet,
  bodyweightAtSet: number | null,
): boolean {
  switch (milestone.dimension) {
    case 'weight':
    case 'custom':
      return (
        milestone.target_weight != null &&
        set.weight != null &&
        set.weight >= milestone.target_weight
      );
    case 'bodyweight_multiplier':
      return (
        milestone.multiplier != null &&
        bodyweightAtSet != null &&
        set.weight != null &&
        set.weight >= bodyweightAtSet * milestone.multiplier
      );
    case 'weight_and_reps':
      return (
        milestone.target_weight != null &&
        milestone.target_reps != null &&
        set.weight != null &&
        set.reps != null &&
        set.weight >= milestone.target_weight &&
        set.reps >= milestone.target_reps
      );
    case 'reps':
      return milestone.target_reps != null && set.reps != null && set.reps >= milestone.target_reps;
    case 'duration':
      return (
        milestone.target_duration_seconds != null &&
        set.duration_seconds != null &&
        set.duration_seconds >= milestone.target_duration_seconds
      );
    case 'distance':
      return (
        milestone.target_distance_meters != null &&
        set.distance_meters != null &&
        set.distance_meters >= milestone.target_distance_meters
      );
    case 'volume':
      return false; // volume is session-scoped, not set-scoped -- see findVolumeMatch
    default:
      return false;
  }
}

/** Earliest eligible set (across all history) that satisfies the milestone, or null. */
function findSetMatch(
  milestone: Milestone,
  sessions: WorkoutSession[],
  bodyMeasurements: BodyMeasurement[],
): MilestoneMatch | null {
  if (!milestone.exercise_id) return null;
  const eligible = eligibleSetsForExercise(sessions, milestone.exercise_id);
  const sorted = [...eligible].sort((a, b) => a.set.completed_at.localeCompare(b.set.completed_at));
  for (const e of sorted) {
    const bodyweightAtSet =
      milestone.dimension === 'bodyweight_multiplier'
        ? resolveBodyweightForDate(bodyMeasurements, e.set.completed_at)
        : null;
    if (checkSet(milestone, e.set, bodyweightAtSet)) {
      const resolvedTargetWeight =
        bodyweightAtSet != null && milestone.multiplier != null
          ? bodyweightAtSet * milestone.multiplier
          : undefined;
      return {
        sessionId: e.session.id,
        setId: e.set.id,
        achievedAt: e.set.completed_at,
        resolvedTargetWeight,
      };
    }
  }
  return null;
}

/** Earliest SESSION (by its sets' completed_at) whose total weight*reps for this exercise meets the volume target. */
function findVolumeMatch(milestone: Milestone, sessions: WorkoutSession[]): MilestoneMatch | null {
  if (milestone.target_volume == null || !milestone.exercise_id) return null;
  const eligible = eligibleSetsForExercise(sessions, milestone.exercise_id);

  const bySession = new Map<string, EligibleSet[]>();
  for (const e of eligible) {
    const list = bySession.get(e.session.id) ?? [];
    list.push(e);
    bySession.set(e.session.id, list);
  }

  const sessionGroups = [...bySession.values()].map((list) =>
    [...list].sort((a, b) => a.set.completed_at.localeCompare(b.set.completed_at)),
  );
  sessionGroups.sort((a, b) =>
    (a[0]?.set.completed_at ?? '').localeCompare(b[0]?.set.completed_at ?? ''),
  );

  for (const list of sessionGroups) {
    let total = 0;
    for (const e of list) {
      if (e.set.weight != null && e.set.reps != null) total += e.set.weight * e.set.reps;
    }
    if (total < milestone.target_volume) continue;
    const last = list[list.length - 1];
    if (last) return { sessionId: last.session.id, setId: last.set.id, achievedAt: last.set.completed_at };
  }
  return null;
}

/** vNext Handoff 02. No exercise_id -- checked directly against BodyMeasurement history. "At least" a target, never "at most" (weight-loss direction is not modeled). */
function findBodyWeightMatch(
  milestone: Milestone,
  bodyMeasurements: BodyMeasurement[],
): MilestoneMatch | null {
  if (milestone.target_body_weight == null) return null;
  const sorted = [...bodyMeasurements].sort((a, b) => a.date.localeCompare(b.date));
  for (const m of sorted) {
    if (m.weight != null && m.weight >= milestone.target_body_weight) {
      return { achievedAt: m.date, sessionId: null, setId: null };
    }
  }
  return null;
}

/** ponytail: epoch-anchored 7-day buckets, not calendar Mon-Sun weeks -- close
 * enough for a streak count without taking a cross-package dependency on
 * program-engine's Mon-Sun WeekNavigator concept. Upgrade to a shared
 * week-boundary helper if the two ever need to agree exactly on where a
 * week starts. */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
function weekBucket(iso: string): number {
  return Math.floor(new Date(iso).getTime() / MS_PER_WEEK);
}

/** vNext Handoff 02. No exercise_id. Exactly one of `target_total_sessions`
 * (lifetime completed-session count) or `target_consecutive_weeks`
 * (consecutive 7-day buckets each containing >=1 completed session) is
 * expected to be set on the milestone. */
function findConsistencyMatch(milestone: Milestone, sessions: WorkoutSession[]): MilestoneMatch | null {
  const completed = [...sessions]
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (a.completed_at ?? a.started_at).localeCompare(b.completed_at ?? b.started_at));
  if (completed.length === 0) return null;

  if (milestone.target_total_sessions != null) {
    const nth = completed[milestone.target_total_sessions - 1];
    return nth ? { achievedAt: nth.completed_at ?? nth.started_at, sessionId: nth.id, setId: null } : null;
  }

  if (milestone.target_consecutive_weeks != null) {
    const byBucket = new Map<number, WorkoutSession>();
    for (const s of completed) byBucket.set(weekBucket(s.completed_at ?? s.started_at), s);
    const buckets = [...byBucket.keys()].sort((a, b) => a - b);
    let streak = 1;
    for (let i = 0; i < buckets.length; i++) {
      if (i > 0) streak = buckets[i] === (buckets[i - 1] as number) + 1 ? streak + 1 : 1;
      if (streak >= milestone.target_consecutive_weeks) {
        const s = byBucket.get(buckets[i] as number) as WorkoutSession;
        return { achievedAt: s.completed_at ?? s.started_at, sessionId: s.id, setId: null };
      }
    }
  }
  return null;
}

/** vNext Handoff 02. No exercise_id. Achieved once every `ProgramDay` across
 * every `ProgramWeek` of `target_program_id` has at least one completed
 * `WorkoutSession` -- derived directly from session history (`program_id` +
 * `program_day_id`), not from `WorkoutOccurrence` rows, since occurrences
 * are created lazily (only on move/skip/replace) and most on-schedule
 * completions never get one. "Complete a training block" is taken to mean
 * "ran every day of the program at least once," a definition the current
 * schema (no explicit block/cycle boundary on Program) can actually answer.
 */
function findProgramCompletionMatch(
  milestone: Milestone,
  sessions: WorkoutSession[],
  programs: Program[],
): MilestoneMatch | null {
  if (!milestone.target_program_id) return null;
  const program = programs.find((p) => p.id === milestone.target_program_id);
  if (!program) return null;
  const dayIds = program.weeks.flatMap((w) => w.days.map((d) => d.id));
  if (dayIds.length === 0) return null;

  const completedAscending = [...sessions]
    .filter((s) => s.status === 'completed' && s.program_id === program.id && s.program_day_id)
    .sort((a, b) => (a.completed_at ?? a.started_at).localeCompare(b.completed_at ?? b.started_at));

  const earliestPerDay = new Map<string, WorkoutSession>();
  for (const s of completedAscending) {
    if (s.program_day_id && !earliestPerDay.has(s.program_day_id)) earliestPerDay.set(s.program_day_id, s);
  }
  if (!dayIds.every((id) => earliestPerDay.has(id))) return null;

  const completingSession = dayIds
    .map((id) => earliestPerDay.get(id) as WorkoutSession)
    .reduce((latest, s) =>
      (s.completed_at ?? s.started_at).localeCompare(latest.completed_at ?? latest.started_at) > 0
        ? s
        : latest,
    );
  return {
    achievedAt: completingSession.completed_at ?? completingSession.started_at,
    sessionId: completingSession.id,
    setId: null,
  };
}

/** vNext Handoff 02. No exercise_id required on the milestone. Milestone-engine
 * doesn't depend on benchmark-engine -- the caller precomputes which
 * benchmarks are currently crossed at which percentile and passes them in. */
function findBenchmarkThresholdMatch(
  milestone: Milestone,
  achievements: BenchmarkAchievementInput[],
): MilestoneMatch | null {
  if (!milestone.target_benchmark_id || milestone.target_percentile == null) return null;
  const targetPercentile = milestone.target_percentile;
  const relevant = achievements
    .filter((a) => a.benchmark_id === milestone.target_benchmark_id && a.percentile >= targetPercentile)
    .sort((a, b) => a.achieved_at.localeCompare(b.achieved_at));
  const first = relevant[0];
  return first ? { achievedAt: first.achieved_at, sessionId: first.session_id ?? null, setId: null } : null;
}

/** Dimensions with no exercise_id requirement -- everything else keeps the original "skip if no exercise_id" guard. */
const EXERCISE_FREE_DIMENSIONS = new Set(['body_weight', 'consistency', 'program_completion', 'benchmark_threshold']);

/**
 * A milestone is evaluated at most once: an already-achieved milestone
 * (`achieved_at != null`) is returned unchanged forever after -- unlike a
 * PR, a milestone doesn't track a "current best," it tracks "was this ever
 * reached." Inactive milestones are always skipped; milestones with no
 * `exercise_id` are skipped UNLESS their dimension is one of the four
 * vNext Handoff 02 dimensions that don't need one. Otherwise this is a full
 * recompute over all eligible history every time, so backfilling an older
 * qualifying session correctly assigns the earlier date -- there's no
 * incremental state to get out of sync.
 *
 * For 'bodyweight_multiplier', the resolved target at the moment of match
 * gets frozen into `target_weight` -- satisfying "do not retroactively
 * alter achieved status when future weight measurements change, preserve
 * the value used when achievement occurred" for free, the same way
 * achieved-once-never-re-evaluated already does for every other dimension.
 */
export function evaluateMilestone(
  milestone: Milestone,
  sessions: WorkoutSession[],
  bodyMeasurements: BodyMeasurement[],
  context: MilestoneEvalContext = {},
): Milestone {
  if (milestone.achieved_at != null) return milestone;
  if (!milestone.active) return milestone;

  const exerciseFree = EXERCISE_FREE_DIMENSIONS.has(milestone.dimension);
  if (!exerciseFree && !milestone.exercise_id) return milestone;

  const match = ((): MilestoneMatch | null => {
    switch (milestone.dimension) {
      case 'volume':
        return findVolumeMatch(milestone, sessions);
      case 'body_weight':
        return findBodyWeightMatch(milestone, bodyMeasurements);
      case 'consistency':
        return findConsistencyMatch(milestone, sessions);
      case 'program_completion':
        return findProgramCompletionMatch(milestone, sessions, context.programs ?? []);
      case 'benchmark_threshold':
        return findBenchmarkThresholdMatch(milestone, context.benchmarkAchievements ?? []);
      default:
        return findSetMatch(milestone, sessions, bodyMeasurements);
    }
  })();
  if (!match) return milestone;

  return {
    ...milestone,
    target_weight: match.resolvedTargetWeight ?? milestone.target_weight,
    achieved_at: match.achievedAt,
    origin_session_id: match.sessionId,
    origin_set_id: match.setId,
    updated_at: new Date().toISOString(),
    version: milestone.version + 1,
  };
}

export function evaluateMilestones(
  milestones: Milestone[],
  sessions: WorkoutSession[],
  bodyMeasurements: BodyMeasurement[],
  context: MilestoneEvalContext = {},
): Milestone[] {
  return milestones.map((m) => evaluateMilestone(m, sessions, bodyMeasurements, context));
}
