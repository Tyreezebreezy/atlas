import type { GymEquipmentInstance } from '@atlas/data-model';
import { availableLoads, maximumLoad } from './availableLoads';

/**
 * vNext Handoff 04B. How the owner describes what loads a machine or rack has,
 * as three honest shapes plus "I don't know":
 *
 * - `exact`: every selectable load, typed out. The only way to describe a
 *   nonuniform rack (5, 10, 15, 20, 25, 30, 40, 50, ...).
 * - `range`: a minimum, a maximum and a step.
 * - `max`: only the heaviest load. Nothing between is invented from it -- see
 *   `availableLoads`, which stays empty -- but progression still never goes
 *   past it.
 * - `unknown`: nothing. Valid: the owner is never forced to fill this in, and
 *   ATLAS then does not pretend to know a maximum.
 *
 * Loads are in the unit logged history is in (lb) and are never converted.
 */
export type LoadConfigMode = 'unknown' | 'exact' | 'range' | 'max';

/** What the form holds: text as typed, so a half-finished entry is representable. */
export interface LoadConfigDraft {
  mode: LoadConfigMode;
  /** `exact` mode: loads separated by commas, spaces or new lines. */
  exact: string;
  /** `range` mode. */
  min: string;
  /** `range` and `max` modes. */
  max: string;
  /** `range` mode. */
  increment: string;
}

export interface LoadConfigFields {
  exact_loads: number[] | null;
  min_load: number | null;
  max_load: number | null;
  increment: number | null;
}

export type LoadConfigField = 'exact' | 'min' | 'max' | 'increment';

export type LoadConfigResult =
  | { ok: true; fields: LoadConfigFields }
  | { ok: false; errors: Partial<Record<LoadConfigField, string>> };

/** Sanity ceilings: a typo like "1" for "10" in an increment should be caught, not produce thousands of loads. */
export const MAX_EXACT_LOADS = 300;
export const MAX_RANGE_STEPS = 1000;

export const EMPTY_LOAD_DRAFT: LoadConfigDraft = {
  mode: 'unknown',
  exact: '',
  min: '',
  max: '',
  increment: '',
};

const NO_LOADS: LoadConfigFields = {
  exact_loads: null,
  min_load: null,
  max_load: null,
  increment: null,
};

