import { describe, expect, it } from 'vitest';
import { compareByName } from './sort';

describe('compareByName', () => {
  it('sorts alphabetically, case-insensitively', () => {
    const items = [{ name: 'zebra' }, { name: 'Apple' }, { name: 'banana' }];
    expect(items.sort(compareByName).map((i) => i.name)).toEqual(['Apple', 'banana', 'zebra']);
  });

  it('does not depend on insertion/source order', () => {
    const alreadySorted = [{ name: 'Apple' }, { name: 'banana' }, { name: 'zebra' }];
    const reversed = [...alreadySorted].reverse();
    expect(reversed.sort(compareByName)).toEqual(alreadySorted);
  });
});
