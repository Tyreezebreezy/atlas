import type { WorkoutSession } from '@atlas/data-model';

export interface SessionSummary {
  durationMinutes: number;
  exerciseCount: number;
  setCount: number;
  /** Sum of weight*reps over sets that have both -- omits bodyweight/timed/distance sets, not zero-fills them. */
  totalVolume: number;
}

export function summarizeSession(session: WorkoutSession): SessionSummary {
  const startedAt = new Date(session.started_at).getTime();
  const endedAt = session.completed_at ? new Date(session.completed_at).getTime() : Date.now();
  const durationMinutes = Math.max(0, Math.round((endedAt - startedAt) / 60000));

  const exerciseCount = new Set(session.performed_sets.map((s) => s.exercise_id)).size;
  const setCount = session.performed_sets.length;
  const totalVolume = session.performed_sets.reduce((sum, s) => {
    if (s.weight === null || s.reps === null) return sum;
    return sum + s.weight * s.reps;
  }, 0);

  return { durationMinutes, exerciseCount, setCount, totalVolume };
}
