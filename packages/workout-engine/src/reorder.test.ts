import { describe, expect, it } from 'vitest';
import { reorder, withSequentialOrder } from './reorder';

describe('reorder', () => {
  it('moves an item from one index to another', () => {
    expect(reorder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op for out-of-range indexes', () => {
    const items = ['a', 'b', 'c'];
    expect(reorder(items, -1, 1)).toBe(items);
    expect(reorder(items, 0, 5)).toBe(items);
  });
});

describe('withSequentialOrder', () => {
  it('restamps order to match array position', () => {
    const items = [{ order: 5 }, { order: 1 }, { order: 9 }];
    expect(withSequentialOrder(items)).toEqual([{ order: 0 }, { order: 1 }, { order: 2 }]);
  });
});
