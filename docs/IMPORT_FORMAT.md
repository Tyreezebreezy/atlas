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
4. **HTML** (v0.1.4) — a checkbox-tracked workout page (`parseHtmlPlan`), see
   "HTML import" below.
5. Manual creation (already covered by the workout/program builder, v0.0.3).
6. Not implemented: OCR, arbitrary scanned-PDF parsing, CSV. None had a clear
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
  reseed would not restore. The PR event history (`personal_record_events`,
  Handoff 04A.1 — see PRS.md) is included and, like `workout_occurrences`,
  optional: a backup exported before it existed still validates and restores,
  and the app then rebuilds the events from the restored sessions.

## Backup contents (vNext Handoff 04B)

`packages/import-export/src/backupStores.ts` is the single answer to "which durable
stores does a backup carry?" — export, restore, validation and the parity test all
read it. `backupParity.test.ts` walks every repository the storage adapter has and
fails unless each is either carried or listed in `STORES_NOT_IN_BACKUP`, so adding a
store without deciding about its backup is a failing test, not a gap found after a
restore.

- **Always carried** (a file lacking one is not a valid backup): custom exercises
  (and any canonical exercise the owner annotated or **favorited** -- a favorite is a
  flag on the canonical row, so it is exported with it), programs, workout templates, workout sessions (which hold `training_location_id`,
  `exercise_equipment` and the local-day fields), exercise notes, program notes,
  personal records, milestones, body measurements.
- **Carried, optional in the file** (an older backup still validates and restores,
  the missing store reading as empty): workout occurrences, PR events, training
  locations (including the default flag and archived state), equipment definitions,
  gym equipment instances, exercise-equipment contexts, exercise aliases, test
  protocols.
- **Deliberately not in a backup:** `benchmarks` — pure reference data with no
  per-user field, recreated under the same ids from the bundled dataset by
  `ensureBenchmarksSeeded` on any install. The canonical exercise library is the same
  kind of thing (reseeded). Device-local settings — timer preferences, onboarding
  flags (`localStorage`, not a storage repository) — describe the device, not the
  owner's data, and are not backed up; nothing the owner configures about their gyms
  lives there any more.
