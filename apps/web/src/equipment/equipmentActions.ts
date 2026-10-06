import {
  activeInstancesAt,
  archiveGymEquipmentInstance,
  archiveLocation,
  confirmEquipmentMaximum,
  createGymEquipmentInstance,
  createTrainingLocation,
  dismissMaximumConfirmation,
  findOrCreateEquipmentDefinition,
  instanceCoveringLegacyItem,
  locationUsage,
  OTHER_EQUIPMENT_TYPE,
  parseLoadConfig,
  planRememberedMapping,
  restoreGymEquipmentInstance,
  restoreLocation,
  setDefaultLocation,
  updateGymEquipmentInstance,
  updateTrainingLocation,
  validateEquipmentLabel,
  validateLocationName,
  type LoadConfigDraft,
  type LoadConfigField,
} from '@atlas/equipment-engine';
import type {
  EquipmentDefinition,
  ExerciseEquipmentContext,
  GymEquipmentInstance,
  TrainingLocation,
  WorkoutSession,
} from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';

/**
 * vNext Handoff 04B. Everything the Gyms & Equipment screens (and the live
 * workout's equipment panel) write. Each function is the thinnest possible
 * storage wrapper around a rule that lives, tested, in `@atlas/equipment-engine`
 * -- what makes a name valid, which location is the default, what archiving
 * means -- so a component never decides any of that itself.
 *
 * Nothing here ever deletes history. Archiving keeps a row (and every session
 * that points at it); only a place or machine nothing refers to can be deleted,
 * and that is a tombstone like every other delete in ATLAS.
 */

export interface GymsData {
  locations: TrainingLocation[];
  definitions: EquipmentDefinition[];
  instances: GymEquipmentInstance[];
  contexts: ExerciseEquipmentContext[];
}

export const EMPTY_GYMS_DATA: GymsData = {
  locations: [],
  definitions: [],
  instances: [],
  contexts: [],
};

