import { localIsoDate } from '@atlas/core';
import type { BodyMeasurement } from '@atlas/data-model';

/**
 * Sanity bounds for a typed body measurement. Far wider than any body -- they exist because one slip (-5, 99999, a body fat of
 * 400) used to be saved as a real weigh-in and stretch the trend chart's axis until the real data was a flat line.
 */
export const BODY_LIMITS = {
  /** lb */
  weight: 1500,
  /** lb: muscle, fat, lean and bone mass */
  mass: 1500,
  /** body fat and water, in percent */
  percent: 100,
  visceral: 100,
  /** calories */
  bmr: 10_000,
} as const;

type BodyFields = Pick<
  BodyMeasurement,
  | 'date'
  | 'weight'
  | 'body_fat_percentage'
  | 'muscle_mass'
  | 'water_percentage'
  | 'fat_mass'
  | 'lean_mass'
  | 'visceral_fat'
  | 'bone_mass'
  | 'bmr'
>;

const NUMBERS: [keyof BodyFields, string, number][] = [
  ['weight', 'Weight', BODY_LIMITS.weight],
  ['body_fat_percentage', 'Body fat', BODY_LIMITS.percent],
  ['muscle_mass', 'Muscle mass', BODY_LIMITS.mass],
  ['water_percentage', 'Water', BODY_LIMITS.percent],
  ['fat_mass', 'Fat mass', BODY_LIMITS.mass],
  ['lean_mass', 'Lean mass', BODY_LIMITS.mass],
  ['visceral_fat', 'Visceral fat', BODY_LIMITS.visceral],
  ['bone_mass', 'Bone mass', BODY_LIMITS.mass],
  ['bmr', 'BMR', BODY_LIMITS.bmr],
];

/** Why a measurement can't be saved as entered, or null. A blank number is "not measured" and is fine -- but not all of them. */
export function bodyMeasurementProblem(entry: BodyFields, now: Date = new Date()): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    Number.isNaN(new Date(`${entry.date}T12:00:00`).getTime())
  ) {
    return 'Pick the date of the measurement.';
  }
  if (entry.date > localIsoDate(now))
    return "That date hasn't happened yet. Pick today or an earlier day.";
  let entered = 0;
  for (const [field, label, max] of NUMBERS) {
    const value = entry[field];
    if (value === null) continue;
    entered += 1;
    if (typeof value !== 'number' || !(value > 0 && value <= max)) {
      return `${label} must be more than 0 and at most ${max.toLocaleString('en-US')}.`;
    }
  }
  return entered === 0 ? 'Enter at least one measurement.' : null;
}
