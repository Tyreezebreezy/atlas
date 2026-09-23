import { describe, expect, it } from 'vitest';
import type { TestProtocol } from '@atlas/data-model';
import { matchProtocol } from './matchProtocol';

function protocol(overrides: Partial<TestProtocol> = {}): TestProtocol {
  return {
    id: 'proto-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Continuous Push-Up to Failure',
    measurement_type: 'reps',
    is_timed: false,
    cadence: null,
    rom_requirements: null,
    rest_policy: null,
    source: null,
    protocol_version: 'v1',
    notes: null,
    ...overrides,
  };
}

describe('matchProtocol', () => {
  it('matches when the measurement type lines up', () => {
    const result = matchProtocol(protocol({ measurement_type: 'reps' }), 'reps');
    expect(result.compatible).toBe(true);
  });

  it('rejects a measurement-type mismatch rather than assuming compatibility', () => {
    const result = matchProtocol(protocol({ measurement_type: 'time' }), 'reps');
    expect(result).toEqual({ compatible: false, reason: 'MEASUREMENT_TYPE_MISMATCH' });
  });

  it('returns a typed result when no protocol is configured at all', () => {
    const result = matchProtocol(null, 'reps');
    expect(result).toEqual({ compatible: false, reason: 'NO_PROTOCOL_CONFIGURED' });
  });
});
