import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { applyFreeExerciseDbMedia } from './applyFreeExerciseDbMedia';
import { applyWorkoutGuideMedia } from './applyWorkoutGuideMedia';
import { matchFreeExerciseDbMedia, type FreeExerciseDbEntry } from './matchFreeExerciseDbMedia';
import type { WorkoutGuideEntry } from './matchWorkoutGuideMedia';

function makeExercise(id: string, name: string): Exercise {
  return {
    id,
    created_at: '2026-09-06T00:00:00.000Z',
    updated_at: '2026-09-06T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name,
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
  };
}

function makeEntry(
  id: string,
  name: string,
  images = [`${id}/0.jpg`, `${id}/1.jpg`],
): FreeExerciseDbEntry {
  return {
    id,
    name,
    force: null,
    level: 'beginner',
    mechanic: null,
    equipment: 'barbell',
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    instructions: [],
    category: 'strength',
    images,
  };
}

describe('applyFreeExerciseDbMedia', () => {
  it('builds a frame-sequence ExerciseMedia from the start/end image pair', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const [result] = applyFreeExerciseDbMedia([bench], [makeEntry('Bench_Press', 'Bench Press')]);
    expect(result?.media).toEqual({
      kind: 'frame-sequence',
      url: '/exercise-media/fed/Bench_Press/0.jpg',
      frames: ['/exercise-media/fed/Bench_Press/0.jpg', '/exercise-media/fed/Bench_Press/1.jpg'],
      thumbnail_url: null,
      attribution: 'Free Exercise DB (public domain / Unlicense)',
      provider: 'free-exercise-db',
      provider_source_id: 'Bench_Press',
    });
  });

  it('never overwrites an exercise Workout Guide already gave media to', async () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const wgEntry: WorkoutGuideEntry = {
      id: 'wg-1',
      slug: 'bench-press',
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      equipment: 'Barbell',
      primaryMuscle: 'Chest',
      secondaryMuscles: [],
      isStretch: false,
      frames: [1, 2, 3].map((index) => ({
        index,
        path: `assets/bench-press/frame-${index}.png`,
        width: 512,
        height: 512,
        format: 'png',
        attribution: {
          creator: 'Bryl Lim',
          creatorUrl: 'x',
          license: 'CC BY-SA 4.0',
          licenseUrl: 'x',
        },
      })),
      attribution: {
        creator: 'Bryl Lim',
        creatorUrl: 'x',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'x',
      },
    };
    const withWorkoutGuide = applyWorkoutGuideMedia([bench], [wgEntry]);
    const result = applyFreeExerciseDbMedia(withWorkoutGuide, [
      makeEntry('Bench_Press', 'Bench Press'),
    ]);
    expect(result[0]?.media?.provider).toBe('workout-guide');
    expect(result[0]?.media?.frames).toHaveLength(3); // untouched, not replaced by FED's 2-frame pair
  });

  it('leaves unmatched exercises without media', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const squat = makeExercise('e-2', 'Squat');
    const result = applyFreeExerciseDbMedia(
      [bench, squat],
      [makeEntry('Bench_Press', 'Bench Press')],
    );
    expect(result.find((e) => e.id === 'e-2')?.media).toBeUndefined();
  });

  it('never applies media for a zero-image entry', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const result = applyFreeExerciseDbMedia([bench], [makeEntry('Bench_Press', 'Bench Press', [])]);
    expect(result[0]?.media).toBeUndefined();
  });

  describe('real-data integrity (v0.1.5 Free Exercise DB integration)', () => {
    const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
    const mediaDir = path.join(repoRoot, 'apps', 'web', 'public', 'exercise-media', 'fed');

    async function loadRealData() {
      const atlasExercises = JSON.parse(
        await readFile(
          path.join(
            repoRoot,
            'packages',
            'exercise-library',
            'src',
            'data',
            'atlas-exercises.json',
          ),
          'utf8',
        ),
      ) as Exercise[];
      const entries = JSON.parse(
        await readFile(
          path.join(
            repoRoot,
            'packages',
            'exercise-library',
            'src',
            'data',
            'freeExerciseDbManifest.json',
          ),
          'utf8',
        ),
      ) as FreeExerciseDbEntry[];
      return { atlasExercises, entries };
    }

    it('every matched ATLAS exercise id actually exists in the seed data', async () => {
      const { atlasExercises, entries } = await loadRealData();
      const report = matchFreeExerciseDbMedia(atlasExercises, entries);
      const realIds = new Set(atlasExercises.map((e) => e.id));
      const missing = report.matched.filter((m) => !realIds.has(m.atlasExerciseId));
      expect(missing).toEqual([]);
    });

    it('no two Free Exercise DB entries map to the same ATLAS exercise', async () => {
      const { atlasExercises, entries } = await loadRealData();
      const report = matchFreeExerciseDbMedia(atlasExercises, entries);
      const seen = new Map<string, string>();
      const conflicts: { atlasExerciseId: string; ids: string[] }[] = [];
      for (const m of report.matched) {
        const prior = seen.get(m.atlasExerciseId);
        if (prior && prior !== m.freeExerciseDbId) {
          conflicts.push({ atlasExerciseId: m.atlasExerciseId, ids: [prior, m.freeExerciseDbId] });
        }
        seen.set(m.atlasExerciseId, m.freeExerciseDbId);
      }
      expect(conflicts).toEqual([]);
    });

    it('every provider source id is well-formed (matches the schema pattern, non-empty)', async () => {
      const { entries } = await loadRealData();
      const malformed = entries.filter((e) => !/^[0-9a-zA-Z_-]+$/.test(e.id));
      expect(malformed.map((e) => e.id)).toEqual([]);
    });

    it('every matched exercise has both its start and end frame files on disk', async () => {
      const { atlasExercises, entries } = await loadRealData();
      const report = matchFreeExerciseDbMedia(atlasExercises, entries);
      const entryById = new Map(entries.map((e) => [e.id, e]));

      const missingFiles: string[] = [];
      for (const m of report.matched) {
        const entry = entryById.get(m.freeExerciseDbId);
        if (!entry) continue;
        expect(entry.images.length).toBe(2); // the only count this provider's matched subset should ever have
        for (let i = 0; i < entry.images.length; i++) {
          const onDisk = path.join(mediaDir, entry.id, `${i}.jpg`);
          if (!existsSync(onDisk)) missingFiles.push(`${entry.id}/${i}.jpg`);
        }
      }
      expect(missingFiles).toEqual([]);
    });

    it("Workout Guide's priority survives the real combined seed pipeline (no FED override)", async () => {
      const { atlasExercises, entries } = await loadRealData();
      const wgManifest = JSON.parse(
        await readFile(
          path.join(
            repoRoot,
            'packages',
            'exercise-library',
            'src',
            'data',
            'workoutGuideManifest.json',
          ),
          'utf8',
        ),
      ) as WorkoutGuideEntry[];

      const withWorkoutGuide = applyWorkoutGuideMedia(atlasExercises, wgManifest);
      const withBoth = applyFreeExerciseDbMedia(withWorkoutGuide, entries);

      const workoutGuideCount = withWorkoutGuide.filter((e) => e.media).length;
      const stillWorkoutGuide = withBoth.filter(
        (e) => e.media?.provider === 'workout-guide',
      ).length;
      expect(stillWorkoutGuide).toBe(workoutGuideCount); // every WG assignment survived untouched
      const fedCount = withBoth.filter((e) => e.media?.provider === 'free-exercise-db').length;
      expect(fedCount).toBeGreaterThan(0); // and FED filled in real additional coverage
    });
  });
});
