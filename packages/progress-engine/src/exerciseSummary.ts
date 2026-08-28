import { eligibleSetsForExercise } from '@atlas/pr-engine';
import type { PerformedSet, WorkoutSession } from '@atlas/data-model';

export interface ExerciseSummary {
  sessionCount: number;
  firstPerformedAt: string | null;
  lastPerformedAt: string | null;
  /** Every eligible set from the most recent qualifying session, for a "Last: 170 x 8" style display. */
  lastSets: PerformedSet[];
  /** Total weight*reps for the most recent session, or null for a non-weighted exercise. */
  recentVolume: number | null;
}

const EMPTY_SUMMARY: ExerciseSummary = {
  sessionCount: 0,
  firstPerformedAt: null,
  lastPerformedAt: null,
  lastSets: [],
  recentVolume: null,
};

/** First/last/session-count summary for one exercise, over the same eligibility rules pr-engine uses (completed sessions, non-warmup sets). */
export function summarizeExercise(sessions: WorkoutSession[], exerciseId: string): ExerciseSummary {
  const eligible = eligibleSetsForExercise(sessions, exerciseId);
  if (eligible.length === 0) return EMPTY_SUMMARY;

  const sorted = [...eligible].sort((a, b) => a.set.completed_at.localeCompare(b.set.completed_at));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return EMPTY_SUMMARY;

  const sessionIds = new Set(sorted.map((e) => e.session.id));
  const lastSets = sorted.filter((e) => e.session.id === last.session.id).map((e) => e.set);

  let recentVolume: number | null = null;
  let total = 0;
  for (const s of lastSets) {
    if (s.weight != null && s.reps != null) {
      total += s.weight * s.reps;
      recentVolume = total;
    }
  }

  return {
    sessionCount: sessionIds.size,
    firstPerformedAt: first.set.completed_at,
    lastPerformedAt: last.set.completed_at,
    lastSets,
    recentVolume,
  };
}
