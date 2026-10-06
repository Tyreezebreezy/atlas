/**
 * vNext Handoff 04B. The one definition of "which calendar day is this?".
 *
 * A timestamp (`started_at`, `completed_at`) is an instant, stored in UTC; the
 * calendar day a workout belongs to is whatever the clock on the wall said where
 * the owner was. Slicing the first ten characters of an ISO string answers a
 * different question (the day in London), which put a late-evening workout in
 * the US on the next day -- and, on a Sunday night, in the next week.
 *
 * Pure date arithmetic only: nothing here reads a storage layer or a location.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Device-local (not UTC) YYYY-MM-DD. */
export function localIsoDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDaysToIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

/** Monday of the calendar week containing `iso` -- the same Monday-first convention as the program schedule. */
export function startOfWeekIso(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00`).getDay();
  return addDaysToIso(iso, weekday === 0 ? -6 : 1 - weekday);
}

/**
 * The calendar date an instant falls on in `timeZone` (an IANA name), or in the
 * viewer's own time zone when none is given. Production code passes no zone;
 * the parameter exists so the zone-dependent behavior can be tested without
 * changing the process's clock. Returns '' for an unparseable instant, which
 * sorts before every real date and so falls outside any period.
 */
export function localDateOfInstant(instant: string | Date, timeZone?: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return '';
  if (!timeZone) return localIsoDate(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The fields of a session that say when it happened. */
export interface SessionDateFields {
  performed_local_date?: string | null;
  completed_at: string | null;
  started_at: string;
}

/**
 * The calendar day a session counts toward -- one answer for the weekly review,
 * the PR count, the activity heatmap and every other "by day" grouping.
 *
 * - A session recorded since Handoff 04B carries `performed_local_date`, the
 *   day on the device's clock when the workout started. It is a stored fact, so
 *   it does not move if the viewer later changes time zone.
 * - Any older session has no such record, so it falls back to the day its
 *   completion (else start) instant falls on in the viewer's own time zone. That
 *   is a documented approximation, not a recovered fact: an old workout viewed
 *   from a different zone than it was done in can land a day off. The time zone
 *   it was actually performed in was never recorded and is not guessed (and
 *   never inferred from a gym's address).
 */
export function sessionLocalDate(session: SessionDateFields, timeZone?: string): string {
  const stored = session.performed_local_date;
  if (stored && ISO_DATE.test(stored)) return stored;
  return localDateOfInstant(session.completed_at ?? session.started_at, timeZone);
}

/** What a new session records about when it happened, taken from the device's own clock. */
export interface LocalTimeContext {
  performed_local_date: string;
  /** IANA name (e.g. "America/New_York") when the runtime reports one; null otherwise -- never guessed. */
  time_zone_id: string | null;
  /** Minutes east of UTC at that moment (UTC-4 is -240). */
  utc_offset_minutes: number;
}

export function captureLocalTimeContext(now: Date = new Date()): LocalTimeContext {
  let timeZoneId: string | null = null;
  try {
    timeZoneId = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    // An environment without Intl time zone support just leaves the zone unrecorded.
  }
  return {
    performed_local_date: localIsoDate(now),
    time_zone_id: timeZoneId,
    // `|| 0` normalizes -0 (UTC) to 0.
    utc_offset_minutes: -now.getTimezoneOffset() || 0,
  };
}

/** Whole days since 1970-01-01 of a YYYY-MM-DD calendar date -- pure date arithmetic, no time zone involved. */
export function dayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

/** Monday-first calendar-week index of a YYYY-MM-DD date: consecutive weeks differ by exactly 1 (1970-01-05 was a Monday). */
export function mondayWeekIndex(iso: string): number {
  return Math.floor((dayNumber(iso) - 4) / 7);
}