function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Turns what the owner typed into the instance's load fields, or says exactly what is wrong with which field. */
export function parseLoadConfig(draft: LoadConfigDraft): LoadConfigResult {
  const errors: Partial<Record<LoadConfigField, string>> = {};

  if (draft.mode === 'unknown') return { ok: true, fields: { ...NO_LOADS } };

  if (draft.mode === 'exact') {
    const tokens = draft.exact.split(/[\s,;]+/).filter((token) => token !== '');
    if (tokens.length === 0) {
      errors.exact = 'Enter at least one load, like 10, 20, 30.';
      return { ok: false, errors };
    }
    const bad = tokens.filter((token) => parseNumber(token) === null || Number(token) <= 0);
    if (bad.length > 0) {
      const shown = bad
        .slice(0, 3)
        .map((token) => `"${token}"`)
        .join(', ');
      errors.exact = `${shown} ${bad.length === 1 ? "isn't" : "aren't"} a positive number. Separate loads with commas or spaces.`;
      return { ok: false, errors };
    }
    const loads = [...new Set(tokens.map(Number))].sort((a, b) => a - b);
    if (loads.length > MAX_EXACT_LOADS) {
      errors.exact = `That is ${loads.length} loads; the most ATLAS keeps is ${MAX_EXACT_LOADS}. Use a range with a step instead.`;
      return { ok: false, errors };
    }
    return {
      ok: true,
      fields: { exact_loads: loads, min_load: null, max_load: null, increment: null },
    };
  }

  if (draft.mode === 'max') {
    const max = parseNumber(draft.max);
    if (max === null || max <= 0) {
      errors.max = 'Enter the heaviest load, as a number above 0.';
      return { ok: false, errors };
    }
    return {
      ok: true,
      fields: { exact_loads: null, min_load: null, max_load: max, increment: null },
    };
  }

  const min = parseNumber(draft.min);
  const max = parseNumber(draft.max);
  const increment = parseNumber(draft.increment);
  if (min === null || min < 0) errors.min = 'Enter the lightest load, 0 or more.';
  if (max === null || max <= 0) errors.max = 'Enter the heaviest load, above 0.';
  else if (min !== null && min >= 0 && max <= min)
    errors.max = 'The heaviest load has to be more than the lightest.';
  if (increment === null || increment <= 0)
    errors.increment = 'Enter the step between loads, above 0.';
  else if (min !== null && max !== null && max > min && increment > max - min) {
    // 10-20 lb in steps of 50 describes one load and leaves the heaviest unreachable: a typo, not a machine.
    errors.increment =
      'The step is bigger than the gap between the lightest and heaviest load. Check the numbers.';
  } else if (
    min !== null &&
    max !== null &&
    max > min &&
    (max - min) / increment > MAX_RANGE_STEPS
  ) {
    errors.increment = `That step gives over ${MAX_RANGE_STEPS} loads. Check the number.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, fields: { exact_loads: null, min_load: min, max_load: max, increment } };
}

/** The form's starting state for an existing instance: whichever shape it was saved in. */
export function draftFromInstance(
  instance: Pick<GymEquipmentInstance, 'exact_loads' | 'min_load' | 'max_load' | 'increment'>,
): LoadConfigDraft {
  const text = (n: number | null) => (n == null ? '' : String(n));
  if (instance.exact_loads && instance.exact_loads.length > 0) {
    return { ...EMPTY_LOAD_DRAFT, mode: 'exact', exact: instance.exact_loads.join(', ') };
  }
  if (instance.min_load != null && instance.max_load != null && instance.increment != null) {
    return {
      ...EMPTY_LOAD_DRAFT,
      mode: 'range',
      min: text(instance.min_load),
      max: text(instance.max_load),
      increment: text(instance.increment),
    };
  }
  if (instance.max_load != null)
    return { ...EMPTY_LOAD_DRAFT, mode: 'max', max: text(instance.max_load) };
  return { ...EMPTY_LOAD_DRAFT };
}

function trim(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** One line saying what ATLAS knows about an instance's loads -- for a list row, never for logic. */
export function describeLoads(
  instance: Pick<
    GymEquipmentInstance,
    'exact_loads' | 'min_load' | 'max_load' | 'increment' | 'unit'
  >,
): string {
  const unit = instance.unit;
  const full = instance as GymEquipmentInstance;
  const loads = availableLoads(full);
  if (instance.exact_loads && instance.exact_loads.length > 0) {
    if (loads.length === 1) return `One load: ${trim(loads[0]!)} ${unit}`;
    if (loads.length <= 6) return `${loads.map(trim).join(', ')} ${unit}`;
    return `${trim(loads[0]!)}–${trim(loads[loads.length - 1]!)} ${unit}, ${loads.length} loads`;
  }
  if (loads.length > 0) {
    return `${trim(loads[0]!)}–${trim(loads[loads.length - 1]!)} ${unit}, steps of ${trim(instance.increment!)}`;
  }
  const max = maximumLoad(full);
  if (max != null) return `Max ${trim(max)} ${unit}`;
  return 'Loads not set';
}

/** "Max 170 lb", or "Loads not set" when no heaviest load is known -- the short form for the line beside an exercise. Display only: a screen never reads a load off an instance itself. */
export function describeMaximum(
  instance: Pick<
    GymEquipmentInstance,
    'exact_loads' | 'min_load' | 'max_load' | 'increment' | 'unit'
  >,
): string {
  const max = maximumLoad(instance as GymEquipmentInstance);
  return max != null ? `Max ${trim(max)} ${instance.unit}` : 'Loads not set';
}
