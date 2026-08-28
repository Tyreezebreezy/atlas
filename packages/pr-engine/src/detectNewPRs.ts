import type { PersonalRecord } from '@atlas/data-model';

/**
 * PRs whose current record-holding performance happened in this session --
 * used to populate "NEW PRs" on the workout completion summary. Because
 * `calculatePRs` breaks ties toward the earliest session, merely *tying* an
 * existing PR in a later session does not surface it here -- only a
 * strictly better performance moves `source_session_id` to the new session.
 */
export function newPRsFromSession(
  allCurrentPRs: PersonalRecord[],
  sessionId: string,
): PersonalRecord[] {
  return allCurrentPRs.filter((pr) => pr.source_session_id === sessionId);
}
