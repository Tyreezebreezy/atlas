/**
 * Sanity bounds for a number in a workout plan (a prescription typed in the editor, a set being logged, a value read from an
 * imported file). Far beyond anything a person does -- they exist because one absurd number does real damage: an import of
 * "999999999 x 5" made Gym Mode draw a billion set rows, and a fat-fingered 99999 lb becomes a permanent record and a wrecked
 * chart axis.
 */
export const PLAN_LIMITS = {
  /** Planned sets (and rounds) for one exercise. Gym Mode draws one row per planned set. */
  sets: 100,
  reps: 999,
  /** lb */
  load: 5000,
  /** Work time, or rest -- a day. */
  seconds: 86_400,
  meters: 1_000_000,
  /** RPE and RIR are both on a 0-10 scale. */
  effort: 10,
} as const;
