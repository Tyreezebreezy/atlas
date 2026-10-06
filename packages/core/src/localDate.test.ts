import { describe, expect, it } from 'vitest';
import {
  addDaysToIso,
  captureLocalTimeContext,
  dayNumber,
  localDateOfInstant,
  localIsoDate,
  mondayWeekIndex,
  sessionLocalDate,
  startOfWeekIso,
} from './localDate';

/** The instant for a wall-clock time on THIS machine -- so these assertions hold in any time zone. */
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('localIsoDate / localDateOfInstant', () => {
  it('formats the device-local calendar date, not the UTC one', () => {
    expect(localIsoDate(local(2026, 9, 27, 22, 30))).toBe('2026-09-27');
    expect(localIsoDate(local(2026, 1, 2, 0, 5))).toBe('2026-01-02');
  });

  it('with no zone, an instant lands on the viewer-local day it was done on', () => {
    // 10:30 pm on a Sunday, wherever this machine is -- and always the same Sunday.
    expect(localDateOfInstant(local(2026, 9, 27, 22, 30).toISOString())).toBe('2026-09-27');
  });

  it('with an explicit zone, the same instant is a different day on the other side of the date line', () => {
    const instant = '2026-09-28T02:30:00.000Z'; // 10:30 pm Sunday in New York (EDT)
    expect(localDateOfInstant(instant, 'America/New_York')).toBe('2026-09-27');
    expect(localDateOfInstant(instant, 'UTC')).toBe('2026-09-28');
    expect(localDateOfInstant(instant, 'Asia/Tokyo')).toBe('2026-09-28');
    expect(localDateOfInstant(instant, 'Pacific/Honolulu')).toBe('2026-09-27');
  });

  it('is empty for an unparseable instant, so it falls outside any period instead of throwing', () => {
    expect(localDateOfInstant('not a date')).toBe('');
    expect(localDateOfInstant('not a date', 'UTC')).toBe('');
  });
});

describe('sessionLocalDate', () => {
  const lateSundayNewYork = {
    completed_at: '2026-09-28T02:30:00.000Z',
    started_at: '2026-09-28T01:30:00.000Z',
  };

  it('prefers the stored local date: a late-evening workout stays on the day it was done', () => {
    expect(
      sessionLocalDate({ ...lateSundayNewYork, performed_local_date: '2026-09-27' }, 'UTC'),
    ).toBe('2026-09-27');
  });

  it('a stored local date does not move when the viewer later changes time zone', () => {
    const session = { ...lateSundayNewYork, performed_local_date: '2026-09-27' };
    for (const zone of [
      'America/New_York',
      'Europe/London',
      'Asia/Tokyo',
      'Pacific/Auckland',
      undefined,
    ]) {
      expect(sessionLocalDate(session, zone)).toBe('2026-09-27');
    }
  });

  it('a legacy session (no stored date) falls back to the viewer-zone day of its completion instant', () => {
    expect(sessionLocalDate(lateSundayNewYork, 'America/New_York')).toBe('2026-09-27');
    expect(sessionLocalDate(lateSundayNewYork, 'Asia/Tokyo')).toBe('2026-09-28'); // the documented limit: not travel-stable
  });

  it('falls back to the start instant when a session never completed', () => {
    expect(
      sessionLocalDate(
        { completed_at: null, started_at: '2026-09-28T01:30:00.000Z' },
        'America/New_York',
      ),
    ).toBe('2026-09-27');
  });

  it('ignores a malformed stored date rather than trusting it', () => {
    expect(
      sessionLocalDate(
        { ...lateSundayNewYork, performed_local_date: 'Sunday' },
        'America/New_York',
      ),
    ).toBe('2026-09-27');
    expect(
      sessionLocalDate({ ...lateSundayNewYork, performed_local_date: '' }, 'America/New_York'),
    ).toBe('2026-09-27');
  });
});

describe('captureLocalTimeContext', () => {
  it('records the device date, its IANA zone and the offset in effect at that moment', () => {
    const now = local(2026, 9, 27, 22, 30);
    const context = captureLocalTimeContext(now);
    expect(context.performed_local_date).toBe('2026-09-27');
    expect(context.utc_offset_minutes).toBe(-now.getTimezoneOffset() || 0);
    expect(context.time_zone_id).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('never returns negative zero for a UTC-offset machine', () => {
    expect(Object.is(captureLocalTimeContext().utc_offset_minutes, -0)).toBe(false);
  });
});

describe('week arithmetic', () => {
  it('startOfWeekIso is the Monday on or before the date, Sunday included', () => {
    expect(startOfWeekIso('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(startOfWeekIso('2026-09-28')).toBe('2026-09-28'); // Monday
    expect(startOfWeekIso('2026-10-01')).toBe('2026-09-28'); // Thursday
  });

  it('addDaysToIso crosses month and year ends', () => {
    expect(addDaysToIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('dayNumber counts whole days since the epoch', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2026-09-28') - dayNumber('2026-09-21')).toBe(7);
  });

  it('mondayWeekIndex puts Monday..Sunday in one week and the next Monday in the next', () => {
    const monday = mondayWeekIndex('2026-09-21');
    for (const day of [
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]) {
      expect(mondayWeekIndex(day)).toBe(monday);
    }
    expect(mondayWeekIndex('2026-09-28')).toBe(monday + 1);
    expect(mondayWeekIndex('1970-01-05')).toBe(0); // the first Monday of the epoch
    expect(mondayWeekIndex('1970-01-04')).toBe(-1); // the Sunday before it
  });
});
