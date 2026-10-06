import type {
  Exercise,
  GymEquipmentInstance,
  PlannedExercise,
  Program,
  WorkoutSession,
} from '@atlas/data-model';
import { effectiveProgressionPolicy } from './progressionPolicy';
import { findPreviousNormalSession, targetSnapshotOf } from './progressionDecision';
import { decideWithinEquipment } from './recommendProgression';

/**
 * vNext Handoff 04B. What a workout that is about to start knows about where one
 * exercise will be done -- the same two things the live "Today" line is given.
 */
export interface SessionStartContext {
  /** The machine this exercise will be on (the one remembered for it at the chosen place), or null when none is known. A target is never held to a machine nobody picked. */
  equipment: GymEquipmentInstance | null;
  /** The sessions to progress from: the same machine at the same place when this exercise has been done there, otherwise all history. */
  history: WorkoutSession[];
}

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
 *
 * `contextFor` (vNext Handoff 04B) supplies, per exercise, the machine it will
 * be on and the history to progress from. With it, the stamped target never
 * exceeds a load that machine can give (see `decideWithinEquipment`); without it
 * -- a backdated entry has no place or machine -- every target is exactly what
 * the unconstrained engine decides, as before.
 */
export function applyProgressionToSession(
  plannedExercises: PlannedExercise[],
  program: Pick<Program, 'default_progression_policy'> | null,
  exercisesById: Map<string, Exercise>,
  allSessions: WorkoutSession[],
  nowIso: string = new Date().toISOString(),
  contextFor?: (exerciseId: string) => SessionStartContext,
): PlannedExercise[] {
  return plannedExercises.map((planned) => {
    const exercise = exercisesById.get(planned.exercise_id);
    if (!exercise) return planned; // Exercise deleted/missing -- leave the plan's own target as-is.

    const policy = effectiveProgressionPolicy(program, planned);
    const start = contextFor?.(exercise.id);
    const decision = decideWithinEquipment({
      exercise,
      policy,
      currentTarget: targetSnapshotOf(planned),
      previousSession: findPreviousNormalSession(
        start?.history ?? allSessions,
        exercise.id,
        nowIso,
      ),
      equipment: start?.equipment ?? null,
    });

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
