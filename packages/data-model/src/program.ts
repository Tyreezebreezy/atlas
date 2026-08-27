import type { SyncMeta } from './sync';

export interface ProgramDay {
  id: string;
  order: number;
  label: string;
  template_id: string;
}

export interface ProgramWeek {
  id: string;
  order: number;
  label: string | null;
  days: ProgramDay[];
}

export interface Program extends SyncMeta {
  name: string;
  description: string | null;
  is_active: boolean;
  weeks: ProgramWeek[];
}
