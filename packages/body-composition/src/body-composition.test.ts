import { describe, expect, it } from 'vitest';
import type { BodyMeasurement } from '@atlas/data-model';
import { resolveBodyweightForDate } from './resolveBodyweightForDate';
import {
  weightSeries,
  bodyFatSeries,
  weightRollingAverageSeries,
  ROLLING_MIN_WEIGH_INS,
} from './bodyMeasurementSeries';
import { createBodyMeasurement, type CreateBodyMeasurementInput } from './createBodyMeasurement';

function measurement(
  date: string,
  weight: number | null,
  overrides: Partial<CreateBodyMeasurementInput> = {},
): BodyMeasurement {
  return createBodyMeasurement({ date, weight, ...overrides });
}

describe('resolveBodyweightForDate', () => {
  it('returns null when there are no measurements at all', () => {
    expect(resolveBodyweightForDate([], '2026-06-01')).toBeNull();
  });

  it('returns null when no measurement has a weight value', () => {
    const measurements = [measurement('2026-05-01', null, { bodyFatPercentage: 18 })];
    expect(resolveBodyweightForDate(measurements, '2026-06-01')).toBeNull();
  });

  it('returns the exact match when a measurement exists on the target date', () => {
    const measurements = [measurement('2026-05-01', 180), measurement('2026-06-01', 178)];
    expect(resolveBodyweightForDate(measurements, '2026-06-01')).toBe(178);
  });

  it('returns the latest measurement on or before the target date', () => {
    const measurements = [
      measurement('2026-04-01', 185),
      measurement('2026-05-15', 180),
      measurement('2026-07-01', 175),
    ];
    expect(resolveBodyweightForDate(measurements, '2026-06-01')).toBe(180);
  });

  it('falls back to the latest available measurement when none exists on or before the date', () => {
    // All measurements postdate the target -- e.g. backfilling an old workout logged before any weigh-in existed.
    const measurements = [measurement('2026-07-01', 178), measurement('2026-08-01', 176)];
    expect(resolveBodyweightForDate(measurements, '2026-01-01')).toBe(176);
  });

  it('ignores measurements with a null weight when picking the latest', () => {
    const measurements = [
      measurement('2026-05-01', 180),
      measurement('2026-06-01', null, { bodyFatPercentage: 15 }),
    ];
    expect(resolveBodyweightForDate(measurements, '2026-06-01')).toBe(180);
  });
});

describe('weightSeries / bodyFatSeries', () => {
  it('produces chronologically sorted points, skipping nulls', () => {
    const measurements = [
      measurement('2026-06-01', 178, { bodyFatPercentage: 17 }),
      measurement('2026-05-01', 180, { bodyFatPercentage: null }),
      measurement('2026-04-01', null, { bodyFatPercentage: 19 }),
    ];

    const weights = weightSeries(measurements);
    expect(weights.map((p) => [p.date, p.value])).toEqual([
      ['2026-05-01', 180],
      ['2026-06-01', 178],
    ]);

    const bodyFat = bodyFatSeries(measurements);
    expect(bodyFat.map((p) => [p.date, p.value])).toEqual([
      ['2026-04-01', 19],
      ['2026-06-01', 17],
    ]);
  });
});

describe('createBodyMeasurement', () => {
  it('defaults source to "manual" and every other optional metric to null', () => {
    const m = createBodyMeasurement({ date: '2026-08-28', weight: 180 });
    expect(m.source).toBe('manual');
    expect(m.body_fat_percentage).toBeNull();
    expect(m.notes).toBeNull();
    expect(m.id).toBeTruthy();
  });
});

describe('weightRollingAverageSeries', () => {
  const weigh = (date: string, weight: number | null) => measurement(date, weight);

  it('emits nothing until a window holds enough weigh-ins', () => {
    expect(ROLLING_MIN_WEIGH_INS).toBe(3);
    expect(weightRollingAverageSeries([])).toEqual([]);
    expect(weightRollingAverageSeries([weigh('2026-09-01', 180), weigh('2026-09-02', 179)])).toEqual([]);
  });

  it('averages the weigh-ins in the trailing 7 days, inclusive of the current date', () => {
    const points = weightRollingAverageSeries([
      weigh('2026-09-01', 180),
      weigh('2026-09-03', 178),
      weigh('2026-09-05', 176),
      weigh('2026-09-07', 174),
    ]);
    // Third weigh-in is the first with 3 in its window; the fourth still sees all four (Sep 1 is 6 days back).
    expect(points.map((p) => [p.date, p.value])).toEqual([
      ['2026-09-05', 178],
      ['2026-09-07', 177],
    ]);
  });

  it('drops weigh-ins that have aged out of the window', () => {
    const points = weightRollingAverageSeries([
      weigh('2026-09-01', 200),
      weigh('2026-09-08', 180),
      weigh('2026-09-09', 178),
      weigh('2026-09-10', 176),
    ]);
    // The Sep 1 reading is 9 days before Sep 10 and no longer counts.
    expect(points.at(-1)).toMatchObject({ date: '2026-09-10', value: 178 });
  });

  it('skips entries with no weight and carries the weigh-in id so charts can align it with raw points', () => {
    const rows = [
      weigh('2026-09-01', 180),
      weigh('2026-09-02', null),
      weigh('2026-09-03', 178),
      weigh('2026-09-04', 176),
    ];
    const points = weightRollingAverageSeries(rows);
    expect(points).toHaveLength(1);
    expect(points[0]?.sessionId).toBe(rows[3]?.id);
    expect(points[0]?.value).toBeCloseTo(178);
  });
});
