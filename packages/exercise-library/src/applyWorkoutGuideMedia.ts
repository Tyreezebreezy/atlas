import type { Exercise, ExerciseMedia } from '@atlas/data-model';
import { matchWorkoutGuideMedia, type WorkoutGuideEntry } from './matchWorkoutGuideMedia';

const MEDIA_BASE_PATH = '/exercise-media';

function mediaForEntry(entry: WorkoutGuideEntry): ExerciseMedia {
  const frames = entry.frames
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((f) => `${MEDIA_BASE_PATH}/${entry.slug}/frame-${f.index}.png`);

  const attributionParts = [`${entry.attribution.creator} (Workout Guide, CC BY-SA 4.0)`];
  if (entry.attribution.source) {
    attributionParts.push(`derived from ${entry.attribution.source.name}, CC BY-SA 4.0`);
  }

  return {
    kind: 'frame-sequence',
    url: frames[0] ?? '',
    frames,
    thumbnail_url: null,
    attribution: attributionParts.join(' — '),
  };
}

/**
 * Applied once at first-seed time, same integration point and same "not a
 * migration for already-seeded installs" limitation as
 * curatedEnrichment.ts's applyCuratedEnrichment -- see ensureExercisesSeeded.ts.
 * A workout-guide entry that's ambiguous or unresolved against the ATLAS
 * library simply leaves those ATLAS exercises with `media: undefined`; a
 * missing animation is an accepted, normal state (docs/EXERCISE_MEDIA.md),
 * never a placeholder or an error.
 */
export function applyWorkoutGuideMedia(
  exercises: Exercise[],
  workoutGuideEntries: WorkoutGuideEntry[],
): Exercise[] {
  const report = matchWorkoutGuideMedia(exercises, workoutGuideEntries);
  const entryBySlug = new Map(workoutGuideEntries.map((e) => [e.slug, e]));
  const mediaByAtlasId = new Map(
    report.matched.map((m) => {
      const entry = entryBySlug.get(m.workoutGuideSlug);
      return [m.atlasExerciseId, entry ? mediaForEntry(entry) : undefined] as const;
    }),
  );

  return exercises.map((exercise) => {
    const media = mediaByAtlasId.get(exercise.id);
    return media ? { ...exercise, media } : exercise;
  });
}
