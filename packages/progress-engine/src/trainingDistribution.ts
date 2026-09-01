import { eligibleSets } from '@atlas/pr-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';

export interface DistributionEntry {
  label: string;
  workingSets: number;
}

export interface TrainingDistribution {
  windowDays: number;
  byMuscleGroup: DistributionEntry[];
  byMovementFamily: DistributionEntry[];
  /** Eligible sets whose exercise has no curated movement_family (most of
   * the 1,324-exercise library isn't hand-classified -- see
   * curatedEnrichment.ts). Surfaced rather than silently dropped, so the
   * movement-family view doesn't quietly understate itself as complete. */
  uncategorizedMovementFamilySets: number;
}

const DEFAULT_WINDOW_DAYS = 7;

/**
 * Deterministic working-set counts per muscle group (Exercise.category,
 * always present from the source dataset) and per movement family
 * (Exercise.enrichment.movement_family, only populated for the curated
 * subset). A plain tally of sets actually logged in the window -- no
 * physiological recovery/readiness modeling.
 */
export function trainingDistribution(
  sessions: WorkoutSession[],
  exercises: Map<string, Exercise>,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): TrainingDistribution {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = eligibleSets(sessions).filter(
    (e) => new Date(e.set.completed_at).getTime() >= cutoff,
  );

  const muscleGroups = new Map<string, number>();
  const movementFamilies = new Map<string, number>();
  let uncategorizedMovementFamilySets = 0;

  for (const { set } of inWindow) {
    const exercise = exercises.get(set.exercise_id);

    const muscleGroup = exercise?.category ?? 'Uncategorized';
    muscleGroups.set(muscleGroup, (muscleGroups.get(muscleGroup) ?? 0) + 1);

    const movementFamily = exercise?.enrichment?.movement_family;
    if (movementFamily) {
      movementFamilies.set(movementFamily, (movementFamilies.get(movementFamily) ?? 0) + 1);
    } else {
      uncategorizedMovementFamilySets += 1;
    }
  }

  return {
    windowDays,
    byMuscleGroup: toSortedEntries(muscleGroups),
    byMovementFamily: toSortedEntries(movementFamilies),
    uncategorizedMovementFamilySets,
  };
}

function toSortedEntries(counts: Map<string, number>): DistributionEntry[] {
  return [...counts.entries()]
    .map(([label, workingSets]) => ({ label, workingSets }))
    .sort((a, b) => b.workingSets - a.workingSets);
}
