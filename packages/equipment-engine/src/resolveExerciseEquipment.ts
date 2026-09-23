import type { ExerciseEquipmentContext, GymEquipmentInstance } from '@atlas/data-model';

/**
 * vNext Handoff 03A. The default `GymEquipmentInstance` configured for an
 * exercise AT the given training location, or null when none is configured
 * there. Callers must treat null as "no equipment data" (see
 * `hasEquipmentData`), never as "at max" -- the owner isn't forced to
 * configure a gym before training (research pack §3.3).
 *
 * A default configured for a DIFFERENT location than the one currently
 * active is deliberately not returned: "machine chest press" at Gym A is a
 * different physical machine than at Gym B, and silently applying the
 * wrong gym's ceiling would be worse than applying none.
 */
export function resolveExerciseEquipment(
  exerciseId: string,
  contexts: ExerciseEquipmentContext[],
  gymEquipment: GymEquipmentInstance[],
  activeTrainingLocationId: string | null,
): GymEquipmentInstance | null {
  if (!activeTrainingLocationId) return null;
  const context = contexts.find((c) => c.exercise_id === exerciseId && c.is_default);
  if (!context) return null;
  const equipment = gymEquipment.find((g) => g.id === context.gym_equipment_id);
  if (!equipment || equipment.training_location_id !== activeTrainingLocationId) return null;
  return equipment;
}
