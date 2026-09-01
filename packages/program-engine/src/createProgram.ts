import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { Program, ProgramDay, ProgramWeek } from '@atlas/data-model';

export function createProgram(name: string, description: string | null): Program {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    name,
    description,
    is_active: false,
    weeks: [],
    progression_mode: 'fixed',
    sequence_position: 0,
  };
}

export function createProgramWeek(order: number, label: string | null): ProgramWeek {
  return { id: newId(), order, label, days: [] };
}

export function createProgramDay(order: number, label: string, templateId: string): ProgramDay {
  return { id: newId(), order, label, template_id: templateId };
}
