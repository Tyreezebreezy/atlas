import type { MeasurementType, TestProtocol } from '@atlas/data-model';

export type ProtocolMatchResult =
  | { compatible: true; protocol: TestProtocol }
  | { compatible: false; reason: 'NO_PROTOCOL_CONFIGURED' | 'MEASUREMENT_TYPE_MISMATCH' };

/**
 * vNext Handoff 02 (research pack v2 §15). A logged performance can only
 * feed a protocol-gated benchmark when its measurement type actually
 * matches the protocol's -- e.g. a normal workout set of push-ups is not
 * automatically a "continuous push-up to failure" test result. This is a
 * minimal, honest compatibility gate: it confirms the coarse measurement
 * type lines up and is conservative (incompatible) otherwise; it does not
 * verify cadence/ROM/rest-policy adherence from logged data, since a
 * PerformedSet doesn't capture that detail today. No test-running UI this
 * phase -- schema/matching only.
 */
export function matchProtocol(
  protocol: TestProtocol | null,
  observedMeasurementType: MeasurementType,
): ProtocolMatchResult {
  if (!protocol) return { compatible: false, reason: 'NO_PROTOCOL_CONFIGURED' };
  if (protocol.measurement_type !== observedMeasurementType) {
    return { compatible: false, reason: 'MEASUREMENT_TYPE_MISMATCH' };
  }
  return { compatible: true, protocol };
}
