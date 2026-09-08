import { useEffect, useRef, useState } from 'react';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, ExerciseMedia as ExerciseMediaData } from '@atlas/data-model';

interface ExerciseMediaProps {
  exercise: Exercise;
  /** Gym Mode wants a smaller, tap-to-expand demonstration rather than the
   * full-width Exercise Detail treatment -- same data, same component,
   * just a size hint. */
  compact?: boolean;
}

const FRAME_STEP_MS = 350;

/** A ping-pong index sequence over `length` frames without storing repeated
 * frames twice in data -- generic over frame count, not hardcoded to
 * Workout Guide's 3 (1 -> 2 -> 3 -> 2, repeating). Free Exercise DB's
 * start/end pairs have only 2 frames, which have no middle to bounce off
 * of: for length 2 this is just a plain alternation (0 -> 1, repeating),
 * the literal "start -> end -> start -> end" v0.1.5 asks for -- not
 * interpolated, not a fake animation, exactly the two real poses. */
function pingPongIndices(length: number): number[] {
  if (length <= 2) return Array.from({ length }, (_, i) => i);
  const forward = Array.from({ length }, (_, i) => i);
  const backward = forward.slice(1, -1).reverse();
  return [...forward, ...backward];
}

/** JS-driven index cycling rather than this codebase's usual CSS-keyframe
 * approach (see .atlas-milestone-reveal in App.css) -- that pattern
 * animates one CSS property, this swaps between three independent image
 * sources, which is simpler as a plain interval than as opacity-stacked
 * <img> layers. `prefers-reduced-motion: reduce` is checked once on mount
 * (a live-updating listener is unnecessary complexity for a preference
 * that essentially never changes mid-session) and simply skips starting
 * the interval, leaving the static first frame showing. */
function useFrameSequence(frames: string[] | undefined): { index: number; animated: boolean } {
  const [index, setIndex] = useState(0);
  const animated = useRef(
    frames != null &&
      frames.length > 1 &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current;

  useEffect(() => {
    if (!animated || !frames) return;
    const loopIndices = pingPongIndices(frames.length);
    let step = 0;
    const interval = setInterval(() => {
      step = (step + 1) % loopIndices.length;
      setIndex(loopIndices[step] ?? 0);
    }, FRAME_STEP_MS);
    return () => clearInterval(interval);
  }, [animated, frames]);

  return { index, animated };
}

function FrameSequence({ media, alt }: { media: ExerciseMediaData; alt: string }) {
  const { index } = useFrameSequence(media.frames);
  const src = media.frames?.[index] ?? media.url;
  return <img src={src} alt={alt} loading="lazy" />;
}

/** Renders nothing when no media pack has populated this exercise -- true
 * for most exercises even after the Workout Guide import (v0.1.3), see
 * docs/EXERCISE_MEDIA.md. Never autoplays: video gets explicit `controls`
 * and `preload="none"` (no `autoPlay`, no `muted`+`loop` trick);
 * image/gif gets `loading="lazy"`; frame-sequence respects reduced motion. */
function MediaContent({ media, alt }: { media: ExerciseMediaData; alt: string }) {
  if (media.kind === 'video') {
    return (
      // No caption track yet -- there's no real pack to source one from
      // (see docs/EXERCISE_MEDIA.md). A future pack must ship a <track>
      // alongside its video, not silence this rule permanently.
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={media.url} controls preload="none" poster={media.thumbnail_url ?? undefined} />
    );
  }
  if (media.kind === 'frame-sequence') {
    return <FrameSequence media={media} alt={alt} />;
  }
  return <img src={media.url} alt={alt} loading="lazy" />;
}

export function ExerciseMedia({ exercise, compact }: ExerciseMediaProps) {
  const [expanded, setExpanded] = useState(false);
  const media = exercise.media;
  if (!media) return null;

  const alt = `${formatExerciseName(exercise.name)} demonstration`;
  const className = [
    'atlas-exercise-media',
    compact && 'atlas-exercise-media--compact',
    compact && expanded && 'atlas-exercise-media--expanded',
  ]
    .filter(Boolean)
    .join(' ');

  // Video already has its own interactive controls -- nesting those inside
  // a clickable wrapper would double up on click handling and isn't valid
  // nested-interactive markup. Only image/frame-sequence, which have no
  // inherent interactivity, get the tap-to-expand button.
  const expandable = compact && media.kind !== 'video';

  return (
    <figure className={className}>
      {expandable ? (
        <button
          type="button"
          className="atlas-exercise-media__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <MediaContent media={media} alt={alt} />
        </button>
      ) : (
        <MediaContent media={media} alt={alt} />
      )}
      {media.attribution && (
        <figcaption className="atlas-exercise-media__attribution">{media.attribution}</figcaption>
      )}
    </figure>
  );
}
