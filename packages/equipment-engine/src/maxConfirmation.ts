import { exerciseEquipmentIdOf, setPhaseOf } from '@atlas/workout-engine';
import type { GymEquipmentInstance, WorkoutSession } from '@atlas/data-model';
import { hasEquipmentData } from './availableLoads';

/**
 * vNext Handoff 04B. The one-time, contextual question "Is 170 lb the maximum on
 * this machine?" -- asked only when ATLAS has watched the owner reach the same
 * heaviest load on a machine again and again and does not know its maximum.
 *
 * It is a question, never an inference: nothing here changes the equipment. A
 * "yes" is recorded with the existing `confirmEquipmentMaximum`; a "no / not
 * sure" is recorded with `dismissMaximumConfirmation`, after which this machine
 * is never asked about again.
 */

/** How many separate workouts must have topped out at the same heaviest load before it is worth asking. */
export const MAX_CONFIRMATION_MIN_SESSIONS = 3;

export interface MaximumConfirmationOffer {
  /** The heaviest load ever logged on this machine -- the one to ask about. */
  load: number;
  /** How many completed workouts reached it. */
  sessions: number;
}

/**
 * The offer for one machine, or null when there is nothing to ask: the machine
 * already has a known maximum or load list (it is not unknown), it is archived,
 * the owner already answered, or the heaviest load has not been reached in
 * enough separate workouts to call it "repeatedly".
 */
export function maximumConfirmationOffer(
  instance: GymEquipmentInstance,
  sessions: WorkoutSession[],
): MaximumConfirmationOffer | null {
  if (instance.deleted_at !== null || instance.archived_at) return null;
  if (instance.max_prompt_dismissed_at) return null;
  if (hasEquipmentData(instance)) return null;

  // Every working load logged on this exact machine, with the workouts it came from.
  const sessionsAtLoad = new Map<number, Set<string>>();
  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    for (const set of session.performed_sets) {
      if (set.weight == null || set.weight <= 0 || setPhaseOf(set) === 'warmup') continue;
      if (exerciseEquipmentIdOf(session, set.exercise_id) !== instance.id) continue;
      const ids = sessionsAtLoad.get(set.weight) ?? new Set<string>();
      ids.add(session.id);
      sessionsAtLoad.set(set.weight, ids);
    }
  }
  if (sessionsAtLoad.size === 0) return null;

  const top = Math.max(...sessionsAtLoad.keys());
  const reached = sessionsAtLoad.get(top)?.size ?? 0;
  return reached >= MAX_CONFIRMATION_MIN_SESSIONS ? { load: top, sessions: reached } : null;
}

/** Records "no / not sure": the equipment is otherwise unchanged, and ATLAS does not ask again. */
export function dismissMaximumConfirmation(instance: GymEquipmentInstance): GymEquipmentInstance {
  const now = new Date().toISOString();
  return {
    ...instance,
    max_prompt_dismissed_at: now,
    updated_at: now,
    version: instance.version + 1,
  };
}
