import { beforeEach, describe, expect, it } from 'vitest';
import { __resetOnceFlagsForTesting, hasRunOnce, markRunOnce } from './onceFlags';

describe('onceFlags', () => {
  beforeEach(() => {
    __resetOnceFlagsForTesting();
  });

  it('is false for a key that has never been marked', () => {
    expect(hasRunOnce(`test-unmarked-${crypto.randomUUID()}`)).toBe(false);
  });

  it('is true after being marked, and stays true on a later check', () => {
    const key = `test-marked-${crypto.randomUUID()}`;
    expect(hasRunOnce(key)).toBe(false);
    markRunOnce(key);
    expect(hasRunOnce(key)).toBe(true);
    expect(hasRunOnce(key)).toBe(true);
  });

  it('keys are independent of each other', () => {
    const a = `test-a-${crypto.randomUUID()}`;
    const b = `test-b-${crypto.randomUUID()}`;
    markRunOnce(a);
    expect(hasRunOnce(a)).toBe(true);
    expect(hasRunOnce(b)).toBe(false);
  });
});
