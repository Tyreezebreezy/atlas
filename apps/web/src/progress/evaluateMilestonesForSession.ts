import { evaluateMilestones, newlyAchievedMilestones } from '@atlas/milestone-engine';
import type { Milestone } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';

/**
 * Re-evaluates every milestone against full history and persists any that
 * just became achieved. Already-achieved/inactive milestones come back from
 * evaluateMilestones by the SAME reference (see evaluateMilestones.ts), so a
 * `!==` diff cheaply finds the handful that actually need writing -- cheap
 * enough to just re-run in full on every workout finish at this scale.
 */
export async function evaluateMilestonesForSession(storage: AtlasStorage): Promise<Milestone[]> {
  const [milestones, sessions, bodyMeasurements] = await Promise.all([
    storage.milestones.getAll(),
    storage.workoutSessions.getAll(),
    storage.bodyMeasurements.getAll(),
  ]);
  const updated = evaluateMilestones(milestones, sessions, bodyMeasurements);
  const changed = updated.filter((m, i) => m !== milestones[i]);
  if (changed.length > 0) await storage.milestones.putMany(changed);
  return newlyAchievedMilestones(milestones, updated);
}
