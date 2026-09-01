# Exercise Media

## Status: abstraction only (v0.1.2)

No exercise in the seeded library has media populated. This version adds the
data shape and a display component that render correctly with **zero**
media present, so a real media pack can be dropped in later without another
schema or UI change.

## Why nothing is populated yet

The imported dataset (see docs/EXERCISE_DATA.md) is dual-licensed: MIT for
the structured text (name, category, muscles, instructions), but its own
images/GIFs are © Gym Visual under Gym Visual's own terms — not MIT, and
not something ATLAS has redistribution rights to. The import sparse-checkout
never even fetched the source repo's `images/`/`videos/` directories. Any
real exercise media needs a separately sourced and separately licensed (or
self-produced) pack; that sourcing work is out of scope for this stage.

## The abstraction

```ts
type ExerciseMediaKind = 'image' | 'gif' | 'video';

interface ExerciseMedia {
  kind: ExerciseMediaKind;
  url: string; // path into a local pack, or a remote URL
  thumbnail_url: string | null;
  attribution: string | null;
}
```

`Exercise.media?: ExerciseMedia | null` (`packages/data-model/src/exercise.ts`).
Optional, not required-plus-null like most other whole-document additions in
this codebase (`Program.progression_mode`, `WorkoutTemplate.groups`, etc.) —
those have a real fallback derived from their absence (accessor functions
like `programProgressionMode()`); `media` doesn't, its one read site is a
plain `exercise.media?.url`-shaped guard, so forcing every existing
`Exercise` object literal across the codebase (test fixtures included) to
spell out `media: null` would be ripple with no payoff. See
docs/DATA_MODEL.md.

`apps/web/src/library/ExerciseMedia.tsx` renders `null` when `exercise.media`
is absent (every exercise today); otherwise an `<img>` (image/gif) or a
`<video>` (video), wired into `ExerciseDetail`'s Details tab, above the
written instructions.

## Rules a future integration must keep

- **No autoplay, ever.** `<video>` gets `controls` and `preload="none"` —
  never `autoPlay`, never a `muted`+`loop` background-video trick. The user
  presses play. This is a firm rule, not a default that's convenient to
  relax later: unexpected motion is a real accessibility concern, and
  autoplaying video is a real data-usage concern on a fitness app people
  open mid-workout on cellular.
- **Lazy, not bundled.** `packages/exercise-library`'s seed data is already
  a ~1.4MB dedicated lazy chunk (see docs/MOBILE.md's bundle-splitting
  note) that must not grow by embedding media inline. A real pack is
  either a **local pack** — a separate lazy-loaded asset directory/bundle
  the exercise-library package (or a new sibling package) ships and maps
  `exercise_id`/name to file, loaded via dynamic `import()` or fetched from
  `public/` — or a **remote pack** — `ExerciseMedia.url` is a plain
  `https://` URL, fetched only when the Details tab for that specific
  exercise actually renders, same `loading="lazy"` behavior a normal `<img>`
  already gives for free. Nothing native to the ExerciseMedia component
  itself downloads more than one exercise's media at a time.
- **Attribution travels with the media, not as a separate lookup.** Any
  pack that isn't self-produced needs a real license check before it ships
  (same diligence as docs/EXERCISE_DATA.md's provenance section) and its
  attribution string populated per exercise, not asserted once globally —
  a pack can plausibly mix sources.
- **Captions.** The `<video>` element currently has a scoped
  `eslint-disable` for `jsx-a11y/media-has-caption` — there's no real pack
  to source a `<track>` from yet. A real video pack must ship a caption
  track per file and that disable comment must come out, not stay
  permanently.
- **No manual per-exercise work now.** Populating `media` for any of the
  1,324 seeded exercises — by hand or by scripted download — was
  deliberately not done this version, matching the same "don't
  hand-classify the whole library" instruction curated enrichment and
  movement-family classification already follow (docs/EXERCISE_DATA.md,
  docs/DATA_MODEL.md).
