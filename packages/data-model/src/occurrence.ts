import type { SyncMeta } from './sync';

export type WorkoutOccurrenceStatus = 'planned' | 'moved' | 'skipped' | 'completed' | 'replaced';

/**
 * A single calendar-dated instance of a planned workout, layered on top of
 * `Program` (which stays a pure template -- see docs/DATA_MODEL.md's "no
 * calendar-date concept" note, still true of the template itself: this
 * entity exists so that stays true).
 *
 * Created lazily. Most days never get a row here at all -- Today's screen
 * derives "what's planned today" from `Program.progression_mode` exactly
 * as before v0.2.0, and only when the owner actually moves, skips, or
 * replaces a specific day's workout does a row get created to record that
 * one deviation. Do not create one speculatively for every future date;
 * there is no recurring-schedule/calendar engine here, deliberately (see
 * the v0.2.0 handoff's deferred-features list).
 */
export interface WorkoutOccurrence extends SyncMeta {
  program_id: string;
  program_day_id: string;
  /** Calendar date (YYYY-MM-DD) this occurrence was originally planned for
   * -- never changes after creation, even once moved. */
  original_date: string;
  /** Where the workout actually is now. Equal to original_date unless
   * status is 'moved'. */
  effective_date: string;
  status: WorkoutOccurrenceStatus;
  /** Set only when status is 'replaced' -- the WorkoutTemplate actually
   * used instead of the Program day's own template. */
  replacement_template_id: string | null;
  /** Set only when status is 'completed'. The WorkoutSession remains the
   * immutable performed record; this is just the pointer to it. */
  session_id: string | null;
  notes: string | null;
  /** v0.2.5. "Dismiss from Today" -- stops surfacing this missed occurrence
   * in Today's missed-workout reminder section WITHOUT changing its
   * scheduling status (still `planned`/`moved`/etc.). Distinct from skip,
   * complete, or move: this is purely a Today-surfacing preference. The
   * occurrence stays discoverable through week navigation and Program. */
  dismissed_from_today?: boolean;
}
