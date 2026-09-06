import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { applyWorkoutGuideMedia } from './applyWorkoutGuideMedia';
import { matchWorkoutGuideMedia, type WorkoutGuideEntry } from './matchWorkoutGuideMedia';

function makeExercise(id: string, name: string): Exercise {
  return {
    id,
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T00:00:00.000Z',
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

function makeEntry(slug: string, name: string, frameCount = 3): WorkoutGuideEntry {
  return {
    id: `exercise-${slug}`,
    slug,
    name,
    exerciseType: 'weight_reps',
    equipment: 'Barbell',
    primaryMuscle: 'Chest',
    secondaryMuscles: ['Triceps'],
    isStretch: false,
    frames: Array.from({ length: frameCount }, (_, i) => ({
      index: i + 1,
      path: `assets/${slug}/frame-${i + 1}.png`,
      width: 512,
      height: 512,
      format: 'png',
      attribution: {
        creator: 'Bryl Lim',
        creatorUrl: 'https://bryllim.com',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
    })),
    attribution: {
      creator: 'Bryl Lim',
      creatorUrl: 'https://bryllim.com',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      source: {
        name: 'Everkinetic',
        url: 'https://example.com',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        changes: 'Rasterized.',
      },
    },
  };
}

describe('applyWorkoutGuideMedia', () => {
  it('builds a frame-sequence ExerciseMedia with url as the first frame', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const [result] = applyWorkoutGuideMedia([bench], [makeEntry('bench-press', 'Bench Press')]);
    expect(result?.media).toEqual({
      kind: 'frame-sequence',
      url: '/exercise-media/bench-press/frame-1.png',
      frames: [
        '/exercise-media/bench-press/frame-1.png',
        '/exercise-media/bench-press/frame-2.png',
        '/exercise-media/bench-press/frame-3.png',
      ],
      thumbnail_url: null,
      attribution:
        'Bryl Lim (Workout Guide, CC BY-SA 4.0) — derived from Everkinetic, CC BY-SA 4.0',
    });
  });

  it('omits the "derived from" clause when the entry has no upstream source', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const entry = makeEntry('bench-press', 'Bench Press');
    delete entry.attribution.source;
    const [result] = applyWorkoutGuideMedia([bench], [entry]);
    expect(result?.media?.attribution).toBe('Bryl Lim (Workout Guide, CC BY-SA 4.0)');
  });

  it('leaves unmatched exercises without media', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const squat = makeExercise('e-2', 'Squat');
    const result = applyWorkoutGuideMedia(
      [bench, squat],
      [makeEntry('bench-press', 'Bench Press')],
    );
    expect(result.find((e) => e.id === 'e-2')?.media).toBeUndefined();
  });

  describe('real-data integrity (v0.1.4 deep matching pass)', () => {
    // Repo root is three levels up from packages/exercise-library/src.
    const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
    const mediaDir = path.join(repoRoot, 'apps', 'web', 'public', 'exercise-media');

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
      const workoutGuideEntries = JSON.parse(
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
      return { atlasExercises, workoutGuideEntries };
    }

    it('every matched ATLAS exercise id actually exists in the seed data', async () => {
      const { atlasExercises, workoutGuideEntries } = await loadRealData();
      const report = matchWorkoutGuideMedia(atlasExercises, workoutGuideEntries);
      const realIds = new Set(atlasExercises.map((e) => e.id));
      const missing = report.matched.filter((m) => !realIds.has(m.atlasExerciseId));
      expect(missing).toEqual([]);
    });

    it('no two workout-guide entries map to the same ATLAS exercise', async () => {
      const { atlasExercises, workoutGuideEntries } = await loadRealData();
      const report = matchWorkoutGuideMedia(atlasExercises, workoutGuideEntries);
      const seen = new Map<string, string>();
      const conflicts: { atlasExerciseId: string; slugs: string[] }[] = [];
      for (const m of report.matched) {
        const prior = seen.get(m.atlasExerciseId);
        if (prior && prior !== m.workoutGuideSlug) {
          conflicts.push({
            atlasExerciseId: m.atlasExerciseId,
            slugs: [prior, m.workoutGuideSlug],
          });
        }
        seen.set(m.atlasExerciseId, m.workoutGuideSlug);
      }
      expect(conflicts).toEqual([]);
    });

    it('every matched exercise has all its required frame files on disk', async () => {
      const { atlasExercises, workoutGuideEntries } = await loadRealData();
      const report = matchWorkoutGuideMedia(atlasExercises, workoutGuideEntries);
      const entryBySlug = new Map(workoutGuideEntries.map((e) => [e.slug, e]));
      const withMedia = applyWorkoutGuideMedia(atlasExercises, workoutGuideEntries);
      const mediaById = new Map(withMedia.map((e) => [e.id, e.media]));

      const missingFiles: string[] = [];
      for (const m of report.matched) {
        const entry = entryBySlug.get(m.workoutGuideSlug);
        const media = mediaById.get(m.atlasExerciseId);
        if (!entry || !media?.frames) continue;
        expect(media.frames.length).toBe(entry.frames.length); // no missing/extra frame vs. the source manifest
        for (const frame of media.frames) {
          const onDisk = path.join(mediaDir, frame.replace('/exercise-media/', ''));
          if (!existsSync(onDisk)) missingFiles.push(frame);
        }
      }
      expect(missingFiles).toEqual([]);
    });

    it("every seeded exercise's media.frames is non-empty when media is present", async () => {
      const { atlasExercises, workoutGuideEntries } = await loadRealData();
      const withMedia = applyWorkoutGuideMedia(atlasExercises, workoutGuideEntries);
      const malformed = withMedia.filter(
        (e) => e.media && (!e.media.frames || e.media.frames.length === 0),
      );
      expect(malformed.map((e) => e.id)).toEqual([]);
    });
  });
});
