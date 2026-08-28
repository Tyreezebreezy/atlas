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
needed for the substitution engine. The import script does not populate these — every freshly
imported exercise still has `enrichment: null` and `movement_pattern: null`.

As of v0.0.5, `packages/exercise-library/src/curatedEnrichment.ts` hand-curates ~33 common
exercises (name-matched, case-insensitive, against this file's `name` field) and applies them at
first-seed time via `ensureExercisesSeeded`, per the original instruction not to hand-enrich all
~1,300 rows up front. The remaining ~1,290 rows are intentionally left `enrichment: null` — the
substitution engine still scores them using the raw imported fields alone (`target_muscle`,
`movement_pattern` when present, `secondary_muscles`, `equipment`), just without the curated
signals. See docs/SUBSTITUTIONS.md.

Curated enrichment is name-matched at seed time, not a migration — an install that was already
seeded before v0.0.5 will not retroactively pick up enrichment for those 33 exercises. There are
no real users of this app yet, so this is an accepted limitation rather than something worth a
migration path.

## Bodyweight measurement_type correction (v0.0.6)

The import heuristic above only ever produces `'reps_weight'` or `'time'` — it never produces
`'reps_bodyweight'`, so true bodyweight-rep movements (push-up, pull-up, chin-up, dip, inverted
row) were imported as `'reps_weight'` even though nothing meaningful is ever entered in their
weight field. Combined with `CustomExerciseForm` previously hardcoding `measurementType:
'reps_weight'` too, this meant `reps_bodyweight` had a real data model and a real PR kind
(`packages/pr-engine`'s `bodyweight` kind) but **no reachable path to it anywhere in the UI** —
found during v0.0.6 runtime testing, fixed the same version. See docs/PRS.md "Bodyweight exercise
path" for the full writeup and docs/DATA_MODEL.md for the corrected exercise list.

`curatedEnrichment.ts`'s existing name-matched table now also carries an optional
`measurement_type_override`, applied at the same first-seed injection point as the rest of curated
enrichment — deliberately reusing that one mechanism (and its "matched by name, not a re-import-
fragile id" reasoning) rather than adding a second, separate override table.
