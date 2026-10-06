import type {
  ExerciseEquipmentContext,
  GymEquipmentInstance,
  WorkoutSession,
} from '@atlas/data-model';
import { exerciseEquipmentIdOf } from '@atlas/workout-engine';
import { usesAppLoadUnit } from './units';

/**
 * The machine the owner has marked as THE default for an exercise AT the given
 * training location, or null when none is configured there. Callers must treat
 * null as "no equipment data" (see `hasEquipmentData`), never as "at max" --
 * the owner isn't forced to configure a gym before training (research pack
 * §3.3).
 *
 * Only a default whose machine is actually at `trainingLocationId` counts:
 * "machine chest press" at Gym A is a different physical machine than at Gym B,
 * and silently applying the wrong gym's ceiling would be worse than applying
 * none. So an exercise can have a remembered machine at EACH place it is done
 * (vNext Handoff 04B) -- this picks the one at the place the owner is, wherever
 * the other defaults sit in the list. An archived machine is not offered as a
 * default any more, and neither is one in a unit other than the logged history's
 * (nothing here converts).
 */
export function resolveExerciseEquipment(
  exerciseId: string,
  contexts: ExerciseEquipmentContext[],
  gymEquipment: GymEquipmentInstance[],
  trainingLocationId: string | null,
): GymEquipmentInstance | null {
  if (!trainingLocationId) return null;
  const byId = new Map(gymEquipment.map((instance) => [instance.id, instance]));
  const candidates = contexts
    .filter(
      (context) =>
        context.exercise_id === exerciseId && context.is_default && context.deleted_at === null,
    )
    .flatMap((context) => {
      const instance = byId.get(context.gym_equipment_id);
      const usable =
        instance &&
        instance.deleted_at === null &&
        !instance.archived_at &&
        instance.training_location_id === trainingLocationId &&
        usesAppLoadUnit(instance);
      return usable ? [{ context, instance }] : [];
    });
  // More than one default at one place shouldn't happen (`planRememberedMapping`
  // keeps it to one); if sync ever produces it, the most recent choice wins.
  candidates.sort((a, b) => b.context.updated_at.localeCompare(a.context.updated_at));
  return candidates[0]?.instance ?? null;
}

export interface EffectiveEquipment {
  /** The machine this exercise is being done on, or null when none is known. */
  instance: GymEquipmentInstance | null;
  /** `session`: chosen for this workout. `remembered`: the default for this exercise here, not yet written to the session. `none`. */
  source: 'session' | 'remembered' | 'none';
  /** The instance, only when its loads can be compared with logged history -- what `recommendProgression` should be given. */
  constraints: GymEquipmentInstance | null;
}

/**
 * Which machine an exercise is on right now, in a workout: the one chosen for
 * this workout if there is one (and it is at the workout's location), else the
 * machine remembered for this exercise at that location. Never guesses between
 * several: with nothing chosen and no remembered default the answer is "none",
 * and progression falls back to its unconstrained decision.
 */
export function effectiveExerciseEquipment(
  session: Pick<WorkoutSession, 'training_location_id' | 'exercise_equipment'>,
  exerciseId: string,
  contexts: ExerciseEquipmentContext[],
  gymEquipment: GymEquipmentInstance[],
): EffectiveEquipment {
  const locationId = session.training_location_id ?? null;
  const chosenId = exerciseEquipmentIdOf(session, exerciseId);
  if (chosenId) {
    const chosen = gymEquipment.find(
      (instance) => instance.id === chosenId && instance.deleted_at === null,
    );
    // A choice belonging to another place is stale (a location change clears these; this is the backstop).
    if (chosen && locationId && chosen.training_location_id === locationId) {
      return {
        instance: chosen,
        source: 'session',
        constraints: usesAppLoadUnit(chosen) ? chosen : null,
      };
    }
  }
  const remembered = resolveExerciseEquipment(exerciseId, contexts, gymEquipment, locationId);
  if (remembered) return { instance: remembered, source: 'remembered', constraints: remembered };
  return { instance: null, source: 'none', constraints: null };
}
