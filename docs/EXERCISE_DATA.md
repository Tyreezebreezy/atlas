# Exercise Data

**Status: not yet imported.** This is a placeholder — v0.0.2 fills it in.

## Plan

Source: `hasaneyldrm/exercises-dataset` (Kaggle), ~1,300 structured exercises.

Before import:

1. Confirm the dataset is still reachable and note the exact snapshot date/commit
   (Kaggle datasets don't have stable version numbers the way git does — record
   the download date and any version indicator the listing provides).
2. Re-verify the license on the listing at import time, not from memory.
3. Import structured fields only: id, name, body part, equipment, target/secondary
   muscles, category, instructions, and other structured text metadata.
4. **Exclude all bundled media** (images/GIFs/videos). Prior research found the
   media associated with this dataset traces to Gym Visual, which carries
   separate licensing terms not covered by the dataset's own MIT license. ATLAS
   does not bundle or reference that media.
5. Record the final provenance (source, download date, license, row count
   actually imported) in this file and in `LICENSES/`.

## Known blocker

Kaggle requires an authenticated download (API token or logged-in browser
session) for most datasets. The build agent has neither Kaggle credentials nor
authorization to create an account or enter credentials on the user's behalf.
Resolution is one of:

- the user downloads the dataset manually and hands the file to the agent, or
- a license-compatible public mirror (GitHub/Hugging Face) is located and used
  instead, with the substitution noted here.

## Enrichment layer

`Exercise` in `packages/data-model` already carries the enrichment fields
(movement pattern/family, push/pull/squat/hinge/carry/rotation flags,
bilateral/unilateral, difficulty, known substitutes) needed for the
substitution engine (v0.0.5). The dataset import does not populate these —
enrichment is seeded manually for a representative subset when the
substitution engine is actually built, per the handoff's explicit instruction
not to hand-enrich all ~1,300 rows up front.
