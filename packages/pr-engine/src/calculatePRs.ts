import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { Exercise, PersonalRecord, PrKind } from '@atlas/data-model';
import type { WorkoutSession } from '@atlas/data-model';
import { eligibleSetsForExercise, type EligibleSet } from './eligibility';
import { estimated1RM } from './estimate1RM';

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
  };
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
 * docs/PRS.md for the full table.
 */
export function calculatePRs(sessions: WorkoutSession[], exercise: Exercise): PersonalRecord[] {
  const eligible = eligibleSetsForExercise(sessions, exercise.id);
  if (eligible.length === 0) return [];

  const sorted = [...eligible].sort((a, b) => a.set.completed_at.localeCompare(b.set.completed_at));
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
        makePR(exercise.id, 'max_load', maxLoad.value, maxLoad.item.set.reps, maxLoad.item),
      );

    const bestRep = pickBest(sorted, (e) => e.set.reps);
    if (bestRep) records.push(makePR(exercise.id, 'rep', bestRep.value, null, bestRep.item));

    // rep_range: best weight per exact observed rep count -- generic over
    // whatever rep counts actually appear, not a hardcoded list of Ns.
    const byReps = new Map<number, EligibleSet>();
    for (const e of sorted) {
      if (e.set.weight == null || e.set.reps == null) continue;
      const existing = byReps.get(e.set.reps);
      if (!existing || e.set.weight > (existing.set.weight ?? -Infinity)) byReps.set(e.set.reps, e);
    }
    for (const [reps, e] of byReps) {
      records.push(makePR(exercise.id, 'rep_range', e.set.weight ?? 0, reps, e));
    }

    const bestE1rm = pickBest(sorted, (e) =>
      e.set.weight != null && e.set.reps != null ? estimated1RM(e.set.weight, e.set.reps) : null,
    );
    if (bestE1rm)
      records.push(
        makePR(exercise.id, 'estimated_1rm', bestE1rm.value, bestE1rm.item.set.reps, bestE1rm.item),
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
      records.push(makePR(exercise.id, 'volume', bestVolume.value, null, bestVolume.last));
  }

  if (isBodyweightOnly) {
    const bestBw = pickBest(sorted, (e) => e.set.reps);
    if (bestBw) records.push(makePR(exercise.id, 'bodyweight', bestBw.value, null, bestBw.item));

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
        ),
      );
  }

  if (hasDuration) {
    const bestTimed = pickBest(sorted, (e) => e.set.duration_seconds);
    if (bestTimed)
      records.push(makePR(exercise.id, 'timed', bestTimed.value, null, bestTimed.item));
  }

  if (hasDistance) {
    const bestDistance = pickBest(sorted, (e) => e.set.distance_meters);
    if (bestDistance)
      records.push(makePR(exercise.id, 'distance', bestDistance.value, null, bestDistance.item));
  }

  return records;
}
