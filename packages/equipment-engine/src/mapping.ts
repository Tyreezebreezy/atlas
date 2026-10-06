import type { ExerciseEquipmentContext, GymEquipmentInstance } from '@atlas/data-model';
import { createExerciseEquipmentContext } from './createEquipment';

/**
 * vNext Handoff 04B. Remembering which machine an exercise is done on at a
 * place, so it is reused next time without asking. Choosing a machine is the
 * confirmation -- it is never mapped automatically when several could fit.
 *
 * The rule kept here: at most ONE default machine per exercise per location
 * (`ExerciseEquipmentContext.is_default`). The same exercise may have a
 * remembered machine at every place it is done; those are independent.
 *
 * Returns only the rows to write (an unchanged mapping returns nothing).
 */
export function planRememberedMapping(
  exerciseId: string,
  instance: Pick<GymEquipmentInstance, 'id' | 'training_location_id'>,
  contexts: ExerciseEquipmentContext[],
  instances: Pick<GymEquipmentInstance, 'id' | 'training_location_id'>[],
): ExerciseEquipmentContext[] {
  const hereIds = new Set(
    instances
      .filter((i) => i.training_location_id === instance.training_location_id)
      .map((i) => i.id),
  );
  hereIds.add(instance.id);
  const now = new Date().toISOString();
  const changes: ExerciseEquipmentContext[] = [];
  let hasMapping = false;

  for (const context of contexts) {
    if (
      context.exercise_id !== exerciseId ||
      context.deleted_at !== null ||
      !hereIds.has(context.gym_equipment_id)
    )
      continue;
    const isTarget = context.gym_equipment_id === instance.id;
    if (isTarget) hasMapping = true;
    if (context.is_default !== isTarget) {
      changes.push({
        ...context,
        is_default: isTarget,
        updated_at: now,
        version: context.version + 1,
      });
    }
  }

  if (!hasMapping) {
    changes.push(
      createExerciseEquipmentContext({ exerciseId, gymEquipmentId: instance.id, isDefault: true }),
    );
  }
  return changes;
}
