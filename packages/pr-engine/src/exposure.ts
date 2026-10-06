import type { WorkoutSession } from '@atlas/data-model';
import { performanceContextKey, performanceContextOf } from './context';
import { eligibleSets } from './eligibility';

/**
 * vNext Handoff 04A. For every exercise, the completed sessions that hold at
 * least one PR-eligible set of it, grouped by comparable context and ordered
 * oldest-first. The FIRST entry of a group is that context's baseline session:
 * its numbers are "the first numbers", not an improvement. Same eligibility as
 * `calculatePRs` (completed sessions, no warm-ups) and the same grouping, so a
 * context here is exactly a PR series there.
 *
 * vNext Handoff 04B: the context is the training location plus the actual
 * equipment instance the exercise ran on (`performanceContextOf`), not the
 * location alone, and the inner map is keyed by `performanceContextKey`. Every
 * session in one group shares that context by construction.
 *
 * One shared answer to "was this the first time?" -- the muscle Performance
 * mode and the headline PR count both read it instead of each re-deriving it.
 */
export type ExposureSessions = Map<string, Map<string, WorkoutSession[]>>;

function sessionTime(session: WorkoutSession): string {
  return session.completed_at ?? session.started_at;
}

export function exposureSessions(sessions: WorkoutSession[]): ExposureSessions {
  const unique = new Map<string, Map<string, Map<string, WorkoutSession>>>();
  for (const { set, session } of eligibleSets(sessions)) {
    const contextKey = performanceContextKey(performanceContextOf(session, set.exercise_id));
    let byContext = unique.get(set.exercise_id);
    if (!byContext) unique.set(set.exercise_id, (byContext = new Map()));
    let bySession = byContext.get(contextKey);
    if (!bySession) byContext.set(contextKey, (bySession = new Map()));
    bySession.set(session.id, session);
  }

  const result: ExposureSessions = new Map();
  for (const [exerciseId, byContext] of unique) {
    const ordered = new Map<string, WorkoutSession[]>();
    for (const [contextKey, bySession] of byContext) {
      ordered.set(
        contextKey,
        [...bySession.values()].sort(
          (a, b) => sessionTime(a).localeCompare(sessionTime(b)) || a.id.localeCompare(b.id),
        ),
      );
    }
    result.set(exerciseId, ordered);
  }
  return result;
}
