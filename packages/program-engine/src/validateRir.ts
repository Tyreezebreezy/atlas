/**
 * vNext Handoff 02 (research pack v2 §8). RIR stays fully optional -- this
 * only guards the range already used by the existing 0-10 UI input
 * (`ExerciseLogger.tsx`), so a corrupted/out-of-range value (e.g. from a
 * future import path) never gets treated as a real effort signal. `null` is
 * always valid: progression must keep working when RIR is absent.
 */
export function isValidRir(rir: number | null): boolean {
  return rir == null || (Number.isInteger(rir) && rir >= 0 && rir <= 10);
}
