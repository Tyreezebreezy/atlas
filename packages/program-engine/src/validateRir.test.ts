import { describe, expect, it } from 'vitest';
import { isValidRir } from './validateRir';

describe('isValidRir', () => {
  it('accepts null -- absent RIR is always valid, progression must not require it', () => {
    expect(isValidRir(null)).toBe(true);
  });

  it('accepts every integer in the existing 0-10 UI range', () => {
    for (let i = 0; i <= 10; i++) expect(isValidRir(i)).toBe(true);
  });

  it('rejects a negative value', () => {
    expect(isValidRir(-1)).toBe(false);
  });

  it('rejects a value above the existing 0-10 range', () => {
    expect(isValidRir(11)).toBe(false);
  });

  it('rejects a non-integer value', () => {
    expect(isValidRir(2.5)).toBe(false);
  });
});
