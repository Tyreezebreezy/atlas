# Exercise Media

## Status: real media for 97 exercises (v0.1.4, up from 64 in v0.1.3)

97 of the 1,324 seeded exercises now have a real demonstration animation,
sourced from Workout Guide (CC BY-SA 4.0, see THIRD_PARTY_MEDIA.md) and
matched deterministically against ATLAS's naming
(`packages/exercise-library/src/matchWorkoutGuideMedia.ts`). The other
1,227 have no media, by design — see "The mapping" below for exactly why,
and "Rules a future integration must keep" for what's still true from
v0.1.2's abstraction-only version.

## The mapping

`matchWorkoutGuideMedia.ts` matches Workout Guide's 302 exercises against
ATLAS's 1,324 in six deterministic tiers — exact name, normalized name,
**fuzzy name (v0.1.4: order/plural/compound-word/equipment-shorthand-
insensitive)**, ATLAS alias, an explicit hand-reviewed table, then
unresolved — disambiguating a fuzzy-tier ambiguity by workout-guide
equipment/muscle metadata when that alone narrows it to exactly one
candidate, and never otherwise auto-resolving an ambiguous match (a name
matching more than one ATLAS exercise at the same tier). Applied once at
first-seed time via `applyWorkoutGuideMedia.ts`, same integration point
and same "not a migration for already-seeded installs" limitation as
`curatedEnrichment.ts`.

