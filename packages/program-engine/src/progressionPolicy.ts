import { NO_PROGRESSION, type PlannedExercise, type ProgressionPolicy } from '@atlas/data-model';
import type { Program } from '@atlas/data-model';

/**
 * Exercise-level override wins outright over the program default -- no
 * blending, same "higher tier wins" convention as `resolveRestSeconds`.
 * Absent/null at either level means "no opinion here," not "none"
 * specifically -- only the final fallthrough to `NO_PROGRESSION` actually
 * means the policy is 'none'. See docs/PROGRESSION.md.
 */
export function effectiveProgressionPolicy(
  program: Pick<Program, 'default_progression_policy'> | null,
  planned: Pick<PlannedExercise, 'progression_policy'>,
): ProgressionPolicy {
  return planned.progression_policy ?? program?.default_progression_policy ?? NO_PROGRESSION;
}
