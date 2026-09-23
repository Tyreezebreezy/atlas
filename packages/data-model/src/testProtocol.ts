import type { MeasurementType } from './exercise';
import type { SyncMeta } from './sync';

/**
 * vNext Handoff 02 (research pack v2 §15). A named, versioned measurement
 * protocol -- e.g. "continuous push-up to failure" vs. "60-second push-up
 * test" are different protocols even though both log push-up reps. A
 * `Benchmark` row references one via `test_protocol_id`; a performance can
 * only be evaluated against that benchmark when its protocol matches (see
 * `packages/benchmark-engine/src/matchProtocol.ts`). Schema/registry only --
 * no test-running UI this phase.
 */
export interface TestProtocol extends SyncMeta {
  name: string;
  measurement_type: MeasurementType;
  is_timed: boolean;
  /** Required reps/strokes per unit time, e.g. a cadence test. Null = no fixed cadence. */
  cadence: string | null;
  rom_requirements: string | null;
  rest_policy: string | null;
  source: string | null;
  protocol_version: string;
  notes: string | null;
}
