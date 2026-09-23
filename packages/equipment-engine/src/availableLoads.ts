import type { GymEquipmentInstance } from '@atlas/data-model';

/** True once this instance has ENOUGH data to reason about available loads
 * at all -- either an exact list, or a complete min/max/increment triple.
 * Distinct from "no loads available": the owner isn't required to fully
 * configure a gym before training (research pack §3.3), so callers must
 * treat "no data" as "fall back to the unconstrained decision," never as
 * "nothing is available here." */
export function hasEquipmentData(instance: GymEquipmentInstance): boolean {
  if (instance.exact_loads && instance.exact_loads.length > 0) return true;
  return instance.min_load != null && instance.max_load != null && instance.increment != null;
}

/**
 * Every selectable load at this instance, ascending. `exact_loads` (a
 * plate-loaded/pin-stack machine, or a fixed dumbbell rack) is
 * authoritative when present -- it can represent nonuniform spacing an
 * increment can't (research pack: "80 lb dumbbells are the heaviest here"
 * alongside a rack that skips from 5 to 8 to 10). Falls back to a uniform
 * `min_load..max_load` step of `increment` only when no exact list was
 * given. Empty when neither is fully specified -- see `hasEquipmentData`.
 */
export function availableLoads(instance: GymEquipmentInstance): number[] {
  if (instance.exact_loads && instance.exact_loads.length > 0) {
    return [...instance.exact_loads].sort((a, b) => a - b);
  }
  const { min_load, max_load, increment } = instance;
  if (min_load == null || max_load == null || increment == null || increment <= 0) return [];
  const loads: number[] = [];
  for (let load = min_load; load <= max_load + 1e-9; load += increment) {
    loads.push(Math.round(load * 1000) / 1000); // avoid float drift (0.1 + 0.2 style)
  }
  return loads;
}

/** The smallest available load strictly greater than `currentLoad`, or
 * null when none exists -- either because `currentLoad` is already at or
 * above every available load, or because there's no equipment data at all
 * (see `hasEquipmentData` -- callers must check that separately to tell
 * the two apart). */
export function nextAvailableLoad(instance: GymEquipmentInstance, currentLoad: number): number | null {
  const next = availableLoads(instance).find((load) => load > currentLoad);
  return next ?? null;
}

/** True once `load` has reached or passed the highest load this equipment
 * instance can provide. False (not true) when there's simply no data --
 * "unknown" must never be reported as "at max." */
export function isAtEquipmentMax(instance: GymEquipmentInstance, load: number): boolean {
  const loads = availableLoads(instance);
  if (loads.length === 0) return false;
  return load >= loads[loads.length - 1]!;
}
