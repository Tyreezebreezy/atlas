# Third-Party Data Licenses

## hasaneyldrm/exercises-dataset

- **Source**: https://github.com/hasaneyldrm/exercises-dataset
- **Commit**: `7455efae41b330c265e7cd4b78dfa848e7ce5ebd`
- **Imported**: 2026-08-27 (`main` branch, `data/exercises.json` + `data/exercises.schema.json`)
- **License**: dual-licensed —
  - Code, dataset structure, and instruction text: **MIT** (Copyright Hasan Emir Yıldırım)
  - Exercise images and GIFs: **© Gym Visual** (https://gymvisual.com/), redistributed by the
    dataset author under Gym Visual's own terms — not MIT, not open source.
- **What ATLAS imported**: structured text fields only — name, body part, equipment, target/secondary
  muscles, English instructions. See `docs/EXERCISE_DATA.md` for the exact field mapping.
- **What ATLAS excluded**: every media field (`image`, `gif_url`, `media_id`, `attribution`) and the
  underlying image/GIF files themselves. No media file was ever downloaded into this repository or
  anywhere on the machine it was built on — the import used a sparse git checkout of only the `data/`
  directory, which never touched the source repo's `images/`/`videos/` directories.

## vulovix/body-muscles (anatomical SVG path data)

- **Source**: https://github.com/vulovix/body-muscles, via the npm package
  [`body-muscles`](https://www.npmjs.com/package/body-muscles)
- **Pinned to**: `body-muscles@1.0.0`, tarball shasum `4b2890e5794389d33096b0d4cf1177338abebdfe`,
  integrity `sha512-vaYkR9gyaVbqncbA4sGfFuZKwvWiAE6JZYpHR4Stt/jfzYfLPymCE63bba7LEAUi1X8h2wsguP5qYOxmZ2f1ZA==`
- **Imported**: 2026-09-24 (vNext Handoff 03B), via `npm pack` into a scratch directory — never
  installed into the workspace
- **License**: **Apache-2.0**, Copyright 2024 Ivan Vulović. Zero runtime dependencies. The full
  license text and the upstream `NOTICE` ship verbatim with the app at
  `apps/web/public/licenses/body-muscles/` (Apache-2.0 §4: give recipients a copy of the license,
  retain the NOTICE).
- **What ATLAS imported**: each shape's `id`, `name` and SVG path `d` (89 shapes: 40 front, 49 back)
  from `dist/data/muscles.front.js` / `muscles.back.js`, unmodified and in upstream order, into
  `apps/web/src/anatomy/vendoredMuscleShapes.ts` via `scripts/extract-body-muscles.mjs`. That file is
  a transformed form of the upstream source and says so in its header.
- **What ATLAS excluded**: the package's `BodyChart` renderer, its 0–10 slate→yellow→orange→red
  intensity color scale, event handling, and the docs site. `package.json` takes no dependency on it.
  ATLAS's own `BodyMap.tsx` renders the geometry with ATLAS's tokens.
- **How it maps to ATLAS**: `apps/web/src/anatomy/anatomyMapping.ts` (documented allowlist of shared/
  fallback mappings) and `docs/ANATOMY.md`. ATLAS's canonical muscle taxonomy was not changed to fit it.
