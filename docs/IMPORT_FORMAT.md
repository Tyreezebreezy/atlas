# Workout/Program Import Format

**Status: implemented in v0.0.9.** See `packages/import-export/`.

## Principle

Import is provider-agnostic. Never name or brand this feature around any
specific AI assistant — a workout can come from a trainer, a friend, a website,
an old document, or the user's own notes just as easily as from an LLM. The
feature is "Import Workout" / "Import Program," never "AI Import."

## Formats, in priority order

1. **Pasted free-form text** — the primary human workflow. Parsed into
   structured exercises/sets/reps/rest/notes by `parsePasteText` (deterministic,
   regex-based; no embedded LLM).
2. **`atlas-plan-v1`** — a versioned, strictly validated portable
   workout/program/full-backup format (`validateAtlasPlan`). No schema library
   (zod/ajv/etc.) exists anywhere in this repo; validation is a small
   hand-written function scoped to exactly this format, not a general-purpose
   schema engine. An unsupported or missing `format` value is always rejected,
   never coerced.
3. TXT / Markdown — routed through the same paste-text parser as (1).
4. Manual creation (already covered by the workout/program builder, v0.0.3).
5. Not implemented: OCR, arbitrary scanned-PDF parsing, CSV. None had a clear
   enough use case to justify the added surface in v0.0.9; revisit if a real
   need appears.

## Pipeline (never skipped)

```
Input → Parse → Schema/structure validation → Exercise matching
  → Warnings/unresolved items → Preview → User edits → User approval → Save
```

Nothing is silently saved. Exercise matching (`matchExercise`) only
auto-resolves an **exact**, **normalized** (case/whitespace/punctuation), or
**alias** match. Everything else — including a close token-overlap candidate
like "DB Incline Bench" → "Incline Dumbbell Bench Press" — comes back
**unresolved** with up to 5 ranked candidates; the preview screen requires the
user to pick a candidate, search the library, create a custom exercise, or
explicitly skip that exercise before Approve & Save is enabled.

## Portable vs. raw-ID documents

Two different documents share the `atlas-plan-v1` envelope but serve
different purposes:

- **`kind: "workout"` / `kind: "program"`** — portable across installations.
  `exercise_name` is always populated as the fallback; `exercise_id` is kept
  only as a same-install hint (trusted directly on a same-install
  export-then-reimport round trip, otherwise ignored in favor of matching by
  name).
- **`kind: "backup"`** — not meant for cross-install semantic matching. IDs,
  timestamps, versions, `device_id`, and `deleted_at` are preserved exactly as
  exported, for restoring the same logical dataset onto a clean installation
  (e.g. desktop → phone). Canonical (non-custom, non-annotated) exercises and
  Benchmarks are excluded — both are fully reproduced by the existing
  `ensureExercisesSeeded`/`ensureBenchmarksSeeded` guards from the bundled
  seed data, using the same fixed IDs baked into that seed file across every
  installation. Built-in Milestones **are** included despite also being
  seeded, because a milestone's achievement state
  (`achieved_at`/`origin_session_id`/`origin_set_id`) is real user data a
  reseed would not restore.

## A standalone workout import must stay reachable

A `WorkoutTemplate` is only visible in the UI if `is_quick_workout: true` or
it's linked from a `Program`'s `ProgramDay.template_id` (see
`docs/DATA_MODEL.md`). Importing a single workout (paste-text, or a JSON
`kind: "workout"` document) has no Program to attach to, so `applyImport`
always forces `is_quick_workout: true` for that case regardless of what the
source document said — otherwise the import would silently create an
unreachable orphan template. A day imported as part of a `kind: "program"`
document keeps `is_quick_workout: false`, since it's reached through its
`ProgramDay` instead. Found via manual testing during v0.0.9, not assumed.
