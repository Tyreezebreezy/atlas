import type { MuscleMapViewModel, MusclePerformanceState } from '@atlas/progress-engine';
import type { BodyMapMuscleState, BodyMapTone } from '../anatomy/BodyMap';

const TONE_FOR_STATE: Record<MusclePerformanceState, BodyMapTone> = {
  progressing: 'positive',
  stable: 'neutral',
  stalled: 'caution',
  insufficient_data: 'muted',
};

/**
 * vNext Handoff 03B. The seam between analytics and the renderer: turns the
 * domain's `MuscleMapViewModel` into what `BodyMap` paints. Nothing is
 * computed here -- `normalized_visual_intensity` is already 0..1 and the
 * performance state is already decided.
 *
 * - trained / volume / focus: a muscle with primary work is heat-shaded by
 *   its intensity; one that only assisted is drawn as "assist" (never
 *   converted into fractional heat); nothing else is drawn.
 * - performance: a categorical tone per rolled-up state.
 *
 * `selectedMuscleIds` are outlined without touching their fill, so a tapped
 * region keeps its analytic meaning.
 */
export function muscleMapStates(
  model: MuscleMapViewModel,
  selectedMuscleIds: ReadonlySet<string> = new Set(),
): BodyMapMuscleState[] {
  const states: BodyMapMuscleState[] = [];
  const painted = new Set<string>();

  for (const entry of model.muscles) {
    const selected = selectedMuscleIds.has(entry.muscle_id) ? { selected: true } : {};
    painted.add(entry.muscle_id);
    if (model.mode === 'performance') {
      states.push({
        muscleId: entry.muscle_id,
        state: 'tone',
        tone: TONE_FOR_STATE[entry.performance_state ?? 'insufficient_data'],
        ...selected,
      });
    } else if (entry.primary_set_count > 0) {
      states.push({
        muscleId: entry.muscle_id,
        state: 'heat',
        intensity: entry.normalized_visual_intensity,
        ...selected,
      });
    } else if (entry.secondary_set_count > 0) {
      states.push({ muscleId: entry.muscle_id, state: 'assist', ...selected });
    } else {
      painted.delete(entry.muscle_id);
    }
  }

  // A selected muscle with no activity still gets its outline.
  for (const muscleId of selectedMuscleIds) {
    if (!painted.has(muscleId)) states.push({ muscleId, state: 'idle', selected: true });
  }
  return states;
}
