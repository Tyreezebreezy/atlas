import type { Exercise } from '@atlas/data-model';

interface ExerciseMediaProps {
  exercise: Exercise;
}

/** Renders nothing when no media pack has populated this exercise -- true
 * for every exercise today, see docs/EXERCISE_MEDIA.md. Never autoplays:
 * video gets explicit `controls` and `preload="none"` (no `autoPlay`, no
 * `muted`+`loop` trick); image/gif gets `loading="lazy"`. */
export function ExerciseMedia({ exercise }: ExerciseMediaProps) {
  const media = exercise.media;
  if (!media) return null;

  return (
    <figure className="atlas-exercise-media">
      {media.kind === 'video' ? (
        // No caption track yet -- there's no real pack to source one from
        // (see docs/EXERCISE_MEDIA.md). A future pack must ship a <track>
        // alongside its video, not silence this rule permanently.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={media.url} controls preload="none" poster={media.thumbnail_url ?? undefined} />
      ) : (
        <img src={media.url} alt={`${exercise.name} demonstration`} loading="lazy" />
      )}
      {media.attribution && (
        <figcaption className="atlas-exercise-media__attribution">{media.attribution}</figcaption>
      )}
    </figure>
  );
}
