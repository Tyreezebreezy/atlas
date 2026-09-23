import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { EquipmentDefinition, ExerciseEquipmentContext, GymEquipmentInstance, LoadUnit } from '@atlas/data-model';

function stamp() {
  const now = new Date().toISOString();
  return { id: newId(), created_at: now, updated_at: now, version: 1, device_id: getOrCreateDeviceId(), deleted_at: null };
}

export interface CreateEquipmentDefinitionInput {
  type: string;
  name: string;
}

export function createEquipmentDefinition(input: CreateEquipmentDefinitionInput): EquipmentDefinition {
  return { ...stamp(), type: input.type, name: input.name };
}

export interface CreateGymEquipmentInstanceInput {
  trainingLocationId: string;
  equipmentDefinitionId: string;
  label: string;
  manufacturer?: string | null;
  model?: string | null;
  exactLoads?: number[] | null;
  minLoad?: number | null;
  maxLoad?: number | null;
  increment?: number | null;
  unit?: LoadUnit;
  notes?: string | null;
}

export function createGymEquipmentInstance(input: CreateGymEquipmentInstanceInput): GymEquipmentInstance {
  return {
    ...stamp(),
    training_location_id: input.trainingLocationId,
    equipment_definition_id: input.equipmentDefinitionId,
    label: input.label,
    manufacturer: input.manufacturer ?? null,
    model: input.model ?? null,
    exact_loads: input.exactLoads ? [...input.exactLoads].sort((a, b) => a - b) : null,
    min_load: input.minLoad ?? null,
    max_load: input.maxLoad ?? null,
    increment: input.increment ?? null,
    unit: input.unit ?? 'lb',
    notes: input.notes ?? null,
  };
}

export interface CreateExerciseEquipmentContextInput {
  exerciseId: string;
  gymEquipmentId: string;
  isDefault?: boolean;
  notes?: string | null;
}

export function createExerciseEquipmentContext(
  input: CreateExerciseEquipmentContextInput,
): ExerciseEquipmentContext {
  return {
    ...stamp(),
    exercise_id: input.exerciseId,
    gym_equipment_id: input.gymEquipmentId,
    is_default: input.isDefault ?? false,
    notes: input.notes ?? null,
  };
}
