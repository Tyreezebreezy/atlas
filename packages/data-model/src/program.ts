import type { OwnerStarterPackProvenance, SyncMeta } from './sync';
import type { ProgressionPolicy } from './progression';

export interface ProgramDay {
  id: string;
  order: number;
  label: string;
  template_id: string;
  /** v0.2.2. Explicit calendar-weekday assignment for a Weekly/Calendar
   * ("fixed") program -- `Date.getDay()` convention (0 = Sunday .. 6 =
   * Saturday). Null/absent means "not scheduled to a specific weekday": a
   * day authored before this field existed, a day deliberately left
   * unscheduled, or any day in a Sequential program (where weekday is
   * irrelevant -- order is what matters there). `resolveDayWeekday()`
   * (packages/program-engine) falls back to parsing a recognizable weekday
   * name out of `label` for a day with no explicit value, so existing
   * fixed-mode programs whose day labels already read "Monday · Upper A"
   * (every real one seen in practice) resolve correctly without a forced
   * migration -- see docs/DATA_MODEL.md "Weekly schedule resolution." */
  weekday?: number | null;
}

export interface ProgramWeek {
  id: string;
  order: number;
  label: string | null;
  days: ProgramDay[];
}

/** Fixed ("Weekly/Calendar Schedule" in owner-facing UI, v0.2.2): Today
 * resolves the ONE day whose weekday matches today's local date (see
 * `todaysScheduledDay()`) -- v0.0.1-v0.1.5's original behavior ("Today
 * shows every week/day, the user picks any of them") is now the Program
 * tab's job, not Today's; Today shows exactly one card. Sequential: Today
 * shows only the day at `sequence_position` -- the next workout stays
 * "next" until it's completed or intentionally skipped, regardless of what
 * day of the week it actually is; a missed day is not auto-skipped. See
 * docs/DATA_MODEL.md. */
export type ProgramProgressionMode = 'fixed' | 'sequential';

export interface Program extends SyncMeta {
  name: string;
  description: string | null;
  is_active: boolean;
  /** Acceptance pass (vNext 04B). When this program last became the active one (set by `setActiveProgram`). A
   * workout scheduled before a program was created -- or before it was switched to -- was never this program's
   * to miss, so Today's "Missed" list starts at the later of `created_at` and this. Absent on a program stored
   * before this field existed: `created_at` stands in, which is what it always was. */
  activated_at?: string | null;
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
  /** v0.2.1. See `OwnerStarterPackProvenance`'s doc comment. */
  starter_pack?: OwnerStarterPackProvenance | null;
}
