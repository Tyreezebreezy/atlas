import { eligibleSetsForExercise, type EligibleSet } from '@atlas/pr-engine';
import { resolveBodyweightForDate } from '@atlas/body-composition';
import type { BodyMeasurement, Milestone, PerformedSet, WorkoutSession } from '@atlas/data-model';

interface MilestoneMatch {
  session: WorkoutSession;
  setId: string;
  achievedAt: string;
  /** Set only for 'bodyweight_multiplier' -- the resolved weight*multiplier target at the moment of achievement, frozen into target_weight so it never silently drifts if a later BodyMeasurement changes. */
  resolvedTargetWeight?: number;
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
        session: e.session,
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
    if (last)
      return { session: last.session, setId: last.set.id, achievedAt: last.set.completed_at };
  }
  return null;
}

/**
 * A milestone is evaluated at most once: an already-achieved milestone
 * (`achieved_at != null`) is returned unchanged forever after -- unlike a
 * PR, a milestone doesn't track a "current best," it tracks "was this ever
 * reached." Inactive milestones and milestones with no exercise_id are also
 * skipped. Otherwise this is a full recompute over all eligible history
 * every time, so backfilling an older qualifying session correctly assigns
 * the earlier date -- there's no incremental state to get out of sync.
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
): Milestone {
  if (milestone.achieved_at != null) return milestone;
  if (!milestone.active) return milestone;
  if (!milestone.exercise_id) return milestone;

  const match =
    milestone.dimension === 'volume'
      ? findVolumeMatch(milestone, sessions)
      : findSetMatch(milestone, sessions, bodyMeasurements);
  if (!match) return milestone;

  return {
    ...milestone,
    target_weight: match.resolvedTargetWeight ?? milestone.target_weight,
    achieved_at: match.achievedAt,
    origin_session_id: match.session.id,
    origin_set_id: match.setId,
    updated_at: new Date().toISOString(),
    version: milestone.version + 1,
  };
}

export function evaluateMilestones(
  milestones: Milestone[],
  sessions: WorkoutSession[],
  bodyMeasurements: BodyMeasurement[],
): Milestone[] {
  return milestones.map((m) => evaluateMilestone(m, sessions, bodyMeasurements));
}
