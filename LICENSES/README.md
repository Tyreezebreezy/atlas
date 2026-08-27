# Third-Party Data Licenses

## hasaneyldrm/exercises-dataset

- **Source**: https://github.com/hasaneyldrm/exercises-dataset
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
