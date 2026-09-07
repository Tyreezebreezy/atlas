import type { PerformedSet, SetPhase, SetType } from '@atlas/data-model';

/**
 * Classifies a set's phase, falling back to the pre-v0.2.0 convention
 * (`set_type === 'warmup'`) for any set that predates the `phase` field --
 * see `SetPhase`'s doc comment in packages/data-model/src/workout.ts. Every
 * phase-sensitive read site (PR eligibility, training distribution,
 * progression, the UI) must go through this rather than reading `.phase`
 * or `.set_type` directly, so old and new data classify identically.
 */
export function setPhaseOf(set: Pick<PerformedSet, 'phase' | 'set_type'>): SetPhase {
  if (set.phase) return set.phase;
  return (set.set_type as string) === 'warmup' ? 'warmup' : 'work';
}

/**
 * Normalizes `set_type` for display/logic that only cares about the
 * sub-classification (normal/amrap/drop/failure/rest_pause), not phase.
 * Old data's two phase-carrying values ('working' and 'warmup') both
 * normalize to 'normal' here -- their phase-ness is `setPhaseOf`'s job,
 * not this function's.
 */
export function setTypeOf(set: Pick<PerformedSet, 'set_type'>): SetType {
  const raw = set.set_type as string;
  return raw === 'working' || raw === 'warmup' ? 'normal' : (set.set_type as SetType);
}
