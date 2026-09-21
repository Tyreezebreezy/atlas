import { getMuscle, groupName, muscleMapOf } from '@atlas/anatomy';
import type { Exercise, PlannedExercise } from '@atlas/data-model';
import type { DistributionEntry } from './trainingDistribution';

/**
 * v1.0.0 (H3). Planned muscle coverage — the Program Builder's anatomy view.
 * Distinct from completed training (`trainingExposure`): this tallies what is
 * PLANNED (target_sets), never what was performed. No set exists at planning
 * time, so every planned exercise contributes its `target_sets` count to its
 * primary muscles (direct) and secondary muscles (involvement).
 */

export interface PlannedMuscleEntry {
  muscleId: string;
  directSets: number;
  secondarySets: number;
}

export interface PlannedMuscleCoverage {
  byMuscle: PlannedMuscleEntry[];
  /** Direct (primary) planned sets aggregated up to muscle group. */
  byGroup: DistributionEntry[];
}

export function plannedMuscleCoverage(
  plannedExercises: PlannedExercise[],
  exercisesById: Map<string, Exercise>,
): PlannedMuscleCoverage {
  const muscleTotals = new Map<string, PlannedMuscleEntry>();
  const groupTotals = new Map<string, number>();

  for (const planned of plannedExercises) {
    const exercise = exercisesById.get(planned.exercise_id);
    if (!exercise) continue;
    const map = muscleMapOf(exercise);
    if (!map) continue;
    const sets = planned.target_sets ?? 1;

    for (const muscleId of map.primary) {
      const entry = muscleTotals.get(muscleId) ?? { muscleId, directSets: 0, secondarySets: 0 };
      entry.directSets += sets;
      muscleTotals.set(muscleId, entry);

      const groupId = getMuscle(muscleId)?.group_id;
      if (groupId) {
        groupTotals.set(groupId, (groupTotals.get(groupId) ?? 0) + sets);
      }
    }
    for (const muscleId of map.secondary) {
      const entry = muscleTotals.get(muscleId) ?? { muscleId, directSets: 0, secondarySets: 0 };
      entry.secondarySets += sets;
      muscleTotals.set(muscleId, entry);
    }
  }

  const byMuscle = [...muscleTotals.values()].sort(
    (a, b) => b.directSets - a.directSets || b.secondarySets - a.secondarySets,
  );
  const byGroup = [...groupTotals.entries()]
    .map(([groupId, workingSets]) => ({ label: groupName(groupId), workingSets }))
    .sort((a, b) => b.workingSets - a.workingSets);

  return { byMuscle, byGroup };
}
