import { describe, expect, it } from 'vitest';
import type { ProgressionRecommendation } from '@atlas/data-model';
import { formatRecommendation, REASON_TEXT } from './formatRecommendation';

function recommendation(overrides: Partial<ProgressionRecommendation> = {}): ProgressionRecommendation {
  return {
    strategy_id: 'double_progression',
    target_load: null,
    target_reps: null,
    target_duration: null,
    target_distance: null,
    action: 'hold',
    reason_code: 'WITHIN_REP_RANGE',
    data_state: 'normal',
    constraint_applied: null,
    ...overrides,
  };
}

describe('formatRecommendation', () => {
  it('shows "Establish baseline" for a first exposure, never a fabricated number', () => {
    expect(formatRecommendation(recommendation({ data_state: 'first_exposure' }))).toBe(
      'Establish baseline',
    );
  });

  it('returns null (hide the cell) for an unsupported measurement type', () => {
    expect(formatRecommendation(recommendation({ data_state: 'not_yet_supported' }))).toBeNull();
  });

  it('shows "Review needed" when both load and rep ceiling are exhausted', () => {
    expect(formatRecommendation(recommendation({ action: 'review' }))).toBe('Review needed');
  });

  it('a review never says the same thing twice: the value says review, the reason says why', () => {
    const review = recommendation({ action: 'review', reason_code: 'PROGRAM_REVIEW_REQUIRED' });
    expect(formatRecommendation(review)).toBe('Review needed');
    expect(REASON_TEXT[review.reason_code]).not.toBe(formatRecommendation(review));
  });

  it('formats load and reps together, e.g. an equipment-ceiling target', () => {
    expect(formatRecommendation(recommendation({ target_load: 170, target_reps: 16 }))).toBe(
      '170 lb × 16',
    );
  });

  it('formats reps alone for a bodyweight exercise with no load', () => {
    expect(formatRecommendation(recommendation({ target_reps: 12 }))).toBe('12 reps');
  });

  it('formats duration alone for a timed exercise', () => {
    expect(formatRecommendation(recommendation({ target_duration: 45 }))).toBe('45s');
  });

  it('every reason code maps to short, non-raw display text', () => {
    for (const text of Object.values(REASON_TEXT)) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/^[A-Z_]+$/); // never the raw SCREAMING_SNAKE_CASE identifier
    }
  });
});
