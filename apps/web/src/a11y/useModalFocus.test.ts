import { describe, expect, it } from 'vitest';
import { trapTarget } from './useModalFocus';

describe('trapTarget: Tab never leaves a modal dialog', () => {
  const items = ['close', 'history', 'back'];

  it('lets the browser move focus normally inside the dialog', () => {
    expect(trapTarget(items, 'history', false)).toBeNull();
    expect(trapTarget(items, 'history', true)).toBeNull();
    expect(trapTarget(items, 'close', false)).toBeNull();
  });

  it('wraps at both ends', () => {
    expect(trapTarget(items, 'back', false)).toBe('close'); // Tab on the last control -> the first
    expect(trapTarget(items, 'close', true)).toBe('back'); // Shift+Tab on the first -> the last
  });

  it('pulls focus back in when it has escaped to the page behind the overlay', () => {
    expect(trapTarget(items, 'behind-the-overlay', false)).toBe('close');
    expect(trapTarget(items, 'behind-the-overlay', true)).toBe('back');
    expect(trapTarget(items, null, false)).toBe('close');
  });

  it('has nothing to move to when the dialog has no focusable control', () => {
    expect(trapTarget([], null, false)).toBeNull();
  });

  it('a single control keeps focus on itself', () => {
    expect(trapTarget(['only'], 'only', false)).toBe('only');
    expect(trapTarget(['only'], 'only', true)).toBe('only');
  });
});
