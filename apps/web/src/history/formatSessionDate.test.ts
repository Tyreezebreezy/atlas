import { describe, expect, it } from 'vitest';
import { formatSessionDate } from './formatSessionDate';

describe('formatSessionDate', () => {
  it('shows the stored local day, not the UTC date of the start instant', () => {
    // 9:40 pm on Oct 4 in New York is already Oct 5 in UTC.
    const session = {
      performed_local_date: '2026-10-04',
      started_at: '2026-10-05T01:40:00.000Z',
      completed_at: '2026-10-05T02:30:00.000Z',
    };
    expect(formatSessionDate(session)).toMatch(/Oct(ober)?\s+4\b/);
  });

  it('a session recorded before local days were stored falls back to the viewer-local day of its completion', () => {
    const noon = new Date(2026, 9, 4, 12, 0).toISOString(); // wall-clock noon: the same day in any zone
    const legacy = { started_at: noon, completed_at: noon };
    expect(formatSessionDate(legacy)).toMatch(/Oct(ober)?\s+4\b/);
  });

  it('says nothing rather than "Invalid Date" when there is nothing to show', () => {
    expect(formatSessionDate({ started_at: 'not a date', completed_at: null })).toBe('');
  });
});
