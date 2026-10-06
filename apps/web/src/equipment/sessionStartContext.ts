import type {
  Exercise,
  ExerciseEquipmentContext,
  GymEquipmentInstance,
  Program,
  WorkoutSession,
} from '@atlas/data-model';
import { effectiveExerciseEquipment } from '@atlas/equipment-engine';
import { sessionsPreferringContext } from '@atlas/pr-engine';
import { applyProgressionToSession, type SessionStartContext } from '@atlas/program-engine';

/**
 * vNext Handoff 04B. The glue between what ATLAS knows about places and
 * machines and the one engine that writes a workout's target
 * (`applyProgressionToSession`). Nothing here decides a load: it only says which
 * machine each exercise is on and which history to progress from, in the same
 * terms the live "Today" line uses -- so the TARGET a workout is stamped with
 * and the recommendation shown beside it can never disagree about the machine.
 */

type Where = Pick<WorkoutSession, 'training_location_id' | 'exercise_equipment'>;

export interface EquipmentKnowledge {
  contexts: ExerciseEquipmentContext[];
  instances: GymEquipmentInstance[];
}

/**
 * For a workout at `where`: the machine each exercise will be on (the one chosen
 * in the workout, else the one remembered for the exercise at that place --
 * never a guess between several) and the history to progress from (the same
 * machine at the same place when the exercise has been done there, otherwise
 * everything).
 */
export function startContextFor(
  where: Where,
  knowledge: EquipmentKnowledge,
  history: WorkoutSession[],
): (exerciseId: string) => SessionStartContext {
  return (exerciseId) => {
    const machine = effectiveExerciseEquipment(
      where,
      exerciseId,
      knowledge.contexts,
      knowledge.instances,
    );
    return {
      equipment: machine.constraints,
      history: sessionsPreferringContext(history, exerciseId, {
        training_location_id: where.training_location_id ?? null,
        gym_equipment_id: machine.instance?.id ?? null,
      }),
    };
  };
}

export interface RestampInputs extends EquipmentKnowledge {
  program: Pick<Program, 'default_progression_policy'> | null;
  exercisesById: Map<string, Exercise>;
  /** Sessions before this one -- the history the targets progress from. */
  history: WorkoutSession[];
}

/**
 * An exercise nothing has been logged on yet takes the target for the machine and
 * place it is NOW going to be done at. The target was worked out when the
 * workout started, before the owner had said which machine this is (the very
 * first time at a gym) or had moved to another gym; without this the card would
 * say TARGET 180 lb beside a 120 lb machine.
 *
 * What a set was performed against is never rewritten, so an exercise with a
 * logged set keeps its target, and so does an entry that never had a progression
 * decision (an exercise added or swapped in during the workout has no program
 * behind its number). `only` limits it to one exercise -- choosing a machine
 * changes that exercise alone; moving to another place changes them all.
 * Returns the same object when there is nothing to do.
 */
export function restampUntouchedTargets(
  session: WorkoutSession,
  inputs: RestampInputs,
  only?: string,
): WorkoutSession {
  const logged = new Set(session.performed_sets.map((set) => set.exercise_id));
  const stale = session.planned_snapshot.filter(
    (planned) =>
      (only == null || planned.exercise_id === only) &&
      planned.progression_decision != null &&
      !logged.has(planned.exercise_id),
  );
  if (stale.length === 0) return session;

  const fresh = new Map(
    applyProgressionToSession(
      stale,
      inputs.program,
      inputs.exercisesById,
      inputs.history,
      session.started_at,
      startContextFor(session, inputs, inputs.history),
    ).map((planned) => [planned.id, planned]),
  );
  return {
    ...session,
    planned_snapshot: session.planned_snapshot.map((planned) => fresh.get(planned.id) ?? planned),
    updated_at: new Date().toISOString(),
    version: session.version + 1,
  };
}
