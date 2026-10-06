import type { PersonalRecord, PersonalRecordEvent } from '@atlas/data-model';
import { performanceContextKey } from './context';

/**
 * PRs whose current record-holding performance happened in this session --
 * used to populate "NEW PRs" on the workout completion summary. Because
 * `calculatePRs` breaks ties toward the earliest session, merely *tying* an
 * existing PR in a later session does not surface it here -- only a
 * strictly better performance moves `source_session_id` to the new session.
 *
 * Acceptance pass: a baseline is not progress. The first session of an exercise
 * in an equipment context sets records (the first numbers) but beats nothing, so
 * it has no headline event and every PR count already ignores it; the summary
 * agrees by only listing the records of an exercise-in-context that this session
 * has a headline event for.
 */
export function newPRsFromSession(
  allCurrentPRs: PersonalRecord[],
  sessionId: string,
  events: Pick<
    PersonalRecordEvent,
    'session_id' | 'exercise_id' | 'training_location_id' | 'gym_equipment_id'
  >[],
): PersonalRecord[] {
  const beaten = new Set(
    events
      .filter((e) => e.session_id === sessionId)
      .map((e) => `${e.exercise_id}:${performanceContextKey(e)}`),
  );
  return allCurrentPRs.filter(
    (pr) =>
      pr.source_session_id === sessionId &&
      beaten.has(`${pr.exercise_id}:${performanceContextKey(pr)}`),
  );
}
