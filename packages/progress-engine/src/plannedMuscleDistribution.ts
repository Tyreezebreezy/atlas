import type { Exercise, PlannedExercise } from '@atlas/data-model';
import type { DistributionEntry } from './trainingDistribution';

/**
 * The Program Builder's live preview of planned working-set volume per
 * muscle group, computed from `target_sets` -- the planning-time analogue
 * of `trainingDistribution` (which tallies actually-PERFORMED sets).
 * There is no warmup/work phase concept at the planning stage (`phase`
 * lives on `PerformedSet`, not `PlannedExercise` -- see docs/PROGRESSION.md
 * "Set phase migration"), so every planned exercise counts once at its
 * configured set count; a program author who wants a specific slot
 * excluded has no per-exercise "this one's a warmup" flag to set yet.
 */
export function plannedMuscleDistribution(
  plannedExercises: PlannedExercise[],
  exercisesById: Map<string, Exercise>,
): DistributionEntry[] {
  const counts = new Map<string, number>();
  for (const planned of plannedExercises) {
    const exercise = exercisesById.get(planned.exercise_id);
    const muscleGroup = exercise?.category ?? 'Uncategorized';
    const sets = planned.target_sets ?? 1;
    counts.set(muscleGroup, (counts.get(muscleGroup) ?? 0) + sets);
  }
  return [...counts.entries()]
    .map(([label, workingSets]) => ({ label, workingSets }))
    .sort((a, b) => b.workingSets - a.workingSets);
}
