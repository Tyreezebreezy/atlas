import { describe, expect, it } from 'vitest';
import { getOrCreateDeviceId } from './deviceId';

describe('getOrCreateDeviceId', () => {
  it('returns a stable id across calls', () => {
    const a = getOrCreateDeviceId();
    const b = getOrCreateDeviceId();
    expect(a).toBe(b);
  });
});
