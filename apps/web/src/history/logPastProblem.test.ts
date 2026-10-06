import { describe, expect, it } from 'vitest';
import { logPastProblem, pastMinutes } from './logPastProblem';

// Local-time constructor on purpose: the check compares against the device's own calendar day.
const now = new Date(2026, 9, 5, 14, 30); // Mon 5 Oct 2026, 14:30
const ok = { date: '2026-10-02', startTime: '18:00', durationMinutes: '45' };

describe('logPastProblem', () => {
  it('accepts a normal past entry, today, and a blank start time / duration', () => {
    expect(logPastProblem(ok, now)).toBeNull();
    expect(
      logPastProblem({ date: '2026-10-05', startTime: '', durationMinutes: '' }, now),
    ).toBeNull();
    expect(
      logPastProblem({ date: '2026-10-05', startTime: '14:30', durationMinutes: '1' }, now),
    ).toBeNull();
    expect(logPastProblem({ ...ok, durationMinutes: '1440' }, now)).toBeNull();
  });

  it('refuses an empty or malformed date instead of throwing', () => {
    expect(logPastProblem({ ...ok, date: '' }, now)).toBe('Pick the date of the workout.');
    expect(logPastProblem({ ...ok, date: '2026-13-45' }, now)).toBe(
      'Pick the date of the workout.',
    );
    expect(logPastProblem({ ...ok, date: 'yesterday' }, now)).toBe('Pick the date of the workout.');
  });

  it('refuses a future day, and a start time later today that has not happened yet', () => {
    expect(logPastProblem({ ...ok, date: '2026-10-06' }, now)).toMatch(/hasn't happened yet/);
    expect(
      logPastProblem({ date: '2026-10-05', startTime: '14:31', durationMinutes: '' }, now),
    ).toMatch(/start time/);
    // a late start time on an EARLIER day is fine
    expect(
      logPastProblem({ date: '2026-10-04', startTime: '23:59', durationMinutes: '' }, now),
    ).toBeNull();
  });

  it('refuses a duration that is zero, negative, huge, or not a number', () => {
    for (const bad of ['0', '-30', '1441', '5000', '1e9', 'abc', 'Infinity']) {
      expect(logPastProblem({ ...ok, durationMinutes: bad }, now), bad).toMatch(
        /between 1 and 1440/,
      );
    }
  });

  it('a blank duration counts as an hour', () => {
    expect(pastMinutes('')).toBe(60);
    expect(pastMinutes('  ')).toBe(60);
    expect(pastMinutes('45')).toBe(45);
  });
});
