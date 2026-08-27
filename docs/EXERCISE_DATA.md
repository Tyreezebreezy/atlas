# Exercise Data

## Provenance

- **Source**: [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) on GitHub —
  not Kaggle. The dataset was originally sourced from Kaggle per the build handoff, but is mirrored/published
  directly on GitHub with no authentication required, which is what ATLAS actually imports from.
- **Imported**: 2026-08-27, from the `main` branch (`data/exercises.json` + `data/exercises.schema.json`),
  via a `--filter=blob:none` sparse checkout of only the `data/` directory (the `images/`/`videos/`
  directories were never fetched).
- **Commit**: `7455efae41b330c265e7cd4b78dfa848e7ce5ebd` (verified 2026-08-27 by re-fetching this exact
  commit and diffing a fresh transform against `packages/exercise-library/src/data/atlas-exercises.json`
  field-for-field, excluding the randomly-generated `id`/`created_at`/`updated_at` — 1,324 records,
  zero mismatches).
- **Row count**: 1,324 exercises, all imported.
- **License**: dual — MIT for code, dataset structure, and instruction text; exercise media
  (images/GIFs) is © Gym Visual, redistributed under Gym Visual's own terms, **not** MIT.

## What was imported

Per exercise: `id` (as `source_id`), `name`, `body_part` (as `category`), `equipment`, `target` (as
`target_muscle`), `secondary_muscles`, and `instruction_steps.en` (as `instructions`) — English only;
the source also carries the same instructions in es/it/tr/ru/zh/hi/pl/ko/fr, not imported since ATLAS
has no i18n requirement. `muscle_group` was dropped — it overlaps with `target`/`secondary_muscles`
closely enough that keeping a fourth muscle field wasn't worth it.

`measurement_type` isn't in the source at all. The import script
(`scripts/import-exercises.mjs`) uses a one-line heuristic — `body_part === 'cardio'` gets `'time'`,
everything else gets `'reps_weight'` — not a real classifier. Known-imperfect: e.g. planks and other
timed core exercises filed under `waist` still come in as `reps_weight`. Correct these by hand as
they're noticed rather than building a classifier for a few dozen edge cases.

**Excluded, deliberately**: `image`, `gif_url`, `media_id`, `attribution` (all Gym Visual media
fields) and `created_at` (the source's row-creation timestamp — ATLAS stamps its own
`created_at`/`updated_at` at seed time instead). No media file was ever downloaded — the sparse
checkout only pulled `data/`, never `images/` or `videos/`.

## Re-running the import

```bash
git clone --filter=blob:none --sparse --depth 1 https://github.com/hasaneyldrm/exercises-dataset.git <tmp>
cd <tmp> && git sparse-checkout set data
node scripts/import-exercises.mjs <tmp>/data/exercises.json packages/exercise-library/src/data/atlas-exercises.json
```

Re-verify the license at the source repo before re-running — this file documents what was true on
2026-08-27, not a live guarantee.

## Enrichment layer

`Exercise` in `packages/data-model` carries the enrichment fields (movement pattern/family,
push/pull/squat/hinge/carry/rotation flags, bilateral/unilateral, difficulty, known substitutes)
needed for the substitution engine (v0.0.5). The import does not populate these — every imported
exercise has `enrichment: null`. Enrichment gets seeded manually for a representative subset when
the substitution engine is actually built, per the original instruction not to hand-enrich all
~1,300 rows up front.
