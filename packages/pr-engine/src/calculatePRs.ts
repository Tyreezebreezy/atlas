import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { Exercise, PersonalRecord, PrKind } from '@atlas/data-model';
import type { WorkoutSession } from '@atlas/data-model';
import { eligibleSetsForExercise, type EligibleSet } from './eligibility';
import { DEFAULT_E1RM_ESTIMATOR } from './e1rmEstimators';

/** Highest keyFn value wins; on a tie, the FIRST item in array order wins -- pass items pre-sorted ascending by achieved_at so ties resolve to "first achieved." Items where keyFn returns null are skipped. */
function pickBest<T>(
  items: T[],
  keyFn: (item: T) => number | null,
): { item: T; value: number } | null {
  let best: { item: T; value: number } | null = null;
  for (const item of items) {
    const value = keyFn(item);
    if (value == null) continue;
    if (!best || value > best.value) best = { item, value };
  }
  return best;
}

function makePR(
  exerciseId: string,
  kind: PrKind,
  value: number,
  reps: number | null,
  source: EligibleSet,
  trainingLocationId: string | null,
  extra?: { estimator_id?: string; estimator_version?: string; load?: number },
): PersonalRecord {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    exercise_id: exerciseId,
    kind,
    value,
    reps,
    achieved_at: source.set.completed_at,
    source_session_id: source.session.id,
    source_set_id: source.set.id,
    training_location_id: trainingLocationId,
    estimator_id: extra?.estimator_id ?? null,
    estimator_version: extra?.estimator_version ?? null,
    load: extra?.load ?? null,
  };
}

/**
 * vNext Handoff 02. Groups already-eligible sets by their session's
 * `training_location_id` -- absent/null (every session before that field
 * existed, and any session the owner never tagged) is its own group, so
 * legacy history always resolves to exactly one group and this grouping is
 * a complete no-op for it. Only once real sessions start recording a
 * location do weight-bearing series actually split -- "170 lb at Gym A"
 * never silently merges with or overwrites "170 lb at Gym B." See
 * docs/PRS.md "Equipment-scoped series."
 */
