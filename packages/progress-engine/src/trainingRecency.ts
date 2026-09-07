import { eligibleSets } from '@atlas/pr-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';

export interface RecencyEntry {
  label: string;
  /** 0 means "today." A muscle group with no history at all is simply
   * absent from the result rather than listed with a null/placeholder --
   * see this function's doc comment. */
  daysSinceTrained: number;
}

/**
 * Days since each muscle group (`Exercise.category`, same axis
 * `trainingDistribution` already uses) was last meaningfully trained --
 * "meaningfully" meaning the same eligibility rule as everywhere else
 * (completed sessions, work-phase sets only; see `eligibleSets`). Only
 * muscle groups with at least one real logged set are included -- listing
 * every category the 1,324-exercise library happens to contain, most of
 * which the owner has never trained and may never plan to, would be noise
 * not insight. No physiological recovery percentage is derived from this
 * -- the v0.2.0 handoff is explicit that a made-up "Chest recovery 73%" is
 * not justified by anything ATLAS actually models; this is a plain "how
 * long ago" tally, nothing inferred about readiness.
 */
export function trainingRecency(
  sessions: WorkoutSession[],
  exercises: Map<string, Exercise>,
  now: Date = new Date(),
): RecencyEntry[] {
  const lastTrained = new Map<string, number>(); // muscle group -> latest completed_at epoch ms

  for (const { set, session } of eligibleSets(sessions)) {
    const exercise = exercises.get(set.exercise_id);
    const muscleGroup = exercise?.category ?? 'Uncategorized';
    const at = new Date(session.completed_at ?? session.started_at).getTime();
    const existing = lastTrained.get(muscleGroup);
    if (existing == null || at > existing) lastTrained.set(muscleGroup, at);
  }

  const nowMs = now.getTime();
  return [...lastTrained.entries()]
    .map(([label, last]) => ({
      label,
      daysSinceTrained: Math.floor((nowMs - last) / (24 * 60 * 60 * 1000)),
    }))
    .sort((a, b) => a.daysSinceTrained - b.daysSinceTrained);
}
