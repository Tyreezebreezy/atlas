# Exercise Media

## Status: two providers, real media for 326 exercises (v0.1.5, up from 97 in v0.1.4)

326 of the 1,324 seeded exercises now have a real demonstration, sourced
from one of two independent free providers and matched deterministically
against ATLAS's naming. The other 998 have no media, by design — see "The
mapping" below for exactly why.

## Provider model

```
Exercise.media  (one ExerciseMedia, or absent)
  ├── from Workout Guide   (kind: 'frame-sequence', 3 frames) -- preferred
  └── from Free Exercise DB (kind: 'frame-sequence', 2 frames) -- fallback
```

`ExerciseMedia` gained two provenance fields in v0.1.5:
`provider: 'workout-guide' | 'free-exercise-db'` and `provider_source_id`
(that provider's own id/slug for the exercise) — see
`packages/data-model/src/exercise.ts`. Both are optional, same reasoning
as the rest of the interface: nothing derives a required fallback from
their absence.

**This is a single selected record per exercise, not an array of
candidates.** A `Exercise └── ExerciseMedia[]` structure was considered
and rejected: the only thing that would ever read a second, non-displayed
candidate is the coverage-overlap _report_ (below), and that's computed
by running both matchers independently and intersecting their matched-id
sets — a one-off analysis step, not a runtime concern. Storing every
exercise's unused candidate media forever would double the metadata on
every media-bearing row for a capability nothing uses. If a future version
adds user-selectable providers, this is the natural place to widen.

**Priority is a sequencing decision, not a matcher concern.** Neither
matcher knows the other exists. `ensureExercisesSeeded.ts` simply applies
Workout Guide first, then Free Exercise DB — and
`applyFreeExerciseDbMedia` explicitly skips any exercise that already has
`media` set (see its own doc comment). Workout Guide wins whenever both
providers have a valid mapping for the same exercise, because it always
depicts the full motion in three frames and every one of its mappings has
already been through manual review; Free Exercise DB's two-pose photos
fill in real remaining gaps.

**A new provider must reach already-onboarded installs, not just fresh
ones.** `ensureExercisesSeeded` no longer simply no-ops once the store has
data — a device that seeded before v0.1.5 (the owner's real one included)
would otherwise never see Free Exercise DB media at all, since nothing
else ever re-runs this matching pass. `media: undefined` means "never run
through a matcher"; `media: null` means "ran, found nothing" (`null` was
already part of `ExerciseMedia`'s type for exactly this, unused until
now). On every call after the first, only exercises still `undefined` get
matched and written back; everything already resolved — including
pre-v0.1.5 Workout Guide matches, which stay in their original shape
without the `provider` field — is left alone, so a fully-migrated device
does zero matching work on a normal boot. Custom exercises are excluded
from this pass entirely, seed or backfill: they're not part of either
provider's source data, and name-matching one could misfire.

## The mapping

Both matchers share their core string-matching primitives
(`packages/exercise-library/src/mediaMatching.ts` — `normalize`,
`fuzzyKey`, `disambiguateByPredicates`) rather than reimplementing them,
per the explicit "don't build a second independent matching system"
instruction this integration was scoped under. Each provider still owns
its own tier list and explicit table, since their source data shapes
genuinely differ.

### Workout Guide (unchanged since v0.1.4)

97 of 302 source exercises mapped: 46 exact/normalized, 8 fuzzy, 43
hand-reviewed explicit. See v0.1.4's entry in docs/ROADMAP.md for the full
methodology; nothing about it changed this release.

### Free Exercise DB (new, v0.1.5)

`matchFreeExerciseDbMedia.ts` matches Free Exercise DB's 876 entries in
six tiers: exact → normalized → fuzzy (metadata-disambiguated) →
**equipment-superset** → ATLAS alias → explicit table → unresolved.

**Equipment-superset is new, specific to this provider, and safe for a
concrete reason**: Free Exercise DB always carries a clean, independent
`equipment` field, so "Good Morning" (equipment: barbell) matching
ATLAS's "barbell good morning" is confirmed by that field, not guessed
from the name alone — the extra token in ATLAS's name must itself be an
equipment word, _and_ must be the entry's own (normalized) equipment, so
a plain "Barbell" entry can never absorb a more specific implement's
exercise (an EZ-curl-bar variant, found and excluded during manual
review — see the tier's own code comment in
`matchFreeExerciseDbMedia.ts`). Workout Guide's matcher doesn't have this
tier because its own equipment field is looser and its names already
often embed the equipment word themselves.

**Result**: 129 normalized, 88 fuzzy, 46 equipment-superset, 14
hand-reviewed explicit = **277 matched**. 2 ambiguous (genuine ATLAS-side
duplicate-name rows, e.g. two separate seed entries both literally named
"Barbell Seated Calf Raise" — not a Free Exercise DB problem, and not
force-resolved). 597 unresolved (594 no confident match + 3 upstream
entries with zero images at all).

**Manual review, same rigor as Workout Guide's, same honest limits.** Of
the ~275 unresolved entries with a plausible near-candidate (≥60% token
overlap), roughly 50 of the highest-confidence ones were individually
reviewed by hand against the false-match rules below; only 14 were
accepted (the rest excluded for a real equipment mismatch, an added or
changed position/grip qualifier, or a named technique variant Free
Exercise DB and ATLAS both happen to have separate entries for — e.g.
"Kettlebell Turkish Get-Up (Lunge style)" was deliberately **not** mapped
to ATLAS's "(squat style)" entry, and "One-Arm Dumbbell Row" was
deliberately **not** mapped to "dumbbell one arm upright row", a
genuinely different movement despite the name overlap). The remaining
~225 lower-ratio candidates were not individually reviewed — extending
further would mean reviewing candidates this session has decreasing
confidence in, not more real coverage; per the handoff's own instruction,
this was not optimized into a vanity number.

**False-match rules applied** (same list Workout Guide's table already
established, reapplied here): incline/flat, front/back squat,
conventional/sumo, barbell/dumbbell, machine/free-weight,
unilateral/bilateral, seated/standing, neutral/pronated/supinated grip,
chest-supported/unsupported, and named technique variants (split vs.
power jerk/snatch, lunge-style vs. squat-style get-up, etc.) all block a
match unless independently confirmed.

**A real conflict was caught by the integrity test, not shipped.** Free
Exercise DB has both a plain "Flat Bench Leg Pull-In" (auto-matched) and a
"Seated Flat Bench Leg Pull-In" entry; an early explicit-table draft
mapped the seated variant to the same ATLAS exercise the plain one already
claimed, which `applyFreeExerciseDbMedia.test.ts`'s duplicate-mapping
check correctly rejected. Fixed by removing the seated variant from the
table rather than loosening the test.

### Coverage overlap

|                                          | Count                   |
| ---------------------------------------- | ----------------------- |
| Workout Guide only                       | 49                      |
| Free Exercise DB only                    | 229                     |
| Both providers (Workout Guide displayed) | 48                      |
| No media                                 | 998                     |
| **Total with media**                     | **326 / 1,324 (24.6%)** |

## The abstraction (unchanged shape since v0.1.3, two new optional fields)

```ts
type ExerciseMediaKind = 'image' | 'gif' | 'video' | 'frame-sequence';
type ExerciseMediaProvider = 'workout-guide' | 'free-exercise-db';

interface ExerciseMedia {
  kind: ExerciseMediaKind;
  url: string; // representative/first frame; local pack path or remote URL
  frames?: string[]; // frame-sequence only, ordered, frames[0] === url
  thumbnail_url: string | null;
  attribution: string | null;
  provider?: ExerciseMediaProvider;
  provider_source_id?: string;
}
```

Free Exercise DB's 277 populated exercises also use `kind: 'frame-sequence'`
— not a new "two-state" kind — with a **2-element** `frames` array
(`[start, end]`) instead of Workout Guide's 3. `ExerciseMedia.tsx`'s
ping-pong index sequence is generic over frame count (`pingPongIndices`),
so a 2-frame sequence plays as a plain alternation (`start → end → start
→ end`, exactly what a "lightweight two-state demonstration" means — no
interpolation, no invented in-between pose) through the identical
rendering code Workout Guide already uses. This was a real bug found and
fixed during this integration: the loop index table was hardcoded to
Workout Guide's 3-frame case (`[0, 1, 2, 1]`) and would have silently
mis-cycled a 2-frame sequence had it shipped unchanged.

## Rules a future integration must keep

- **No autoplay, ever.** Same as v0.1.3/v0.1.4 — `frame-sequence` checks
  `prefers-reduced-motion: reduce` once on mount and, if set, shows a
  static first frame (the start pose, for Free Exercise DB) instead of
  starting the interval.
- **Lazy, not bundled.** `apps/web/public/exercise-media/**` (both
  `<slug>/` and `fed/<id>/`) stays excluded from the PWA precache glob and
  served through the `CacheFirst` runtime-caching rule instead. **A real
  bug was caught and fixed here too**: that rule's URL pattern only
  matched `.png`, so Free Exercise DB's `.jpg` files would have silently
  never been cached for offline reuse after their first view — found by
  inspecting the built service worker, not assumed from the pattern
  "looking right." See `apps/web/vite.config.ts`.
- **Attribution travels with the media.** Workout Guide's per-exercise
  string is unchanged; Free Exercise DB's is a fixed credit string (no
  attribution is legally required under the Unlicense, but ATLAS gives
  one anyway) — never conflated with Workout Guide's CC BY-SA text. See
  THIRD_PARTY_MEDIA.md.
- **No manual per-exercise work beyond what's mapped.** Extending either
  provider's coverage means extending that provider's own explicit
  mapping table after reviewing genuinely unresolved entries by hand, not
  hand-classifying the remaining ~998 exercises directly.
- **No duplicate provider mappings.** Enforced by
  `applyFreeExerciseDbMedia.test.ts`'s and `applyWorkoutGuideMedia.test.ts`'s
  real-data integrity suites: every matched id must exist, no two source
  entries (within the same provider) may claim one ATLAS exercise, and
  every matched exercise's frame files must actually exist on disk.
- **Provider priority is seed-sequencing, not matcher logic.** Keep it
  that way — don't teach either matcher about the other; a third provider
  should be able to slot in the same way, applied wherever it's the best
  remaining option after the ones before it.
