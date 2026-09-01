# Exercise Media

## Status: real media for 64 exercises (v0.1.3)

64 of the 1,324 seeded exercises now have a real demonstration animation,
sourced from Workout Guide (CC BY-SA 4.0, see THIRD_PARTY_MEDIA.md) and
matched deterministically against ATLAS's naming
(`packages/exercise-library/src/matchWorkoutGuideMedia.ts`). The other
1,260 have no media, by design — see "The mapping" below for exactly why,
and "Rules a future integration must keep" for what's still true from
v0.1.2's abstraction-only version.

## The mapping

`matchWorkoutGuideMedia.ts` matches Workout Guide's 302 exercises against
ATLAS's 1,324 in five deterministic tiers — exact name, normalized name,
ATLAS alias, an explicit hand-reviewed table, then unresolved — and never
auto-resolves an ambiguous match (a name matching more than one ATLAS
exercise at the same tier). Applied once at first-seed time via
`applyWorkoutGuideMedia.ts`, same integration point and same "not a
migration for already-seeded installs" limitation as
`curatedEnrichment.ts`.

**Result**: 46 matched automatically (name/alias), 18 more added to the
explicit table after reviewing the automated pass's unresolved list by
hand (12 equipment-corroborated near-matches like "Straight-Arm Pulldown"
→ "cable straight arm pulldown", plus 6 canonical-default picks for common
unqualified lift names like plain "Squat" or "Bench Press" that otherwise
matched dozens of ATLAS equipment variants — the same kind of judgment
call `curatedEnrichment.ts` already makes for its own ~33 entries). 0
ambiguous matches were force-resolved. 238 Workout Guide exercises stayed
unresolved — genuinely no confident ATLAS counterpart, not a matching
failure — and were **not shipped**: only the 64 matched exercises' PNGs
(192 files, ~6.4MB) are in `apps/web/public/exercise-media/`, pruned from
the original 906 (302×3) so the other 238 exercises' media doesn't inflate
every install (particularly the Windows installer, which bundles
`apps/web/dist` in full regardless of what's referenced) for files nothing
ever links to. All 906 remain re-fetchable from the pinned upstream commit
if a future explicit-mapping addition resolves more of them.

**No manual per-exercise classification was done to make this work** — the
64 matches all come from name-based matching plus a hand-reviewed table of
64 entries, not a hand classification of the full 1,324-exercise library.
That distinction matters: this stays consistent with the same "don't
hand-enrich the whole library" instruction curated enrichment and
movement-family classification already follow (docs/EXERCISE_DATA.md).

## The abstraction (unchanged shape from v0.1.2, one new kind)

```ts
type ExerciseMediaKind = 'image' | 'gif' | 'video' | 'frame-sequence';

interface ExerciseMedia {
  kind: ExerciseMediaKind;
  url: string; // representative/first frame; local pack path or remote URL
  frames?: string[]; // frame-sequence only, ordered, frames[0] === url
  thumbnail_url: string | null;
  attribution: string | null;
}
```

Every one of the 64 populated exercises uses `kind: 'frame-sequence'` —
Workout Guide provides 3 static frames per exercise, not a video or a
single image, so v0.1.3 added this kind rather than force-fitting frames
into `'image'`. `Exercise.media?: ExerciseMedia | null`
(`packages/data-model/src/exercise.ts`) — still optional, not
required-plus-null like most other whole-document additions in this
codebase (`Program.progression_mode`, `WorkoutTemplate.groups`), for the
same reason as v0.1.2: nothing derives a fallback from its absence, so
forcing every `Exercise` test fixture in the codebase to spell out
`media: null` would be ripple with no payoff.

`apps/web/src/library/ExerciseMedia.tsx` renders `null` when
`exercise.media` is absent (still true for 1,260 of 1,324 exercises);
otherwise an `<img>` (image/gif), a `<video>` (video), or — new this
version — a small looping `1 → 2 → 3 → 2` animation over the three frames
(`frame-sequence`), JS-`setInterval`-driven rather than this codebase's
usual CSS-keyframe approach, since swapping between three independent
image sources doesn't fit a single-property CSS animation cleanly. Wired
into `ExerciseDetail`'s Details tab (full size, tap nothing) and, new this
version, `ExerciseLogger` in Gym Mode (`compact` prop — small, tap to
expand, never blocking the logging UI below it).

## Rules a future integration must keep

- **No autoplay, ever.** `<video>` gets `controls` and `preload="none"` —
  never `autoPlay`, never a `muted`+`loop` background-video trick.
  `frame-sequence` checks `prefers-reduced-motion: reduce` once on mount
  and, if set, never starts the interval — the first frame just sits
  static. Verified this version via direct DOM attribute inspection
  (`autoplay: false`, `preload: "none"`), not just a screenshot.
- **Lazy, not bundled — verified this version, not just designed.**
  `apps/web/public/exercise-media/**` is explicitly excluded from the PWA
  precache glob (`globIgnores` in `apps/web/vite.config.ts`) and instead
  served through a `CacheFirst` `runtimeCaching` rule — nothing downloads
  until a specific exercise's Detail screen or Gym Mode card actually
  renders it, and after that first view it's cached for offline reuse.
  Confirmed by inspecting the built service worker: precache size was
  unchanged (2255.15 KiB) after adding 6.4MB of media, and `sw.js`
  contains the `exercise-media` runtime-caching pattern exactly once, not
  906 (or 192) individual precache entries.
- **Attribution travels with the media, not as a separate lookup.** Each
  of the 64 populated exercises carries its own attribution string
  (creator + license, plus the specific upstream source when the frame is
  an Everkinetic derivative) built directly from Workout Guide's own
  per-frame manifest data, not asserted once globally.
- **Captions.** The `<video>` element (unused by any of today's 64
  frame-sequence exercises, but still reachable via the `kind` union) has
  a scoped `eslint-disable` for `jsx-a11y/media-has-caption` — there's no
  real video pack yet. A real video pack must ship a caption track per
  file and that disable comment must come out, not stay permanently.
- **No manual per-exercise work beyond the 64.** Extending coverage means
  extending `EXPLICIT_MEDIA_MAPPING` after reviewing genuinely unresolved
  entries by hand (or sourcing a different/larger media pack), not
  hand-classifying the remaining 1,260 exercises directly.
