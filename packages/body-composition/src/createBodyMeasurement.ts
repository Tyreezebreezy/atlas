import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { BodyMeasurement } from '@atlas/data-model';

export interface CreateBodyMeasurementInput {
  date: string;
  weight?: number | null;
  bodyFatPercentage?: number | null;
  fatMass?: number | null;
  leanMass?: number | null;
  muscleMass?: number | null;
  waterPercentage?: number | null;
  visceralFat?: number | null;
  boneMass?: number | null;
  bmr?: number | null;
  source?: string | null;
  notes?: string | null;
}

export function createBodyMeasurement(input: CreateBodyMeasurementInput): BodyMeasurement {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    date: input.date,
    weight: input.weight ?? null,
    body_fat_percentage: input.bodyFatPercentage ?? null,
    fat_mass: input.fatMass ?? null,
    lean_mass: input.leanMass ?? null,
    muscle_mass: input.muscleMass ?? null,
    water_percentage: input.waterPercentage ?? null,
    visceral_fat: input.visceralFat ?? null,
    bone_mass: input.boneMass ?? null,
    bmr: input.bmr ?? null,
    source: input.source ?? 'manual',
    notes: input.notes ?? null,
  };
}
