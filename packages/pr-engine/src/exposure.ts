import type { WorkoutSession } from '@atlas/data-model';
import { eligibleSets } from './eligibility';

/**
 * vNext Handoff 04A. For every exercise, the completed sessions that hold at
 * least one PR-eligible set of it, grouped by the session's
 * `training_location_id` (null = no location recorded, the one group all
 * legacy history falls into) and ordered oldest-first. The FIRST entry of a
 * group is that equipment context's baseline session: its numbers are "the
 * first numbers", not an improvement. Same eligibility as `calculatePRs`
 * (completed sessions, no warm-ups) and the same location grouping, so a
 * context here is exactly a PR series there.
 *
 * One shared answer to "was this the first time?" -- the muscle Performance
 * mode and the headline PR count both read it instead of each re-deriving it.
 */
export type ExposureSessions = Map<string, Map<string | null, WorkoutSession[]>>;

function sessionTime(session: WorkoutSession): string {
  return session.completed_at ?? session.started_at;
}

export function exposureSessions(sessions: WorkoutSession[]): ExposureSessions {
  const unique = new Map<string, Map<string | null, Map<string, WorkoutSession>>>();
  for (const { set, session } of eligibleSets(sessions)) {
    const location = session.training_location_id ?? null;
    let byLocation = unique.get(set.exercise_id);
    if (!byLocation) unique.set(set.exercise_id, (byLocation = new Map()));
    let bySession = byLocation.get(location);
    if (!bySession) byLocation.set(location, (bySession = new Map()));
    bySession.set(session.id, session);
  }

  const result: ExposureSessions = new Map();
  for (const [exerciseId, byLocation] of unique) {
    const ordered = new Map<string | null, WorkoutSession[]>();
    for (const [location, bySession] of byLocation) {
      ordered.set(
        location,
        [...bySession.values()].sort(
          (a, b) => sessionTime(a).localeCompare(sessionTime(b)) || a.id.localeCompare(b.id),
        ),
      );
    }
    result.set(exerciseId, ordered);
  }
  return result;
}
