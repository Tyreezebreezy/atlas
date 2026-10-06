import type { GymEquipmentInstance, LoadUnit } from '@atlas/data-model';

/**
 * The unit every weight in ATLAS is stored and shown in. There is no unit
 * preference yet -- a logged set is a bare number and every screen labels it
 * "lb" -- so an equipment instance's loads can only be compared with logged
 * history when they are in this same unit. If a preference is ever added, this
 * is the one place that becomes a lookup instead of a constant.
 */
export const APP_LOAD_UNIT: LoadUnit = 'lb';

/** True when the instance's loads are in the unit logged history is in. */
export function usesAppLoadUnit(instance: Pick<GymEquipmentInstance, 'unit'>): boolean {
  return instance.unit === APP_LOAD_UNIT;
}
