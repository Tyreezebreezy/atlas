import { describe, expect, it } from 'vitest';
import { calculatePlateBreakdown, DEFAULT_AVAILABLE_PLATES } from './plateCalculator';

describe('calculatePlateBreakdown', () => {
  it('breaks down a standard Olympic-bar load exactly', () => {
    const result = calculatePlateBreakdown(185, 45);
    expect(result.exact).toBe(true);
    expect(result.actualTotal).toBe(185);
    expect(result.perSide).toEqual([45, 25]); // 70/side: 45 + 25
  });

  it('matches the handoff worked example: 185 total, 45 bar, 45+25 per side', () => {
    const result = calculatePlateBreakdown(185, 45, DEFAULT_AVAILABLE_PLATES);
    expect(result.perSide).toEqual([45, 25]);
  });

  it('supports a custom bar weight', () => {
    const result = calculatePlateBreakdown(135, 35);
    expect(result.exact).toBe(true);
    expect(result.perSide).toEqual([45, 5]); // 50/side
  });

  it('returns an empty per-side breakdown when the bar alone meets the request', () => {
    const result = calculatePlateBreakdown(45, 45);
    expect(result.perSide).toEqual([]);
    expect(result.exact).toBe(true);
    expect(result.actualTotal).toBe(45);
  });

  it('never loads less than the bar itself when the request is under the bar weight', () => {
    const result = calculatePlateBreakdown(30, 45);
    expect(result.perSide).toEqual([]);
    expect(result.actualTotal).toBe(45);
    expect(result.exact).toBe(false); // 45 != 30, correctly flagged
  });

  it('finds the nearest achievable load, never rounding up past the request, when exact is unavailable', () => {
    // 187.5 needs 71.25/side -- unreachable with 2.5 lb granularity.
    const result = calculatePlateBreakdown(187.5, 45);
    expect(result.exact).toBe(false);
    expect(result.actualTotal).toBeLessThanOrEqual(187.5);
    expect(result.actualTotal).toBe(185); // nearest achievable at or below
  });

  it('respects a custom, smaller available-plate set', () => {
    const result = calculatePlateBreakdown(95, 45, [10, 5]);
    expect(result.perSide).toEqual([10, 10, 5]); // 25/side using only 10s and 5s
    expect(result.exact).toBe(true);
  });
});
