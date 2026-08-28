import { eligibleSetsForExercise } from '@atlas/pr-engine';
import { E1RM_REP_CUTOFF, estimated1RM } from '@atlas/pr-engine';
import type { PerformedSet, WorkoutSession } from '@atlas/data-model';

export interface ChartPoint {
  date: string;
  value: number;
  sessionId: string;
}

/** One point per session: the best qualifying value that session, by whatever valueFn measures. */
function perSessionBest(
  sessions: WorkoutSession[],
  exerciseId: string,
  valueFn: (set: PerformedSet) => number | null,
): ChartPoint[] {
  const eligible = eligibleSetsForExercise(sessions, exerciseId);
  const bySession = new Map<string, { session: WorkoutSession; best: number }>();
  for (const { set, session } of eligible) {
    const value = valueFn(set);
    if (value == null) continue;
    const existing = bySession.get(session.id);
    if (!existing || value > existing.best) bySession.set(session.id, { session, best: value });
  }
  return [...bySession.values()]
    .map(({ session, best }) => ({
      date: session.completed_at ?? session.started_at,
      value: best,
      sessionId: session.id,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Estimated 1RM per session (best qualifying set that session), same formula/cutoff as pr-engine. */
export function estimated1RMSeries(sessions: WorkoutSession[], exerciseId: string): ChartPoint[] {
  return perSessionBest(sessions, exerciseId, (s) => {
    if (s.weight == null || s.reps == null || s.reps > E1RM_REP_CUTOFF) return null;
    return estimated1RM(s.weight, s.reps);
  });
}

/** Best working weight per session. */
export function bestWeightSeries(sessions: WorkoutSession[], exerciseId: string): ChartPoint[] {
  return perSessionBest(sessions, exerciseId, (s) => s.weight);
}

/** Best single-set rep count per session -- for bodyweight movements. */
export function repsSeries(sessions: WorkoutSession[], exerciseId: string): ChartPoint[] {
  return perSessionBest(sessions, exerciseId, (s) => s.reps);
}

/** Longest single-set duration per session -- for timed movements. */
export function durationSeries(sessions: WorkoutSession[], exerciseId: string): ChartPoint[] {
  return perSessionBest(sessions, exerciseId, (s) => s.duration_seconds);
}

/** Longest single-set distance per session -- for distance movements. */
export function distanceSeries(sessions: WorkoutSession[], exerciseId: string): ChartPoint[] {
  return perSessionBest(sessions, exerciseId, (s) => s.distance_meters);
}

/** Total weight*reps per session -- a sum, not a per-set best, so it's implemented separately from perSessionBest. */
export function volumeSeries(sessions: WorkoutSession[], exerciseId: string): ChartPoint[] {
  const eligible = eligibleSetsForExercise(sessions, exerciseId);
  const bySession = new Map<string, { session: WorkoutSession; total: number }>();
  for (const { set, session } of eligible) {
    if (set.weight == null || set.reps == null) continue;
    const existing = bySession.get(session.id) ?? { session, total: 0 };
    existing.total += set.weight * set.reps;
    bySession.set(session.id, existing);
  }
  return [...bySession.values()]
    .filter((e) => e.total > 0)
    .map(({ session, total }) => ({
      date: session.completed_at ?? session.started_at,
      value: total,
      sessionId: session.id,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
