import type { ProgressionReasonCode, ProgressionRecommendation } from '@atlas/data-model';

/** vNext Handoff 03A (research pack v3 §8): short deterministic explanation
 * text, never a raw reason-code identifier or generated prose. */
export const REASON_TEXT: Record<ProgressionReasonCode, string> = {
  FIRST_EXPOSURE: 'First time',
  WITHIN_REP_RANGE: 'Hold',
  TOP_OF_RANGE: 'Rep progression',
  NEXT_LOAD_AVAILABLE: 'Load increase',
  NEXT_LOAD_TOO_LARGE: 'Rep progression',
  EQUIPMENT_MAX_REACHED: 'Max available load',
  BELOW_TARGET_RANGE: 'Hold',
  CURRENT_SESSION_FATIGUE: 'Hold',
  // The value above this line already says "Review needed"; this is why. It fires only when the load can go
  // no higher (the machine's maximum, or the configured rep ceiling) and so does the rep range.
  PROGRAM_REVIEW_REQUIRED: 'Load and reps at their limit',
  CURRENT_SESSION_BELOW_TARGET: 'Current-session adjustment',
};

/**
 * Null return means "nothing worth showing" (e.g. an unsupported
 * measurement type) -- the caller hides the whole "Today" cell rather than
 * rendering an empty or misleading value. Never recalculates the
 * recommendation itself (see recommendProgression()/refineForCurrentSession()
 * in @atlas/program-engine) -- purely a display formatter.
 */
export function formatRecommendation(rec: ProgressionRecommendation): string | null {
  if (rec.data_state === 'not_yet_supported') return null;
  if (rec.data_state === 'first_exposure') return 'Establish baseline';
  if (rec.action === 'review') return 'Review needed';
  if (rec.target_load != null && rec.target_reps != null) return `${rec.target_load} lb × ${rec.target_reps}`;
  if (rec.target_load != null) return `${rec.target_load} lb`;
  if (rec.target_reps != null) return `${rec.target_reps} reps`;
  if (rec.target_duration != null) return `${rec.target_duration}s`;
  if (rec.target_distance != null) return `${rec.target_distance}m`;
  return null;
}
