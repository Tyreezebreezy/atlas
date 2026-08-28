import { getOrCreateDeviceId, newId } from '@atlas/core';
import { ensureExercisesSeeded } from '@atlas/exercise-library';
import type { AtlasStorage } from '@atlas/storage';
import type { Benchmark } from '@atlas/data-model';
import { BENCHMARK_SPECS, BENCHMARK_DATASET_VERSION } from './benchmarkData';

/**
 * Mirrors ensureBuiltInMilestonesSeeded: no-op once any row of the current
 * dataset version exists, name-matches exercise names to real seeded ids
 * (null exercise_id specs, e.g. grip strength, seed as-is). No separate
 * createBenchmark factory -- unlike milestones, users never author their own
 * benchmark rows at runtime, so there's nothing else to reuse this for.
 *
 * Calls `ensureExercisesSeeded` itself first -- a real runtime test caught
 * what happens without it: every `BENCHMARK_SPECS` row gets written
 * unconditionally regardless of whether name resolution succeeded (unlike
 * milestones, which drop an unresolved spec entirely), so a call before the
 * exercise library existed permanently seeds every exercise-linked
 * benchmark with `exercise_id: null` -- and because rows genuinely got
 * written, the dataset_version no-op guard then blocks any retry forever,
 * even after exercises exist. Guaranteeing the dependency here removes the
 * ordering hazard rather than relying on caller discipline.
 *
 * Same in-flight-promise-per-storage-instance guard as
 * ensureBuiltInMilestonesSeeded, for the same reason: `newId()` runs fresh
 * per call, so two concurrent callers (React StrictMode's double-mount,
 * chiefly) would otherwise both pass the check and both insert a full
 * duplicate set.
 */
const inFlight = new WeakMap<AtlasStorage, Promise<void>>();

export function ensureBenchmarksSeeded(storage: AtlasStorage): Promise<void> {
  let promise = inFlight.get(storage);
  if (!promise) {
    promise = seed(storage);
    inFlight.set(storage, promise);
  }
  return promise;
}

async function seed(storage: AtlasStorage): Promise<void> {
  await ensureExercisesSeeded(storage);
  const [existing, exercises] = await Promise.all([
    storage.benchmarks.getAll(),
    storage.exercises.getAll(),
  ]);
  if (existing.some((b) => b.dataset_version === BENCHMARK_DATASET_VERSION)) return;

  const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e]));
  const now = new Date().toISOString();

  const toCreate: Benchmark[] = BENCHMARK_SPECS.map((spec) => ({
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    metric: spec.metric,
    exercise_id: spec.exerciseName
      ? (byName.get(spec.exerciseName.toLowerCase())?.id ?? null)
      : null,
    age_min: spec.ageMin,
    age_max: spec.ageMax,
    age_group: spec.ageGroup,
    comparison_population: spec.comparisonPopulation,
    percentile_thresholds: spec.percentileThresholds,
    source: spec.source,
    source_url: spec.sourceUrl,
    sample_description: spec.sampleDescription,
    year: spec.year,
    method: spec.method,
    notes: spec.notes,
    evidence_grade: spec.evidenceGrade,
    dataset_version: BENCHMARK_DATASET_VERSION,
  }));

  await storage.benchmarks.putMany(toCreate);
}
