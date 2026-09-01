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
  frames each, ~32MB raw), only the 64 exercises that actually matched an
  ATLAS exercise (`packages/exercise-library/src/matchWorkoutGuideMedia.ts`,
  see docs/EXERCISE_MEDIA.md's mapping report) were kept, at
  `apps/web/public/exercise-media/<slug>/frame-{1,2,3}.png` (192 files,
  ~6.4MB) — the other 238 exercises' frames are never referenced by any
  ATLAS URL, so shipping them would only inflate the app's download/install
  size for nothing. All 906 remain retrievable by re-running the sparse
  clone above against the same pinned commit if a future explicit-mapping
  addition resolves more of them.
- **What was deliberately not imported**: the upstream package's own
  source code, tests, build config, and website — ATLAS only ever needed
  the media and its metadata, not the tooling that produces or displays it
  upstream. See docs/EXERCISE_MEDIA.md for how ATLAS maps and renders it.

## Full license text

- CC BY-SA 4.0 legal code: <https://creativecommons.org/licenses/by-sa/4.0/legalcode>
- CC BY-SA 4.0 human-readable summary: <https://creativecommons.org/licenses/by-sa/4.0/>

Under CC BY-SA 4.0, any adaptation ATLAS makes to these specific image
files (resizing, recompression, format conversion) must itself remain
available under CC BY-SA 4.0 with the same attribution preserved — this
applies only to the imported media files under `apps/web/public/exercise-media/`,
not to ATLAS's own application source.