**Result (v0.1.4)**: 46 exact/normalized-tier matches (unchanged from
v0.1.3) + 8 new automated `fuzzy`-tier matches (word-order/plural/
compound-word/DB-BB-KB-shorthand differences — e.g. ATLAS's "World Greatest
Stretch" vs the source's "World's Greatest Stretch") + 43 explicit-table
entries (the original 18 plus 25 more, hand-reviewed one at a time against
the real post-fuzzy unresolved list — see the matcher's own doc comment
for the full reasoning per entry). 0 ambiguous matches were force-resolved
(the new equipment/muscle disambiguation tier exists and is tested, but
didn't need to fire against this real dataset — every fuzzy-tier match
happened to already be unique). 205 Workout Guide exercises stayed
unresolved — genuinely no confident ATLAS counterpart, or a real
equipment/movement mismatch deliberately left unmatched (e.g. "Pistol
Squat" (Bodyweight) only candidating against "kettlebell pistol squat" —
a different exercise, not a naming variant) — and were **not shipped**:
only the 97 matched exercises' PNGs (291 files, ~9.3MB) are in
`apps/web/public/exercise-media/`, pruned from the original 906 (302×3) so
the other 205 exercises' media doesn't inflate every install (particularly
the Windows installer, which bundles `apps/web/dist` in full regardless of
what's referenced) for files nothing ever links to. All 906 remain
re-fetchable from the pinned upstream commit if a future explicit-mapping
addition resolves more of them.

**Manual review methodology (v0.1.4).** After the fuzzy tier ran, every
workout-guide entry with a plausible near-candidate (≥60% token overlap
with some ATLAS exercise, ~97 candidates) was reviewed by hand against the
same false-match rules the original 18-entry table already established —
equipment must match (an equipment-field mismatch like "Bodyweight" vs a
"kettlebell"/"band"/"machine" candidate was rejected even at high token
overlap, since the shown animation would depict the wrong apparatus), and
a real qualifier difference (upright vs bent-over row, neutral vs reverse
grip, sumo vs conventional, landmine vs standard, decline vs flat, Bulgarian
vs plain split squat, etc.) blocks a match even when the equipment agrees.
26 were accepted this way; ~70 were rejected for a genuine equipment or
movement mismatch the ratio alone couldn't distinguish. Workout-guide
entries with no candidate above that threshold (~134) were not
individually reviewed — extending coverage further would mean visually
inspecting animation frames this session cannot see, not more name
matching.

**No manual per-exercise classification was done to make this work** — the
97 matches all come from name-based matching plus a hand-reviewed table of
43 entries, not a hand classification of the full 1,324-exercise library.
That distinction matters: this stays consistent with the same "don't
hand-enrich the whole library" instruction curated enrichment and
movement-family classification already follow (docs/EXERCISE_DATA.md).

## The abstraction (unchanged shape since v0.1.3)

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

Every one of the 97 populated exercises uses `kind: 'frame-sequence'` —
Workout Guide provides 3 static frames per exercise, not a video or a
single image. `Exercise.media?: ExerciseMedia | null`
(`packages/data-model/src/exercise.ts`) — still optional, not
required-plus-null like most other whole-document additions in this
codebase (`Program.progression_mode`, `WorkoutTemplate.groups`), for the
same reason as v0.1.2: nothing derives a fallback from its absence, so
forcing every `Exercise` test fixture in the codebase to spell out
`media: null` would be ripple with no payoff.

`apps/web/src/library/ExerciseMedia.tsx` renders `null` when
`exercise.media` is absent (still true for 1,227 of 1,324 exercises);
otherwise an `<img>` (image/gif), a `<video>` (video), or a small looping
`1 → 2 → 3 → 2` animation over the three frames (`frame-sequence`),
JS-`setInterval`-driven rather than this codebase's usual CSS-keyframe
approach, since swapping between three independent image sources doesn't
fit a single-property CSS animation cleanly. Wired into `ExerciseDetail`'s
Details tab (full size, tap nothing) and `ExerciseLogger` in Gym Mode
(`compact` prop — small, tap to expand, never blocking the logging UI
below it). v0.1.4 also surfaces which Library list rows have a
demonstration (a small accent-colored dot badge next to the name, plus
"has a demonstration" appended to the row's own accessible name) — see
"Library discoverability" below.

## Library discoverability (v0.1.4)

The owner had previously had to ask where the exercise how-to library
even was. Fixed without adding a second, competing "How-To Library"
screen — the existing Library tab is already the canonical exercise
reference surface, so the fix is entirely about making that clearer where
it already lives: a one-line subtitle under the Library heading
("Browse every exercise, with a how-to demonstration wherever one
exists.") plus the demonstration-badge dot described above.

## Rules a future integration must keep

- **No autoplay, ever.** `<video>` gets `controls` and `preload="none"` —
  never `autoPlay`, never a `muted`+`loop` background-video trick.
  `frame-sequence` checks `prefers-reduced-motion: reduce` once on mount
  and, if set, never starts the interval — the first frame just sits
  static. Verified via direct DOM attribute inspection (`autoplay: false`,
  `preload: "none"`), not just a screenshot.
- **Lazy, not bundled — verified, not just designed.**
  `apps/web/public/exercise-media/**` is explicitly excluded from the PWA
  precache glob (`globIgnores` in `apps/web/vite.config.ts`) and instead
  served through a `CacheFirst` `runtimeCaching` rule — nothing downloads
  until a specific exercise's Detail screen or Gym Mode card actually
  renders it, and after that first view it's cached for offline reuse.
  Confirmed by inspecting the built service worker: precache size stayed
  effectively flat (2255.15 → 2266.98 KiB, all from new application code,
  not media) after adding another ~2.9MB of media on top of v0.1.3's
  6.4MB, and `sw.js` contains the `exercise-media` runtime-caching pattern
  exactly once, not one entry per file.
- **Attribution travels with the media, not as a separate lookup.** Each
  of the 97 populated exercises carries its own attribution string
  (creator + license, plus the specific upstream source when the frame is
  an Everkinetic derivative) built directly from Workout Guide's own
  per-frame manifest data, not asserted once globally.
- **Captions.** The `<video>` element (unused by any of today's 97
  frame-sequence exercises, but still reachable via the `kind` union) has
  a scoped `eslint-disable` for `jsx-a11y/media-has-caption` — there's no
  real video pack yet. A real video pack must ship a caption track per
  file and that disable comment must come out, not stay permanently.
- **No manual per-exercise work beyond the 97.** Extending coverage means
  extending `EXPLICIT_MEDIA_MAPPING` after reviewing genuinely unresolved
  entries by hand (or sourcing a different/larger media pack), not
  hand-classifying the remaining 1,227 exercises directly.
- **No two workout-guide entries may ever map to the same ATLAS exercise.**
  Enforced by an automated integrity test
  (`applyWorkoutGuideMedia.test.ts`) against the real seed + manifest data,
  alongside checks that every matched id actually exists and every
  matched exercise's frame files actually exist on disk — this caught a
  real conflict during v0.1.4 development (`smith-machine-split-squat`
  and `smith-machine-bulgarian-split-squat` both fuzzy-candidating the
  same ATLAS exercise) before it shipped.
