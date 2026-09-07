import type { Exercise, ExerciseMedia } from '@atlas/data-model';
import { matchFreeExerciseDbMedia, type FreeExerciseDbEntry } from './matchFreeExerciseDbMedia';

const MEDIA_BASE_PATH = '/exercise-media/fed';

function mediaForEntry(entry: FreeExerciseDbEntry): ExerciseMedia {
  // Upstream's own images[] is already ordered [start, end] (indices 0, 1);
  // shipped alongside the id-namespaced local copy, not the upstream path,
  // since only the matched subset is packaged (see docs/EXERCISE_MEDIA.md).
  const frames = entry.images.map((_, i) => `${MEDIA_BASE_PATH}/${entry.id}/${i}.jpg`);

  return {
    kind: 'frame-sequence',
    url: frames[0] ?? '',
    frames,
    thumbnail_url: null,
    attribution: 'Free Exercise DB (public domain / Unlicense)',
    provider: 'free-exercise-db',
    provider_source_id: entry.id,
  };
}

/**
 * Applied once at first-seed time, same integration point and same "not a
 * migration for already-seeded installs" limitation as
 * `applyWorkoutGuideMedia`/`applyCuratedEnrichment` -- see
 * `ensureExercisesSeeded.ts`. Always applied AFTER Workout Guide, and only
 * to exercises that still have no `media` -- Workout Guide is the
 * preferred provider wherever it already has a valid mapping (more
 * complete three-frame motion depiction, already manually reviewed), and
 * this function never overwrites an existing assignment. This priority
 * lives here, at the seed-sequencing call site, not inside either
 * matcher -- the two matchers are independent and neither needs to know
 * the other exists.
 */
export function applyFreeExerciseDbMedia(
  exercises: Exercise[],
  entries: FreeExerciseDbEntry[],
): Exercise[] {
  const report = matchFreeExerciseDbMedia(exercises, entries);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const mediaByAtlasId = new Map(
    report.matched.map((m) => {
      const entry = entryById.get(m.freeExerciseDbId);
      return [m.atlasExerciseId, entry ? mediaForEntry(entry) : undefined] as const;
    }),
  );

  return exercises.map((exercise) => {
    if (exercise.media) return exercise; // Workout Guide already claimed this one.
    const media = mediaByAtlasId.get(exercise.id);
    return media ? { ...exercise, media } : exercise;
  });
}
