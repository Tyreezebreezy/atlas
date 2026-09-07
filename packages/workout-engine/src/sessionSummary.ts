import type { WorkoutSession } from '@atlas/data-model';
import { setPhaseOf } from './setClassification';

export interface SessionSummary {
  durationMinutes: number;
  exerciseCount: number;
  setCount: number;
  /** Sum of (weight ?? external_load)*reps over work sets that have both --
   * omits bodyweight/timed/distance sets (not zero-fills them) and warm-up
   * sets (this is a working-set-analytics figure, same rule as PRs). */
  totalVolume: number;
  skippedCount: number;
}

export function summarizeSession(session: WorkoutSession): SessionSummary {
  const startedAt = new Date(session.started_at).getTime();
  const endedAt = session.completed_at ? new Date(session.completed_at).getTime() : Date.now();
  const durationMinutes = Math.max(0, Math.round((endedAt - startedAt) / 60000));

  const exerciseCount = new Set(session.performed_sets.map((s) => s.exercise_id)).size;
  const setCount = session.performed_sets.length;
  const totalVolume = session.performed_sets.reduce((sum, s) => {
    if (setPhaseOf(s) === 'warmup' || s.reps === null) return sum;
    const load = s.weight ?? s.external_load;
    if (load === null || load === undefined) return sum;
    return sum + load * s.reps;
  }, 0);

  return {
    durationMinutes,
    exerciseCount,
    setCount,
    totalVolume,
    skippedCount: session.skipped_exercises.length,
  };
}
