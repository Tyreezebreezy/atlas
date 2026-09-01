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

/** Fixed: Today shows every week/day, the user picks any of them, same as
 * v0.0.1-v0.0.8. Sequential: Today shows only the day at `sequence_position`
 * -- the next workout stays "next" until it's completed or intentionally
 * skipped, regardless of what day of the week it actually is; a missed day
 * is not auto-skipped. See docs/DATA_MODEL.md. */
export type ProgramProgressionMode = 'fixed' | 'sequential';

export interface Program extends SyncMeta {
  name: string;
  description: string | null;
  is_active: boolean;
  weeks: ProgramWeek[];
  /** Added in v0.1.1 (Stage 4A). A program stored before this version has
   * neither field at runtime despite the required type -- every read site
   * that cares falls back via programProgressionMode()/sequencePosition()
   * in packages/program-engine, matching how body.ts's `notes` was handled
   * when it was added in v0.0.8. */
  progression_mode: ProgramProgressionMode;
  sequence_position: number;
}
