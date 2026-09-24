import type { PersonalRecord, PrKind, WorkoutSession } from '@atlas/data-model';
import { exposureSessions, type ExposureSessions } from './exposure';

/**
 * vNext Handoff 04A. One exercise-level PR event per completed session per
 * equipment context, however many detailed `PersonalRecord` rows that
 * performance produced -- the number a person means by "6 PRs this week":
 * how many exercise performances earned a new best, not how many internal
 * record categories changed. The rows stay exactly as `calculatePRs` wrote
 * them (this only groups them), so the detailed history, Strength markers and
 * the workout summary keep listing every achievement.
 */
export interface HeadlinePREvent {
  session_id: string;
  exercise_id: string;
  /** The equipment context the session ran in; null when none was recorded. */
  training_location_id: string | null;
  /** The earliest `achieved_at` among the event's records. */
  achieved_at: string;
  /** One short label for the event -- see `HEADLINE_PRIMARY_KIND_ORDER`. Display only; never changes what counts. */
  primary_kind: PrKind;
  /** Every detailed record this session's performance currently holds for the exercise, primary first. */
  records: PersonalRecord[];
}

/**
 * Which record labels an event when it holds several (first match wins).
 * Handoff 04A's order, mapped onto the repository's kinds: MAX_LOAD =
 * `max_load` (and its bodyweight analogue `weighted_bodyweight`), REP_AT_LOAD =
 * `rep_at_load`, E1RM = `estimated_1rm`, MAX_REPS = `rep` / `bodyweight`,
 * DURATION / DISTANCE = `timed` / `distance`, then the remaining kinds.
 */
export const HEADLINE_PRIMARY_KIND_ORDER: readonly PrKind[] = [
  'max_load',
  'weighted_bodyweight',
  'rep_at_load',
  'estimated_1rm',
  'rep',
  'bodyweight',
  'timed',
  'distance',
  'rep_range',
  'volume',
];

function kindRank(kind: PrKind): number {
  const rank = HEADLINE_PRIMARY_KIND_ORDER.indexOf(kind);
  return rank === -1 ? HEADLINE_PRIMARY_KIND_ORDER.length : rank;
}

/**
 * Groups the current `PersonalRecord` rows into headline events.
 *
 * - The group key is session + exercise + equipment context. A session has a
 *   single location, so this is one event per exercise performed.
 * - Baseline is not progress: a group whose session is the FIRST exposure of
 *   that exercise in that context is skipped (its rows are the first numbers).
 *   A row whose source session is not among the given sessions cannot be shown
 *   to be a later one, so it is skipped too rather than guessed at.
 * - Only records that currently stand are visible -- a record a later session
 *   beat is gone from `personalRecords` (`calculatePRs` keeps the current best
 *   only), so an event none of whose records still stand is not counted.
 *
 * Output is oldest-first and independent of input order.
 */
export function buildHeadlinePREvents(
  personalRecords: PersonalRecord[],
  sessions: WorkoutSession[],
  exposures: ExposureSessions = exposureSessions(sessions),
): HeadlinePREvent[] {
  const groups = new Map<string, PersonalRecord[]>();
  for (const record of personalRecords) {
    const key = [record.source_session_id, record.exercise_id, record.training_location_id ?? ''].join('\u0000');
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  const events: HeadlinePREvent[] = [];
  for (const group of groups.values()) {
    const [first] = group;
    if (!first) continue;
    const location = first.training_location_id ?? null;
    // Position in the context's history: 0 is the baseline session, -1 an unknown one -- neither is progress.
    const position =
      exposures.get(first.exercise_id)?.get(location)?.findIndex((s) => s.id === first.source_session_id) ?? -1;
    if (position < 1) continue;

    const records = [...group].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.id.localeCompare(b.id));
    const primary = records[0];
    if (!primary) continue;
    events.push({
      session_id: first.source_session_id,
      exercise_id: first.exercise_id,
      training_location_id: location,
      achieved_at: group.reduce((earliest, r) => (r.achieved_at < earliest ? r.achieved_at : earliest), first.achieved_at),
      primary_kind: primary.kind,
      records,
    });
  }

  return events.sort(
    (a, b) =>
      a.achieved_at.localeCompare(b.achieved_at) ||
      a.exercise_id.localeCompare(b.exercise_id) ||
      a.session_id.localeCompare(b.session_id),
  );
}

/** The events whose day falls in the inclusive `YYYY-MM-DD` range -- the shared "PRs this week" figure is this list's length. */
export function headlinePREventsInPeriod(
  events: HeadlinePREvent[],
  periodStart: string,
  periodEnd: string,
): HeadlinePREvent[] {
  return events.filter((event) => {
    const day = event.achieved_at.slice(0, 10);
    return day >= periodStart && day <= periodEnd;
  });
}