- **Restore is a MERGE, not a replace.** It upserts every row by id: a row with the
  same id is replaced by the backup's version, and everything already on the device
  that the backup does not mention stays (the confirmation says so: "This will add N
  records ... and keep everything already here"). It then rebuilds the PR event
  history from the restored sessions. Three singletons are reconciled so a merge
  never leaves two of something the app treats as one:
  - **the default place** -- a backup that carries one makes it _the_ default and
    clears any other default on the device;
  - **the active program** -- a backup that carries an active program makes it _the_
    active one and deactivates any other (Today, Program and Progress all read
    `programs.find(is_active)`);
  - **built-in milestones** -- a restored built-in milestone retires the destination's
    seeded copy of the same goal (matched on title, exercise and dimension) when the
    ids differ, so the catalog never lists a goal twice and a second restore changes
    nothing.
    The canonical exercise catalog is seeded **before** a restore lands, so a restore into
    a brand-new install still ends with the full library.
- **Tombstones are not exported.** `getAll()` hides soft-deleted rows, so a backup
  carries none: a restore neither resurrects a deleted record nor deletes one the
  target device still has.

## Numbers in an imported plan

Every input path (paste, `.json`, `.html`) converges on `buildImportPreview`, which is
where a target beyond anything real is held: sets over 100, reps over 999, a load over
5,000 lb, work or rest over a day, a distance over 1,000,000 m, RPE/RIR over 10 (the
`PLAN_LIMITS` in `@atlas/workout-engine`, also the bounds of the workout editor and of
set logging). An out-of-range value is left **blank** and the preview says so per field
("Sets 1000000000 is beyond the supported range (up to 100); it was left blank.") --
kept, `999999999 × 5` would reach Gym Mode as a billion set rows. A syntactically valid
file of the wrong shape, a negative number, an unknown `format`, a full backup handed to
the plan importer, an empty file, a file over 5 MB and an HTML page with no checkbox
exercises are each refused with a plain message and write nothing.

## HTML import (v0.1.4)

`packages/import-export/src/parseHtmlPlan.ts` turns a checkbox-tracked
workout page (the shape a browser-rendered personal workout tracker
typically exports as) into the same `PlanWorkout`/`PlanProgram`
intermediate representation the paste-text and JSON parsers already
produce — it feeds `buildImportPreview` exactly like they do, unchanged.
No new preview/matching/apply machinery was added; the parser's only job
is producing that existing shape from HTML.

**Safety.** Parsed via `DOMParser`, never inserted into the live document
— `<script>`/`<style>` content, inline event handlers, and any embedded
JS never execute, and nothing is fetched. `<script>`/`<style>` elements
are removed from the parsed (detached) document before extraction, purely
so their raw text can't be mistaken for a name/dose during extraction —
not a security measure by itself, since a detached `DOMParser` document
never executes anything either way.

**Structural, not class-name-dependent.** A "row" is any element with a
checkbox descendant; a "container" (one day, or one standalone routine)
is the innermost element that owns both a heading and at least one
checkbox. Real source documents are fixtures for this, not the only shape
ever supported — matching is structural (checkbox presence, leaf-span
text, numeric dose patterns) so a differently-class-named page with the
same shape still parses.

**Multi-routine files.** One file can contain either one Program's worth
of days (every container's heading names a weekday) or several unrelated
Quick Workouts (no weekday pattern) — `toHtmlImportOptions` decides which,
and a file with more than one _unrelated_ routine surfaces a picker in
`ImportWizard` so each gets imported (and reviewed) separately, never
silently flattened into one workout.

**Exercise choice syntax ("Cable or dumbbell lateral raise").** A
`PlannedExercise` slot has no "alternates" field — rather than inventing
one, `KNOWN_CHOICES` (hand-reviewed, not guessed, same convention as
`EXPLICIT_MEDIA_MAPPING`) resolves a known phrasing to a primary name
(which goes through the normal matching pipeline like any other imported
name) plus the alternate preserved verbatim in that exercise's own
`notes`. An unrecognized "X or Y" phrasing is left as its full literal
string, which the normal matcher will almost certainly fail to resolve —
correctly surfacing it as unresolved in the preview rather than guessing.

**Rest days.** A container whose status badge is exactly "Rest" (an exact
match on a short dedicated element's own text, never a substring search
across the container's full prose — "Rest: 20–40 seconds between sets"
elsewhere in the page must never be mistaken for a rest-day badge) always
imports with zero exercises, regardless of whether one of its rows
happens to contain a parseable number ("Prepare for Monday — 5 min" is
not training). The row text is preserved in `unparsedText` instead, which
the import preview already surfaces rather than silently dropping it.

**Prescription parsing.** `parsePrescription` recognizes sets×reps (flat
or a range), sets×timed (optionally a range, en dash or hyphen), bare
timed/rep activities with no explicit set count, interval notation
(`6 × 30s / 90s` → rounds/work/recovery), `/ side`, and breath counts
(kept distinct from reps). `PlanExerciseTarget.target_duration_seconds`
is a single number with no min/max pair the way reps has one — a duration
_range_ stores its max there and keeps the literal range in `notes`
rather than silently rounding it away. A non-numeric dose ("Optional",
"Valid choice") produces no invented numeric fields, just the original
text as a note.

## Limits of the current importer (acceptance pass, as found)

Recorded rather than changed -- the matcher/alias redesign is out of scope for now.

- **Only a weekday line names a day.** A plain title ("Upper Body A") or a Markdown
  heading ("# Leg Day") is read as an _exercise_ of that name, shown unmatched (skip
  it); the workout is called "Imported Workout".
- **Matching is exact, normalized or alias only.** Everyday gym names ("Lat Pulldown",
  "Leg Press", "Plank", "DB Incline Bench") do not match the dataset's names
  ("cable pulldown", "sled 45° leg press", "front plank with twist", ...), so a real
  plan needs its exercises resolved by hand each time: ranked candidates, "Search
  library…", "Create custom exercise" or "Skip". Nothing is guessed.
- **Custom exercises created by an import carry no category, equipment or muscles**
  (so no anatomy until the owner edits them).
- **An imported program is saved inactive** (activate it from Program). Its day labels
  carry the weekday ("Wednesday — Pull"), which is what places it on the schedule.
- A same-install export re-imports as a separate copy and does **not** trigger the
  duplicate warning (the duplicate check fingerprints the source text, not the saved
  plan). Export Workout / Export Program give no on-screen confirmation of the file;
  the Full Backup panel does.
- CSV is not supported (it is treated as plain text if forced past the file chooser).

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

"Reached" includes editing: the program editor shows an **Edit workout** button
beside each day's Workout, which opens that workout in the workout editor and
returns to the (still unsaved) program. It works the same whether or not the
workout is also shown in Quick Workouts, and never changes that flag (the
acceptance pass found a day's workout could only be edited by flagging it a Quick
Workout first). A day whose workout was deleted has no button, since there is
nothing to edit. Covered by `programWorkoutEditing.test.ts`.