/** `getAll()` returns archived rows too (archiving is not deleting), so history can resolve every name. */
export async function loadGymsData(storage: AtlasStorage): Promise<GymsData> {
  const [locations, definitions, instances, contexts] = await Promise.all([
    storage.trainingLocations.getAll(),
    storage.equipmentDefinitions.getAll(),
    storage.gymEquipment.getAll(),
    storage.exerciseEquipmentContext.getAll(),
  ]);
  return { locations, definitions, instances, contexts };
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

// ---- locations --------------------------------------------------------------

/** Creates a place from just a name. The first place ever created becomes the default -- it is the only choice, and a second place later does not silently change where workouts start. */
export async function addLocation(
  storage: AtlasStorage,
  name: string,
  existing: TrainingLocation[],
): Promise<Outcome<TrainingLocation>> {
  const error = validateLocationName(name, existing);
  if (error) return { ok: false, error };
  const created = createTrainingLocation({ name });
  const first = !existing.some((l) => l.deleted_at === null);
  const location = first ? { ...created, is_default: true } : created;
  await storage.trainingLocations.put(location);
  return { ok: true, value: location };
}

export async function saveLocationDetails(
  storage: AtlasStorage,
  location: TrainingLocation,
  patch: { name: string; note: string },
  existing: TrainingLocation[],
): Promise<Outcome<TrainingLocation>> {
  const error = validateLocationName(patch.name, existing, location.id);
  if (error) return { ok: false, error };
  const updated = updateTrainingLocation(location, { name: patch.name, note: patch.note });
  await storage.trainingLocations.put(updated);
  return { ok: true, value: updated };
}

export async function makeDefaultLocation(
  storage: AtlasStorage,
  locations: TrainingLocation[],
  locationId: string | null,
): Promise<void> {
  const changed = setDefaultLocation(locations, locationId);
  if (changed.length > 0) await storage.trainingLocations.putMany(changed);
}

export async function archiveLocationById(
  storage: AtlasStorage,
  location: TrainingLocation,
): Promise<void> {
  await storage.trainingLocations.put(archiveLocation(location));
}

export async function restoreLocationById(
  storage: AtlasStorage,
  location: TrainingLocation,
): Promise<void> {
  await storage.trainingLocations.put(restoreLocation(location));
}

/** Deletes a place only when nothing refers to it: no workout happened there and no equipment is configured there. */
export async function deleteUnusedLocation(
  storage: AtlasStorage,
  location: TrainingLocation,
  sessions: WorkoutSession[],
  instances: GymEquipmentInstance[],
): Promise<Outcome<null>> {
  const usage = locationUsage(location.id, sessions, instances);
  if (usage.sessions > 0 || usage.equipment > 0) {
    return { ok: false, error: 'This place is in use, so it can only be archived.' };
  }
  await storage.trainingLocations.softDelete(location.id);
  return { ok: true, value: null };
}

// ---- equipment --------------------------------------------------------------

export interface SaveEquipmentInput {
  locationId: string;
  /** Null creates new equipment; an id edits that instance. */
  instanceId: string | null;
  label: string;
  /** A vocabulary type from `EQUIPMENT_TYPES`, or `OTHER_EQUIPMENT_TYPE`. */
  type: string;
  /** Used only when `type` is `other`. */
  otherName: string;
  loads: LoadConfigDraft;
  notes: string;
  /** The legacy `TrainingLocation.equipment` name this is being configured from, if any. */
  legacyEquipment?: string | null;
}

export type SaveEquipmentResult =
  | { ok: true; instance: GymEquipmentInstance; created: boolean }
  | {
      ok: false;
      errors: {
        label?: string;
        type?: string;
        otherName?: string;
        loads?: Partial<Record<LoadConfigField, string>>;
      };
    };

/**
 * Creates or edits one piece of equipment. Validates everything first (so the
 * form can show every problem at once, each on its own field), finds or creates
 * the shared definition for its kind, and writes the instance. Configuring a
 * legacy item that already has an instance returns that instance instead of
 * making a second -- "Configure" is safe to repeat.
 */
export async function saveEquipment(
  storage: AtlasStorage,
  data: GymsData,
  input: SaveEquipmentInput,
): Promise<SaveEquipmentResult> {
  if (input.instanceId === null && input.legacyEquipment) {
    const covering = instanceCoveringLegacyItem(
      input.locationId,
      input.legacyEquipment,
      data.instances,
      data.definitions,
    );
    const existing = covering ? data.instances.find((i) => i.id === covering.id) : undefined;
    if (existing) return { ok: true, instance: existing, created: false };
  }

  const errors: Extract<SaveEquipmentResult, { ok: false }>['errors'] = {};
  const siblings = data.instances.filter((i) => i.training_location_id === input.locationId);
  const labelError = validateEquipmentLabel(input.label, siblings, input.instanceId);
  if (labelError) errors.label = labelError;
  if (input.type === '') {
    errors.type = 'Choose what kind of equipment this is.';
  } else if (input.type === OTHER_EQUIPMENT_TYPE && input.otherName.trim() === '') {
    errors.otherName = 'Say what kind of equipment this is.';
  }
  const loads = parseLoadConfig(input.loads);
  if (!loads.ok) errors.loads = loads.errors;
  if (Object.keys(errors).length > 0 || !loads.ok) return { ok: false, errors };

  const { definition, created: definitionCreated } = findOrCreateEquipmentDefinition(
    data.definitions,
    {
      type: input.type,
      name: input.otherName,
    },
  );
  if (definitionCreated) await storage.equipmentDefinitions.put(definition);

  const existing = input.instanceId
    ? data.instances.find((i) => i.id === input.instanceId)
    : undefined;
  if (existing) {
    const updated = updateGymEquipmentInstance(existing, {
      label: input.label,
      equipment_definition_id: definition.id,
      notes: input.notes,
      loads: loads.fields,
    });
    await storage.gymEquipment.put(updated);
    return { ok: true, instance: updated, created: false };
  }

  const instance = createGymEquipmentInstance({
    trainingLocationId: input.locationId,
    equipmentDefinitionId: definition.id,
    label: input.label.trim(),
    exactLoads: loads.fields.exact_loads,
    minLoad: loads.fields.min_load,
    maxLoad: loads.fields.max_load,
    increment: loads.fields.increment,
    notes: input.notes.trim() ? input.notes.trim() : null,
    legacyEquipment: input.legacyEquipment ?? null,
  });
  await storage.gymEquipment.put(instance);
  return { ok: true, instance, created: true };
}

export async function archiveEquipment(
  storage: AtlasStorage,
  instance: GymEquipmentInstance,
): Promise<void> {
  await storage.gymEquipment.put(archiveGymEquipmentInstance(instance));
}

export async function restoreEquipment(
  storage: AtlasStorage,
  instance: GymEquipmentInstance,
): Promise<void> {
  await storage.gymEquipment.put(restoreGymEquipmentInstance(instance));
}

/** Deletes a piece of equipment (and the remembered mappings that point at it) only when no workout used it. */
export async function deleteUnusedEquipment(
  storage: AtlasStorage,
  instance: GymEquipmentInstance,
  sessions: WorkoutSession[],
  contexts: ExerciseEquipmentContext[],
): Promise<Outcome<null>> {
  const used = sessions.some((s) =>
    s.exercise_equipment?.some((e) => e.gym_equipment_id === instance.id),
  );
  if (used)
    return { ok: false, error: 'A workout used this equipment, so it can only be archived.' };
  await storage.gymEquipment.softDelete(instance.id);
  for (const context of contexts) {
    if (context.gym_equipment_id === instance.id)
      await storage.exerciseEquipmentContext.softDelete(context.id);
  }
  return { ok: true, value: null };
}

// ---- during a workout -------------------------------------------------------

/** Remembers the machine the owner picked for an exercise at its place, so it is reused next time. Returns the rows written. */
export async function rememberEquipmentChoice(
  storage: AtlasStorage,
  data: Pick<GymsData, 'contexts' | 'instances'>,
  exerciseId: string,
  instance: GymEquipmentInstance,
): Promise<ExerciseEquipmentContext[]> {
  const changes = planRememberedMapping(exerciseId, instance, data.contexts, data.instances);
  if (changes.length > 0) await storage.exerciseEquipmentContext.putMany(changes);
  return changes;
}

/** "Yes, 170 lb is the maximum": recorded as the machine's maximum, so progression respects it from now on. */
export async function confirmMaximum(
  storage: AtlasStorage,
  instance: GymEquipmentInstance,
  load: number,
): Promise<GymEquipmentInstance> {
  const confirmed = confirmEquipmentMaximum(instance, load);
  await storage.gymEquipment.put(confirmed);
  return confirmed;
}

/** "No / not sure": the machine is otherwise unchanged and ATLAS never asks about it again. */
export async function declineMaximum(
  storage: AtlasStorage,
  instance: GymEquipmentInstance,
): Promise<GymEquipmentInstance> {
  const dismissed = dismissMaximumConfirmation(instance);
  await storage.gymEquipment.put(dismissed);
  return dismissed;
}

/** The equipment at a workout's place, split by whether it is the kind an exercise calls for. */
export interface EquipmentChoices {
  /** The kinds the exercise calls for -- the plausible answers to "which equipment are you using?". */
  matching: GymEquipmentInstance[];
  /** Everything else configured there, still choosable (a machine whose kind was entered loosely) but never offered first. */
  other: GymEquipmentInstance[];
}

/** What a workout at `locationId` can choose from for one exercise: that place's active equipment only, grouped by fit. */
export function equipmentChoicesFor(
  data: Pick<GymsData, 'instances' | 'definitions'>,
  locationId: string | null,
  matchesKind: (definitionType: string) => boolean,
): EquipmentChoices {
  if (!locationId) return { matching: [], other: [] };
  const typeById = new Map(data.definitions.map((d) => [d.id, d.type]));
  const here = activeInstancesAt(data.instances, locationId);
  const fits = (i: GymEquipmentInstance) =>
    matchesKind(typeById.get(i.equipment_definition_id) ?? '');
  return { matching: here.filter(fits), other: here.filter((i) => !fits(i)) };
}
