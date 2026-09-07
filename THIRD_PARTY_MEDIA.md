# Third-Party Media

ATLAS's own application source (this repository, excluding the paths
listed below) is licensed separately — see the repository's own license.
**This file covers exercise demonstration media only.** Media licensing is
kept deliberately separate from application-code licensing, per the same
split the upstream project itself uses.

## Exercise animation frames (Workout Guide)

- **Source**: [bryllim/workout-guide](https://github.com/bryllim/workout-guide)
- **Pinned to**: tag `v1.0.0`, commit `acc2492b672f9eafc6ea4885da90ef4508c00cd2`
- **Retrieved**: 2026-09-01, via a `--filter=blob:none --sparse` clone scoped
  to `packages/workout-guide` only (their `apps/site` Astro website,
  `.github` workflows, and the package's own `src`/`test`/build tooling
  were never fetched — only the exercise artwork, its manifest, and its
  license/attribution files).
- **License**: exercise artwork is **CC BY-SA 4.0**, copyright Bryl Lim
  except where the manifest identifies an upstream source (see below). The
  upstream repository's own _code_ is MIT-licensed but was not imported —
  irrelevant here since no code was taken, only static image assets and a
  JSON manifest.
- **Attribution**:
  - Exercise frames created and curated by **Bryl Lim** ([bryllim.com](https://bryllim.com)).
  - 76 of the 302 exercises' first-pose frames are rasterized adaptations
    of artwork from **[Everkinetic](https://github.com/everkinetic/data)**
    (also CC BY-SA 4.0) — placed on a transparent 512×512 canvas, recolored
    for monochrome display, exported as PNG. The exact per-frame source
    SVG URL is preserved for each such frame in
    `packages/exercise-library/src/data/workoutGuideManifest.json`
    (`frames[].attribution.source.url`).
- **What was imported**: `packages/workout-guide/manifest.json`
  (verbatim, renamed) into
  `packages/exercise-library/src/data/workoutGuideManifest.json` — all 302
  entries, so it stays available for future deterministic matching. Of
  `packages/workout-guide/assets/**` (906 PNG files — 302 exercises × 3
  frames each, ~32MB raw), only the exercises that actually matched an
  ATLAS exercise (`packages/exercise-library/src/matchWorkoutGuideMedia.ts`,
  see docs/EXERCISE_MEDIA.md's mapping report) were kept, at
  `apps/web/public/exercise-media/<slug>/frame-{1,2,3}.png` — 64 exercises
  (192 files, ~6.4MB) as of v0.1.3, deepened to 97 exercises (291 files,
  ~9.3MB) in v0.1.4 as the matching pass covered more of the source set —
  the remaining 205 exercises' frames are never referenced by any ATLAS
  URL, so shipping them would only inflate the app's download/install size
  for nothing. All 906 remain retrievable by re-running the sparse clone
  above against the same pinned commit if a future explicit-mapping
  addition resolves more of them.
- **What was deliberately not imported**: the upstream package's own
  source code, tests, build config, and website — ATLAS only ever needed
  the media and its metadata, not the tooling that produces or displays it
  upstream. See docs/EXERCISE_MEDIA.md for how ATLAS maps and renders it.

## Exercise start/end pose photos (Free Exercise DB) — v0.1.5

**This provider's license is different from Workout Guide's above — public
domain, not CC BY-SA — and the two must not be conflated.** No attribution
is legally required for this one; ATLAS credits it anyway, in each
exercise's own `attribution` string, as a courtesy.

- **Source**: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)
- **Pinned to**: commit `a859101d633a01c4a1a920d6a8ce41dabba0705f` (no git tag
  exists upstream as of this writing, so a commit SHA is the stable
  reference instead)
- **Retrieved**: 2026-09-06, via a full `git clone` (this repository has no
  large unrelated subdirectories the way `workout-guide`'s monorepo did, so
  a sparse checkout wasn't needed to keep the fetch reasonable)
- **License**: **Unlicense** (public domain dedication) —
  `LICENSE.md` in the upstream repository, confirmed directly, not assumed
  from the README.
- **Source exercise count**: 876 total upstream entries; 873 carry exactly
  two images (`0.jpg` start pose, `1.jpg` end pose), 3 carry zero (see
  docs/EXERCISE_MEDIA.md) and are simply excluded, not a bug.
- **What was imported**: the upstream `dist/exercises.json` (a
  pre-consolidated array of every entry's structured data — name,
  equipment, muscles, instructions, image paths) verbatim into
  `packages/exercise-library/src/data/freeExerciseDbManifest.json`, all 876
  entries, for the same "stays available for future matching" reason as
  Workout Guide's own full manifest. Of the upstream `exercises/<id>/{0,1}.jpg`
  image files (1,746 across 873 usable entries), only the 277 exercises
  that actually matched an ATLAS exercise
  (`packages/exercise-library/src/matchFreeExerciseDbMedia.ts`, see
  docs/EXERCISE_MEDIA.md's mapping report) were kept, at
  `apps/web/public/exercise-media/fed/<id>/{0,1}.jpg` (554 files, ~33MB) —
  namespaced under `fed/` specifically to keep this provider's files
  unambiguously separate from Workout Guide's, both in the URL and in this
  document. The rest remain retrievable by re-cloning the pinned commit
  above if a future explicit-mapping addition resolves more of them.
- **Modifications**: none — the 554 shipped files are byte-identical
  copies of the pinned commit's own JPEGs, not resized, recompressed, or
  re-encoded.

## Full license text

- CC BY-SA 4.0 legal code: <https://creativecommons.org/licenses/by-sa/4.0/legalcode>
- CC BY-SA 4.0 human-readable summary: <https://creativecommons.org/licenses/by-sa/4.0/>
- Unlicense: <https://unlicense.org>

Under CC BY-SA 4.0, any adaptation ATLAS makes to the Workout Guide image
files specifically (resizing, recompression, format conversion) must
itself remain available under CC BY-SA 4.0 with the same attribution
preserved — this applies only to `apps/web/public/exercise-media/<slug>/`
(Workout Guide), not to ATLAS's own application source, and not to the
separately-licensed `apps/web/public/exercise-media/fed/` (Free Exercise
DB, public domain, no such requirement).
