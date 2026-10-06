import { sessionLocalDate, type SessionDateFields } from '@atlas/core';

/**
 * "Oct 4" for a workout -- the calendar day it counts toward, which is the one every other grouping uses
 * (`sessionLocalDate`: the day stored on the session when it started, else the viewer-local day of its
 * completion). Formatting the start INSTANT instead would label a 9 pm workout in the US with tomorrow's date
 * (and with a different date after travelling) while History files it under the right day.
 */
export function formatSessionDate(session: SessionDateFields): string {
  const day = sessionLocalDate(session);
  if (!day) return '';
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