function groupByLocation(sorted: EligibleSet[]): Map<string | null, EligibleSet[]> {
  const groups = new Map<string | null, EligibleSet[]>();
  for (const e of sorted) {
    const key = e.session.training_location_id ?? null;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return groups;
}

/** The exact v0.0.6-v1.0.0 per-exercise PR computation, now run once per
 * location group instead of once over the whole history -- see
 * `groupByLocation`. Identical output to before this handoff for any
 * exercise whose sessions carry no `training_location_id` (today, all of
 * them), since that's a single group containing every eligible set. */
function calculatePRsForGroup(
  sorted: EligibleSet[],
  exercise: Exercise,
  trainingLocationId: string | null,
): PersonalRecord[] {
  const records: PersonalRecord[] = [];

  const hasWeight = exercise.measurement_type === 'reps_weight';
  const isBodyweightOnly =
    exercise.measurement_type === 'reps' || exercise.measurement_type === 'reps_bodyweight';
  const hasDuration =
    exercise.measurement_type === 'time' || exercise.measurement_type === 'distance_time';
  const hasDistance =
    exercise.measurement_type === 'distance' || exercise.measurement_type === 'distance_time';

  if (hasWeight) {
    const maxLoad = pickBest(sorted, (e) => e.set.weight);
    if (maxLoad)
      records.push(
        makePR(
          exercise.id,
          'max_load',
          maxLoad.value,
          maxLoad.item.set.reps,
          maxLoad.item,
          trainingLocationId,
        ),
      );

    const bestRep = pickBest(sorted, (e) => e.set.reps);
    if (bestRep)
      records.push(makePR(exercise.id, 'rep', bestRep.value, null, bestRep.item, trainingLocationId));

    // rep_range: best weight per exact observed rep count -- generic over
    // whatever rep counts actually appear, not a hardcoded list of Ns.
    const byReps = new Map<number, EligibleSet>();
    for (const e of sorted) {
      if (e.set.weight == null || e.set.reps == null) continue;
      const existing = byReps.get(e.set.reps);
      if (!existing || e.set.weight > (existing.set.weight ?? -Infinity)) byReps.set(e.set.reps, e);
    }
    for (const [reps, e] of byReps) {
      records.push(
        makePR(exercise.id, 'rep_range', e.set.weight ?? 0, reps, e, trainingLocationId),
      );
    }

    // vNext Handoff 02. rep_at_load: the dual of rep_range -- best reps per
    // exact observed load, generic over whatever loads actually appear.
    // This is what registers "170x12 -> 170x15 -> 170x18" as three genuine
    // records even though the load itself never changes (an equipment
    // ceiling with no heavier implement available). See docs/PRS.md.
    const byLoad = new Map<number, EligibleSet>();
    for (const e of sorted) {
      if (e.set.weight == null || e.set.reps == null) continue;
      const existing = byLoad.get(e.set.weight);
      if (!existing || e.set.reps > (existing.set.reps ?? -Infinity)) byLoad.set(e.set.weight, e);
    }
    for (const [load, e] of byLoad) {
      records.push(
        makePR(exercise.id, 'rep_at_load', e.set.reps ?? 0, null, e, trainingLocationId, { load }),
      );
    }

    // vNext Handoff 02: Brzycki replaces Epley as the default estimator
    // (owner decision, research pack recommendation) -- see
    // e1rmEstimators.ts. Provenance is stored on every computed row so a
    // future default change is again a recorded fact, not a silent rewrite.
    const estimator = DEFAULT_E1RM_ESTIMATOR;
    const bestE1rm = pickBest(sorted, (e) =>
      e.set.weight != null && e.set.reps != null ? estimator.estimate(e.set.weight, e.set.reps) : null,
    );
    if (bestE1rm)
      records.push(
        makePR(
          exercise.id,
          'estimated_1rm',
          bestE1rm.value,
          bestE1rm.item.set.reps,
          bestE1rm.item,
          trainingLocationId,
          { estimator_id: estimator.id, estimator_version: estimator.version },
        ),
      );

    // volume: best single SESSION total (not per-set) -- sum(weight * reps)
    // over this exercise's eligible sets within one session, then the max
    // across sessions. Attributed to the last qualifying set in that
    // session (sorted ascending, so the last entry per session is the
    // latest) since a volume PR has no single originating set.
    const bySession = new Map<string, EligibleSet[]>();
    for (const e of sorted) {
      const list = bySession.get(e.session.id) ?? [];
      list.push(e);
      bySession.set(e.session.id, list);
    }
    let bestVolume: { value: number; last: EligibleSet } | null = null;
    for (const list of bySession.values()) {
      let total = 0;
      for (const e of list) {
        if (e.set.weight == null || e.set.reps == null) continue;
        total += e.set.weight * e.set.reps;
      }
      if (total <= 0) continue;
      const last = list[list.length - 1];
      if (last && (!bestVolume || total > bestVolume.value)) bestVolume = { value: total, last };
    }
    if (bestVolume)
      records.push(
        makePR(exercise.id, 'volume', bestVolume.value, null, bestVolume.last, trainingLocationId),
      );
  }

  if (isBodyweightOnly) {
    const bestBw = pickBest(sorted, (e) => e.set.reps);
    if (bestBw)
      records.push(
        makePR(exercise.id, 'bodyweight', bestBw.value, null, bestBw.item, trainingLocationId),
      );

    // v0.2.0. Only ever computed when at least one eligible set actually
    // used added load -- most reps_bodyweight history never does, and a
    // pure-bodyweight exercise should never grow a weighted-bodyweight PR
    // out of nowhere. The bodyweight analogue of max_load, reading
    // external_load instead of weight.
    const bestWeighted = pickBest(sorted, (e) => e.set.external_load ?? null);
    if (bestWeighted)
      records.push(
        makePR(
          exercise.id,
          'weighted_bodyweight',
          bestWeighted.value,
          bestWeighted.item.set.reps,
          bestWeighted.item,
          trainingLocationId,
        ),
      );
  }

  if (hasDuration) {
    const bestTimed = pickBest(sorted, (e) => e.set.duration_seconds);
    if (bestTimed)
      records.push(
        makePR(exercise.id, 'timed', bestTimed.value, null, bestTimed.item, trainingLocationId),
      );
  }

  if (hasDistance) {
    const bestDistance = pickBest(sorted, (e) => e.set.distance_meters);
    if (bestDistance)
      records.push(
        makePR(
          exercise.id,
          'distance',
          bestDistance.value,
          null,
          bestDistance.item,
          trainingLocationId,
        ),
      );
  }

  return records;
}

/**
 * Deterministically recomputes the full current set of PersonalRecord rows
 * for one exercise from completed workout history -- callable at any time
 * (an older/newer/stronger session inserted, an exercise replaced, history
 * corrected) with no dependency on what was previously stored. This IS the
 * recalculation mechanism the historical-integrity requirement asks for.
 *
 * Ties resolve to "first achieved": eligible sets are sorted ascending by
 * `completed_at` before comparison, and `pickBest` keeps the first item on
 * a tie, so two equal performances credit whichever happened earlier.
 *
 * Which kinds get computed is gated by `measurement_type` -- see
 * docs/PRS.md for the full table. vNext Handoff 02: sets are additionally
 * grouped by the source session's `training_location_id` before any kind
 * is computed (see `groupByLocation`) -- a no-op for any exercise whose
 * history has no recorded location.
 */
export function calculatePRs(sessions: WorkoutSession[], exercise: Exercise): PersonalRecord[] {
  const eligible = eligibleSetsForExercise(sessions, exercise.id);
  if (eligible.length === 0) return [];

  const sorted = [...eligible].sort((a, b) => a.set.completed_at.localeCompare(b.set.completed_at));
  const groups = groupByLocation(sorted);

  const records: PersonalRecord[] = [];
  for (const [trainingLocationId, group] of groups) {
    records.push(...calculatePRsForGroup(group, exercise, trainingLocationId));
  }
  return records;
}
