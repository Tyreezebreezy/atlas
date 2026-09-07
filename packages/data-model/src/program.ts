import type { SyncMeta } from './sync';
import type { ProgressionPolicy } from './progression';

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
  /** v0.2.0. Weakest tier of the progression-policy hierarchy -- a
   * PlannedExercise's own `progression_policy` always wins when set. Null
   * (and absent, for programs from before this field existed) means "no
   * program-level default"; `effectiveProgressionPolicy()` then falls
   * through to `NO_PROGRESSION`. See docs/PROGRESSION.md. */
  default_progression_policy?: ProgressionPolicy | null;
  /** v0.2.0. Second-weakest tier of the rest hierarchy (below a
   * session/group/exercise-specific value, above the exercise library's
   * own `default_rest_seconds`) -- see docs/DATA_MODEL.md "Rest
   * hierarchy." */
  default_rest_seconds?: number | null;
  /** v0.2.0. Set only when this Program was created by importing a
   * structured document -- a stable hash of that document's content (see
   * `computeImportFingerprint` in packages/import-export), used to detect
   * "this looks like the same source re-imported" without a full
   * source-fingerprint/transaction ledger. Null for a program authored
   * directly in ATLAS. */
  import_fingerprint?: string | null;
}
