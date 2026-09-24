/** @deprecated Legacy/compatibility only -- see `interpolatePercentile.ts`. Use `evaluateBenchmarkStrict`. */
export { interpolatePercentile } from './interpolatePercentile';
export type { PercentileResult } from './interpolatePercentile';
export { formatPercentileDisplay } from './formatPercentile';
export type { PercentileDisplayInput } from './formatPercentile';
export { findBenchmark } from './findBenchmark';
export { BENCHMARK_SPECS, BENCHMARK_DATASET_VERSION } from './benchmarkData';
export type { BenchmarkSpec } from './benchmarkData';
export { ensureBenchmarksSeeded } from './ensureBenchmarksSeeded';
export { matchProtocol } from './matchProtocol';
export type { ProtocolMatchResult } from './matchProtocol';
export { evaluateBenchmarkStrict, benchmarkEvaluationMethod } from './evaluateBenchmarkStrict';
export type {
  BenchmarkEvaluationContext,
  BenchmarkObservation,
  BenchmarkUnavailableCode,
  StrictBenchmarkEvaluation,
} from './evaluateBenchmarkStrict';
