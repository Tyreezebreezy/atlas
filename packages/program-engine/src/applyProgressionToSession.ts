import type { Exercise, PlannedExercise, Program, WorkoutSession } from '@atlas/data-model';
import { effectiveProgressionPolicy } from './progressionPolicy';
import {
  computeProgressionDecision,
  findPreviousNormalSession,
  targetSnapshotOf,
} from './progressionDecision';

/**
 * Resolves each planned exercise's progression-adjusted target before a
 * session starts -- the one call site that turns "what the template says"
 * into "what today's target actually is, and why." Callers pass the
 * result straight into `startWorkoutSession`'s `plannedSnapshot`, so the
 * resolved targets and their `progression_decision` provenance are
 * captured in the session's own immutable snapshot at creation time (see
 * `WorkoutSession.planned_snapshot`'s doc comment) -- editing the program
 * or policy afterward can never rewrite a session that already started.
 *
 * `nowIso` is the chronological boundary for finding each exercise's prior
 * session (see `findPreviousNormalSession`) -- pass the real current time
 * for a normal session, or an explicit backdated timestamp when logging a
 * historical workout (see docs/PROGRESSION.md "Chronology safety"), so a
 * backfilled entry resolves its progression against what was actually true
 * at that point in history, not against sessions that hadn't happened yet.
 */
export function applyProgressionToSession(
  plannedExercises: PlannedExercise[],
  program: Pick<Program, 'default_progression_policy'> | null,
  exercisesById: Map<string, Exercise>,
  allSessions: WorkoutSession[],
  nowIso: string = new Date().toISOString(),
): PlannedExercise[] {
  return plannedExercises.map((planned) => {
    const exercise = exercisesById.get(planned.exercise_id);
    if (!exercise) return planned; // Exercise deleted/missing -- leave the plan's own target as-is.

    const policy = effectiveProgressionPolicy(program, planned);
    const previousSession = findPreviousNormalSession(allSessions, exercise.id, nowIso);
    const decision = computeProgressionDecision(
      policy,
      exercise,
      targetSnapshotOf(planned),
      previousSession,
    );

    return {
      ...planned,
      target_weight: decision.resulting_target.target_weight,
      target_external_load: decision.resulting_target.target_external_load,
      target_reps_min: decision.resulting_target.target_reps_min,
      target_reps_max: decision.resulting_target.target_reps_max,
      target_duration_seconds: decision.resulting_target.target_duration_seconds,
      progression_decision: decision,
    };
  });
}
