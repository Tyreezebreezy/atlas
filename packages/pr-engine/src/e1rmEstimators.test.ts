import { describe, expect, it } from 'vitest';
import { brzyckiEstimator, epleyEstimator, DEFAULT_E1RM_ESTIMATOR, E1RM_ESTIMATORS } from './e1rmEstimators';

describe('brzyckiEstimator', () => {
  it('is the registered default per the vNext Handoff 02 owner decision', () => {
    expect(DEFAULT_E1RM_ESTIMATOR).toBe(brzyckiEstimator);
  });

  it('a true 1-rep set resolves to the actual load unchanged, no formula inflation', () => {
    expect(brzyckiEstimator.estimate(225, 1)).toBe(225);
  });

  it('calculates within the supported 2-10 rep range', () => {
    expect(brzyckiEstimator.estimate(205, 5)).toBeCloseTo(230.625, 3);
    expect(brzyckiEstimator.supports(205, 5)).toBe(true);
  });

  it('is unsupported above 10 reps -- returns null, not a wrong-looking number', () => {
    expect(brzyckiEstimator.estimate(135, 12)).toBeNull();
    expect(brzyckiEstimator.supports(135, 12)).toBe(false);
  });

  it('rejects an invalid (zero/negative) load', () => {
    expect(brzyckiEstimator.estimate(0, 5)).toBeNull();
    expect(brzyckiEstimator.estimate(-45, 5)).toBeNull();
    expect(brzyckiEstimator.supports(0, 5)).toBe(false);
  });

  it('rejects a non-integer or non-positive rep count', () => {
    expect(brzyckiEstimator.estimate(135, 0)).toBeNull();
    expect(brzyckiEstimator.estimate(135, 5.5)).toBeNull();
  });
});

describe('epleyEstimator (legacy, still registered for provenance/back-compat)', () => {
  it('stays registered alongside Brzycki, not removed', () => {
    expect(E1RM_ESTIMATORS).toContain(epleyEstimator);
    expect(E1RM_ESTIMATORS).toContain(brzyckiEstimator);
  });

  it('is no longer the default', () => {
    expect(DEFAULT_E1RM_ESTIMATOR).not.toBe(epleyEstimator);
  });

  it('still supports up to its original 12-rep cutoff, unchanged', () => {
    expect(epleyEstimator.supports(135, 12)).toBe(true);
    expect(epleyEstimator.supports(135, 13)).toBe(false);
    expect(epleyEstimator.estimate(135, 12)).toBeCloseTo(135 * (1 + 12 / 30), 5);
  });
});

describe('estimator provenance', () => {
  it('every registered estimator exposes a stable id and version', () => {
    for (const estimator of E1RM_ESTIMATORS) {
      expect(typeof estimator.id).toBe('string');
      expect(estimator.id.length).toBeGreaterThan(0);
      expect(typeof estimator.version).toBe('string');
    }
  });
});
