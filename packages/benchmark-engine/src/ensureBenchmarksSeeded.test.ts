import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { ensureExercisesSeeded } from '@atlas/exercise-library';
import { BENCHMARK_SPECS, BENCHMARK_DATASET_VERSION } from './benchmarkData';
import { ensureBenchmarksSeeded } from './ensureBenchmarksSeeded';

describe('ensureBenchmarksSeeded', () => {
  it('seeds a benchmark per spec, resolving exercise names where present', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    await ensureBenchmarksSeeded(storage);

    const benchmarks = await storage.benchmarks.getAll();
    expect(benchmarks.length).toBe(BENCHMARK_SPECS.length);
    expect(benchmarks.every((b) => b.dataset_version === BENCHMARK_DATASET_VERSION)).toBe(true);

    const pushups = benchmarks.find((b) => b.metric === 'pushups');
    expect(pushups?.exercise_id).not.toBeNull();

    const grip = benchmarks.find((b) => b.metric === 'grip_strength_kg');
    expect(grip?.exercise_id).toBeNull();
  });

  it('is a no-op once the current dataset version already exists', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    await ensureBenchmarksSeeded(storage);
    await ensureBenchmarksSeeded(storage);

    const benchmarks = await storage.benchmarks.getAll();
    expect(benchmarks.length).toBe(BENCHMARK_SPECS.length);
  });

  it('resolves real exercise ids even when the caller never seeded the exercise library first', async () => {
    // Regression test for a real bug a runtime run caught: unlike
    // milestones (which drop an unresolvable spec entirely), this function
    // always writes a row per spec, so a premature call used to permanently
    // stick every exercise-linked benchmark with exercise_id: null -- the
    // dataset_version no-op guard then blocked any retry forever, even
    // after exercises existed. Only grip_strength_kg should stay null,
    // by design (no matching ATLAS exercise).
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureBenchmarksSeeded(storage);

    const benchmarks = await storage.benchmarks.getAll();
    expect(benchmarks.length).toBe(BENCHMARK_SPECS.length);
    for (const b of benchmarks) {
      if (b.metric === 'grip_strength_kg') {
        expect(b.exercise_id).toBeNull();
      } else {
        expect(b.exercise_id).not.toBeNull();
      }
    }
  });

  it('does not double-seed when called concurrently for the same storage instance (React StrictMode double-mount)', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);
    await Promise.all([ensureBenchmarksSeeded(storage), ensureBenchmarksSeeded(storage)]);

    const benchmarks = await storage.benchmarks.getAll();
    expect(benchmarks.length).toBe(BENCHMARK_SPECS.length);
  });
});
