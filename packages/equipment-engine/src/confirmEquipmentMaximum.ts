import type { GymEquipmentInstance } from '@atlas/data-model';

/**
 * vNext Handoff 01 (§6): the non-UI domain action behind a later, one-time
 * contextual confirmation like "Is 170 lb the maximum available on this
 * machine?" (research pack §3.3). Pure transform, same shape as
 * `program-engine`'s `moveOccurrence`/`completeOccurrence` -- the caller
 * persists the returned record; this never touches storage itself and
 * never builds a chat flow.
 *
 * Only sets `max_load`; it never invents `exact_loads` or an `increment`
 * the owner didn't confirm. A machine already described by an exact load
 * list keeps that list as authoritative (see `availableLoads`) -- this
 * only trims `max_load` down/up to what was just confirmed.
 */
export function confirmEquipmentMaximum(
  instance: GymEquipmentInstance,
  maxLoad: number,
): GymEquipmentInstance {
  return {
    ...instance,
    max_load: maxLoad,
    updated_at: new Date().toISOString(),
    version: instance.version + 1,
  };
}
