import type { GymEquipmentInstance, WorkoutSession } from '@atlas/data-model';

/**
 * vNext Handoff 04B. Pure transforms for a session's context -- where it is
 * happening and which machine each exercise is being done on.
 *
 * Context is a record of where and on what the logged sets were performed, so it
 * is only ever changed while that is still true to say:
 *
 * - the workout's place is free to change until the first set is logged, and is
 *   fixed from then on (`isLocationLocked`) -- a set logged at one gym must not
 *   be re-homed to another;
 * - an exercise's machine is free to change until that exercise's first set is
 *   logged, and is fixed from then on (`isExerciseEquipmentLocked`) -- the session
 *   keeps ONE machine per exercise, so changing it after set 1 would relabel set 1.
 *
 * Both locks live here, in the transforms themselves, not only in the screen: a
 * refused change returns the very same session object, untouched (not even its
 * version moves). A finished workout is locked entirely -- nothing rewrites a past
 * workout's place or equipment. There is deliberately no per-set machine: one
 * machine per exercise per workout is the model, and the lock is what keeps that
 * single answer truthful. Training somewhere else, or on another machine, is a new
 * workout.
 */

type InstanceRef = Pick<GymEquipmentInstance, 'id' | 'training_location_id'>;

function touch(session: WorkoutSession): Pick<WorkoutSession, 'updated_at' | 'version'> {
  return { updated_at: new Date().toISOString(), version: session.version + 1 };
}

/** The `GymEquipmentInstance` `exerciseId` is recorded against in this session, or null when none is. */
export function exerciseEquipmentIdOf(
  session: Pick<WorkoutSession, 'exercise_equipment'>,
  exerciseId: string,
): string | null {
  return (
    session.exercise_equipment?.find((entry) => entry.exercise_id === exerciseId)
      ?.gym_equipment_id ?? null
  );
}

/** True once any set -- a warm-up included -- has been logged in the workout. */
export function hasLoggedSets(session: Pick<WorkoutSession, 'performed_sets'>): boolean {
  return session.performed_sets.length > 0;
}

/**
 * True when the workout's place can no longer change: a set has been logged, or the
 * workout is over. Every set belongs to the place the workout was at when it was
 * logged; moving the workout would move them.
 */
export function isLocationLocked(
  session: Pick<WorkoutSession, 'performed_sets' | 'status'>,
): boolean {
  return session.status !== 'in_progress' || hasLoggedSets(session);
}

/**
 * True when `exerciseId`'s machine can no longer change in this workout: a set of
 * that exercise has been logged (a warm-up included), or the workout is over. The
 * session stores a single machine for the whole exercise, so a different one would
 * relabel every set already logged. Sets of OTHER exercises do not lock it.
 */
export function isExerciseEquipmentLocked(
  session: Pick<WorkoutSession, 'performed_sets' | 'status'>,
  exerciseId: string,
): boolean {
  return (
    session.status !== 'in_progress' ||
    session.performed_sets.some((set) => set.exercise_id === exerciseId)
  );
}

/**
 * Records which machine `exerciseId` is being done on in this session, or clears
 * it with `null`. One entry per exercise: choosing again replaces the previous
 * choice for the whole exercise, which is why it is only allowed before the
 * exercise's first set (see `isExerciseEquipmentLocked`). Returns the same object
 * when nothing changes OR the change is refused, so callers can skip the write.
 */
export function setExerciseEquipment(
  session: WorkoutSession,
  exerciseId: string,
  gymEquipmentId: string | null,
): WorkoutSession {
  if (isExerciseEquipmentLocked(session, exerciseId)) return session;
  const current = session.exercise_equipment ?? [];
  if (exerciseEquipmentIdOf(session, exerciseId) === gymEquipmentId) return session;
  const others = current.filter((entry) => entry.exercise_id !== exerciseId);
  const next = gymEquipmentId
    ? [...others, { exercise_id: exerciseId, gym_equipment_id: gymEquipmentId }]
    : others;
  return { ...session, exercise_equipment: next, ...touch(session) };
}

export interface LocationChangeImpact {
  /** A set is logged (or the workout is over), so the place is fixed and the change is refused outright. */
  blocked: boolean;
  /** The owner must confirm first: the change would clear machine choices made at the old place. Never true when blocked. */
  needsConfirmation: boolean;
  /** Machine choices belonging to another place, which a permitted change clears. Zero when blocked: nothing changes. */
  clearedEquipment: number;
}

function equipmentOutsideLocation(
  session: Pick<WorkoutSession, 'exercise_equipment'>,
  newLocationId: string | null,
  instances: InstanceRef[],
) {
  const locationOf = new Map(
    instances.map((instance) => [instance.id, instance.training_location_id]),
  );
  return (session.exercise_equipment ?? []).filter((entry) => {
    const home = locationOf.get(entry.gym_equipment_id);
    return newLocationId == null || home !== newLocationId;
  });
}

/**
 * What changing this session's location to `newLocationId` would do, so the UI can
 * say so first. Refused once a set is logged. Before that it is free, and needs a
 * confirmation only when the owner had already picked machines at the old place
 * (they are cleared: nothing logged depends on them yet).
 */
export function locationChangeImpact(
  session: WorkoutSession,
  newLocationId: string | null,
  instances: InstanceRef[],
): LocationChangeImpact {
  if ((session.training_location_id ?? null) === newLocationId) {
    return { blocked: false, needsConfirmation: false, clearedEquipment: 0 };
  }
  if (isLocationLocked(session))
    return { blocked: true, needsConfirmation: false, clearedEquipment: 0 };
  const clearedEquipment = equipmentOutsideLocation(session, newLocationId, instances).length;
  return { blocked: false, needsConfirmation: clearedEquipment > 0, clearedEquipment };
}

/**
 * Moves a workout that has no logged sets to another location (or to none).
 * Machine choices that belong to the old location are dropped, never carried over
 * and never swapped for a look-alike at the new one -- Chest Press #1 here says
 * nothing about any machine there, so the owner chooses again. Refused (the same
 * session object, untouched) once a set is logged: the workout stays where its
 * sets happened.
 */
export function changeSessionLocation(
  session: WorkoutSession,
  newLocationId: string | null,
  instances: InstanceRef[],
): WorkoutSession {
  if ((session.training_location_id ?? null) === newLocationId) return session;
  if (isLocationLocked(session)) return session;
  const dropped = new Set(
    equipmentOutsideLocation(session, newLocationId, instances).map((entry) => entry.exercise_id),
  );
  const kept = (session.exercise_equipment ?? []).filter(
    (entry) => !dropped.has(entry.exercise_id),
  );
  return {
    ...session,
    training_location_id: newLocationId,
    ...(session.exercise_equipment ? { exercise_equipment: kept } : {}),
    ...touch(session),
  };
}
