# ATLAS Data Model

Full type definitions live in `packages/data-model/src`. This is the map, not the
source of truth — read the types for exact fields.

## Sync metadata (every entity)

```ts
interface SyncMeta {
  id: string; // uuid v4
  created_at: string; // ISO 8601
  updated_at: string;
  version: number; // increments on every write
  device_id: string; // stamped by packages/core's device identity
  deleted_at: string | null; // soft delete
}
```

## Entities

| Entity                                       | File           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Exercise`                                   | `exercise.ts`  | canonical + aliases, category, target/secondary muscle, equipment, movement pattern, measurement type, enrichment fields (movement family, push/pull/squat/hinge/carry/rotation flags, difficulty, known substitutes) — schema since v0.0.1, curated data for ~33 common exercises since v0.0.5; push-up/pull-up/chin-up/chest dip/triceps dip/inverted row corrected from `reps_weight` to `reps_bodyweight` in v0.0.6, see docs/PRS.md "Bodyweight exercise path"; optional `media` (image/gif/video/frame-sequence abstraction) added in v0.1.2, populated for 64 of 1,324 exercises in v0.1.3 via a Workout Guide (CC BY-SA 4.0) import, see docs/EXERCISE_MEDIA.md and THIRD_PARTY_MEDIA.md |
| `Program`, `ProgramWeek`, `ProgramDay`       | `program.ts`   | long-running plan, multiple saved programs, active/inactive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `QuickWorkout`                               | `program.ts`   | independent of the active program; running one never advances it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `WorkoutTemplate`, `PlannedExercise`         | `workout.ts`   | the **planned** side — target sets/reps/weight/RPE/RIR/rest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `WorkoutSession`, `PerformedSet`             | `workout.ts`   | the **performed** side — see Architecture doc's "Planned vs performed"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ExerciseNote`, `ProgramNote`, `SessionNote` | `notes.ts`     | three distinct scopes, not one generic notes table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `PersonalRecord`                             | `records.ts`   | discriminated by kind: max load, rep, rep-range, estimated 1RM, volume, timed, distance, bodyweight — schema since v0.0.1, populated by `packages/pr-engine` since v0.0.6, see docs/PRS.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `PersonalRecordEvent`                        | `records.ts`   | vNext 04A.1. The history next to `PersonalRecord`'s current bests: one headline PR (a session/exercise/context that beat an earlier record). Stable id, `pr_kinds`, evaluator + estimator provenance. See PRS.md "Headline PR events"                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `TrainingLocation`                           | `location.ts`  | vNext 04B. The one place identity. A name is enough; nothing is seeded. `is_default` (at most one), `archived_at`, and the legacy `equipment: string[]` kept readable. A session's `training_location_id` and every equipment instance point here. See "Equipment instances, places, and session context"                                                                                                                                                                                                                                                                                                                                                                                        |
| `EquipmentDefinition`                        | `equipment.ts` | a named kind of equipment ("Dumbbell", "Leverage machine"): `type` + `name`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GymEquipmentInstance`                       | `equipment.ts` | one physical machine or rack at one place: exact loads, a range, a maximum only, or unknown; `archived_at`, `max_prompt_dismissed_at`, `legacy_equipment`. Two instances are never assumed equivalent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ExerciseEquipmentContext`                   | `equipment.ts` | remembers which instance an exercise uses at a place (`is_default`, one per exercise per place)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Milestone`                                  | `records.ts`   | built-in and custom; dimension is data (exercise/weight/reps/volume/duration/distance/bodyweight-multiplier/custom), not code — new milestones never require a code change; extended in v0.0.7 (`reference_value`/`multiplier`/`active`/`origin_session_id`/`origin_set_id`); no new fields in v0.0.8, but `target_weight` for `bodyweight_multiplier` changed from a creation-time snapshot to a value resolved against `BodyMeasurement` history and frozen only at achievement, see docs/MILESTONES.md and docs/BODY_COMPOSITION.md                                                                                                                                                           |
| `Benchmark`                                  | `records.ts`   | separate from PRs/milestones; carries `evidence_grade` (A–D) internally, never shown in the primary UI; extended in v0.0.7 (`age_min`/`age_max`/`source_url`/`sample_description`/`notes`/`dataset_version`), see docs/BENCHMARKS.md                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `BodyMeasurement`                            | `body.ts`      | weight, body fat %, fat/lean/muscle mass, water, visceral fat, bone mass, BMR — all nullable, `source` field; extended in v0.0.8 (`notes`), see docs/BODY_COMPOSITION.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Estimated 1RM formula

**Epley** (`weight * (1 + reps / 30)`) is the documented default, used
consistently everywhere a 1RM estimate is needed, implemented in
`packages/pr-engine/src/estimate1RM.ts` since v0.0.6 (the promise this
section made back in v0.0.1 is now fulfilled). Chosen for being the most
common and simplest well-documented formula. Alternative formulas (Brzycki,
Lombardi) can be added behind a `formula` parameter later without touching
stored data — ATLAS stores raw performed sets, not precomputed 1RMs.

One deviation from pure Epley: a true 1-rep set returns the load unchanged
rather than the formula's ~3.3% inflation at `reps === 1`, and estimates
are not computed above a 12-rep cutoff (Epley degrades badly there). See
docs/PRS.md for the full PR/progress design.

## Migrations

No custom migration runner. Each storage backend uses its own native versioned
migrations:

- **IndexedDB**: Dexie `db.version(n).stores({...})`, one call per schema version.
- **SQLite**: `tauri-plugin-sql`'s `Migration` list (`apps/desktop/src-tauri/migrations/*.sql`), applied in order on connect.

Both are exercised by tests in `packages/storage`.

SQLite tables are `(id, deleted_at, data JSON)` — one JSON-blob row per entity —
not a fully normalized relational schema. This keeps the SQLite adapter
behaviorally identical to the IndexedDB one (both are "whole document"
stores) and avoids hand-writing a column mapping for ten entities nothing
queries relationally yet. Move a table to real columns when the
progress/analytics engine (v0.0.6+) needs SQL-level aggregation over it.

**`putMany` does not use an explicit SQL transaction.** `tauri-plugin-sql` pools
connections per `execute()` call, so a `BEGIN` issued on one call isn't
guaranteed to be the connection a later call runs on — confirmed by testing:
the second `execute()` inside a nominal "transaction" succeeded, but the final
`COMMIT` failed with "cannot commit - no transaction is active", and the
`catch` block's `ROLLBACK` failed the same way, silently swallowing the real
error. `putMany` instead sends 50-row multi-value `INSERT` statements (each
already atomic on its own) with no `BEGIN`/`COMMIT` wrapper. If this plugin
ever exposes a real pooled/pinned-connection transaction API, revisit this.

**Migration history (vNext).** Each new store is additive — nothing existing is
rewritten: Dexie v3 `trainingLocations`; v4 `exerciseAliases` / `equipmentDefinitions` /
`gymEquipment` / `exerciseEquipmentContext`; v5 `testProtocols`; **v6
`personalRecordEvents`** (Handoff 04A.1; SQLite `0006_add_personal_record_events.sql`).
New optional fields on an existing entity (for example `Benchmark.evaluation_method`,
`Milestone.achieved_benchmark_evaluation`) need no migration at all.

**Handoff 04B adds no store and no migration** (Dexie stays at v6, SQLite at
`0006`). Everything it persists is an optional field on an entity that already
exists — `TrainingLocation.is_default` / `archived_at`,
`GymEquipmentInstance.archived_at` / `max_prompt_dismissed_at` /
`legacy_equipment`, `WorkoutSession.exercise_equipment` / `performed_local_date` /
`time_zone_id` / `utc_offset_minutes`, `PersonalRecord.gym_equipment_id`,
`PersonalRecordEvent.gym_equipment_id` — so a database written by 04A.1 opens
and works unchanged, and a row that lacks a field reads as "not recorded".

## Gym Mode execution semantics (v0.0.4)

`packages/workout-engine/src/session.ts` owns the `WorkoutSession` lifecycle:
`startWorkoutSession` (snapshots `planned_snapshot` from the template/program
day — a copy, never a live reference, so later template edits can't rewrite
history), `addPerformedSet`/`removePerformedSet`, `completeWorkoutSession`,
`discardWorkoutSession` (a status change, not a delete), `setSessionNote`.

**Draft vs. performed**: a set being typed into (`ExerciseLogger`'s per-row
`weight`/`reps`/etc. inputs) is pure React state, never touching storage. A
`PerformedSet` record is created — and immediately persisted via
`storage.workoutSessions.put()` — only once the user taps the row's complete
button. There's no separate "draft" storage concept: a planned slot either has
a `PerformedSet` or it doesn't. This means in-flight typed-but-not-confirmed
values don't survive a reload (acceptable — the handoff marks restoring
"incomplete set drafts" as "if practical"), while every _completed_ set does,
immediately, matching the non-negotiable autosave requirement.

**Active-session recovery**: on load, `TodayScreen` queries
`workoutSessions.getAll()` for a `status === 'in_progress'` record. If one
exists, it shows a resume/discard card instead of the normal Today content.
Resuming calls `firstIncompleteExerciseIndex()` (`GymModeScreen.tsx`) to land
on the first exercise that isn't fully logged yet, not always exercise 1.

**Gym Mode takes over the whole app** (`GymModeContext` + `NavShell`) — no tab
bar while a session is active, so navigating tabs can't context-switch away
mid-set. Only `GymModeScreen`'s own Back/Finish exit it.

## Timers, skip, and replace (v0.0.5)

`WorkoutSession` gained four fields: `active_timer`, `skipped_exercises`,
`skip_reason`, `replacements`. All are plain JSON, so both storage backends
(IndexedDB and SQLite's JSON-blob rows) round-trip them with zero adapter
changes — this is the payoff of the "whole document" storage design noted
above. `WorkoutSessionStatus` gained a fourth value, `'skipped'`.

**Timers are timestamp-based, never a decrementing counter.**
`TimerState = { kind: 'rest' | 'exercise', exercise_id, started_at,
duration_seconds, ends_at }`. Remaining time is always `ends_at - now()`
(`remainingSeconds()` in `packages/workout-engine/src/timer.ts`), recomputed
on every render/tick rather than trusted from a stored countdown. This is
what makes a timer resilient to the tab/process being backgrounded or the
app being fully closed and reopened — verified by killing and relaunching
the real packaged Tauri app mid-rest-timer and confirming the remaining time
had correctly ticked down, not reset (see the desktop smoke test in the
v0.0.5 completion report). `+15`/`-15` shifts `ends_at` without moving
`started_at`; a delta that pushes `ends_at` into the past is allowed --
`remainingSeconds` clamps that to 0, which is exactly "end the timer now"
with no separate clamping branch needed.

Only one timer runs at a time (`active_timer` is a single slot, not a list).
Pre-countdown (the "3, 2, 1" before a timed exercise starts) is deliberately
**not** persisted here — it's a few seconds of local component state in
`ExerciseLogger.tsx`, since a countdown that short surviving a real
backgrounding event isn't meaningful. Only the real rest/exercise timer that
follows it is written to `active_timer`.

**Rest-duration priority hierarchy** (`resolveRestSeconds` in `timer.ts`):
this workout's own `PlannedExercise.rest_seconds` (set in the template) →
the exercise library's `Exercise.default_rest_seconds` (populated by
curated enrichment for the same ~33 exercises, see below) → a global
90-second fallback (`DEFAULT_REST_SECONDS`). Higher tiers win outright, no
blending, so the source of any given rest duration is always traceable to
exactly one of the three.

**Timed exercises** (`measurement_type: 'time' | 'distance_time'`): the
next not-yet-logged row gets a Start/Stop control instead of a plain number
field (`TimedDurationCell` in `ExerciseLogger.tsx`) — only the _next_ row,
since there's only one `active_timer` slot. Start begins the optional local
pre-countdown, then calls `startExerciseTimer`, which persists a
`TimerState` the same way `startRestTimer` does. Stop computes elapsed
seconds from the same timestamp math and writes it into that row's existing
draft state — it does not bypass the normal "tap the checkmark to log the
set" flow, it only pre-fills the duration field.

**Screen wake lock** (`apps/web/src/gym/useWakeLock.ts`): requests the
native Screen Wake Lock API while `active_timer` is non-null, re-acquiring
on `visibilitychange` (the OS releases the lock when a tab is hidden and
never re-acquires it automatically). Feature-detected and wrapped in
try/catch throughout — unsupported or denied just means no wake lock, never
a crash. Lives in `apps/web`, not a shared package, since it's a browser-API
concern, not domain logic.

**Skip, exercise-level**: `skipExerciseInSession(session, exerciseId,
reason)` appends to `skipped_exercises` (`{ exercise_id, reason, skipped_at
}`); `planned_snapshot` is untouched. Undoable any time before Finish via
`unskipExerciseInSession`, which just removes the marker. A skipped
exercise's slot renders a compact "Skipped" card with Undo instead of
`ExerciseLogger`, so there's no way to log sets against a skipped slot
without first undoing the skip.

**Skip, whole-workout**: `skipWorkoutSession` (`skip.ts`) is a sibling of
`startWorkoutSession` that produces a session with `status: 'skipped'` and
`skip_reason` set, `performed_sets: []`, `planned_snapshot` copied exactly
like a normal start. This is a distinct concept from `discardWorkoutSession`
(v0.0.4): discard abandons a session already in progress (entered Gym
Mode); skip is a Today-screen decision never to start it at all. Both are
reachable from `TodayScreen.tsx`. `HistoryScreen` only ever queries
`status === 'completed'`, so skipped sessions are durable (for future
adherence/streak analytics) without showing up as clutter in History today
— a deliberate limitation, not an oversight.

**"Move/reschedule" a planned workout was not implemented.** The current
`Program`/`ProgramWeek`/`ProgramDay` model has no calendar-date/occurrence
concept at all (a deliberate simplification since v0.0.1 — programs are
"week N, day label," not dated instances). Building real rescheduling would
mean inventing that concept now, which is exactly the "do not overbuild a
calendar engine" the v0.0.5 handoff warned against. Day _reordering_ within
a program (a weaker, related capability) already existed from v0.0.3 and is
unaffected.

**Replace**: `replaceExercise(session, originalId, replacementId, reason,
scope)` (`replace.ts`) swaps `exercise_id` on the matching `planned_snapshot`
entry and appends an `ExerciseReplacement` record. It never touches
`performed_sets` — a set already logged under the original exercise keeps
that exercise_id forever, so History always shows what was actually done,
even after a later replacement changes what the remaining sets in that slot
are logged against. `scope: 'today'` stops there. `scope: 'program'`
additionally calls `applyExerciseReplacementToTemplate` to update the source
`WorkoutTemplate`, so only _future_ sessions started from that template pick
up the change — matches the existing planned-vs-performed principle, just
applied one level up (program → session) instead of (session → history).

## Enrichment & substitution (v0.0.5)

`packages/exercise-library/src/curatedEnrichment.ts` hand-curates movement
pattern, movement family, axial-loading flag, purpose, difficulty,
known-substitute links, and `default_rest_seconds` for ~33 common exercises
(bench/incline press, overhead press, lateral raise, pull-up/lat pulldown,
rows, squat variants, deadlift variants, curls, triceps pushdown, dips,
push-ups, plank, hanging leg raise) — not all 1,324 seeded exercises, per
the explicit instruction not to hand-enrich the whole library. Applied via a
lowercase-name-matched lookup (`applyCuratedEnrichment`) inside
`ensureExercisesSeeded`, at first-seed time only — it is not a migration for
installs that were already seeded before v0.0.5, which is an accepted
limitation (there are no real users yet). `known_substitute_ids` are
resolved to real ids within the same seed pool; a curated substitute name
that isn't itself in the pool is silently dropped rather than throwing.

The source dataset has at least one exact duplicate exercise name (`lever
chest press` appears twice as separate rows with different ids) — pre-dates
v0.0.5 (see docs/EXERCISE_DATA.md). Curated enrichment and substitution
scoring both handle this gracefully (each row is enriched independently;
`suggestSubstitutes` treats them as two distinct candidates), it's just
worth knowing the dataset itself has this quirk if a query ever looks like
it's "returning a duplicate."

`packages/substitution-engine` (new package) scores candidates
deterministically — no LLM, no randomness, stable ordering across runs.
Point weights (`suggest.ts`): known-substitute match (50) > same movement
pattern (40) > same target muscle (30) > same movement family (15) ≈ shared
secondary muscles (5/muscle, capped 15) > same measurement_type (10) ≈ same
unilateral/bilateral (5). The last two are deliberately reason-less and
cannot qualify a candidate on their own — a candidate needs at least one
"real" (reasoned) signal to be suggested at all, otherwise two anatomically
unrelated exercises that merely share `measurement_type: 'reps_weight'`
(true for ~98% of the library) would "match" on nothing meaningful. See
docs/SUBSTITUTIONS.md for the full model and worked examples.

## Workout flexibility (v0.1.1, Stage 4)

**Sequential programs (4A)**: `Program` gained `progression_mode: 'fixed' |
'sequential'` and `sequence_position: number`. Fixed (the only mode through
v0.1.0) shows every week/day and lets the user pick any of them. Sequential
shows only the day at `sequence_position` on Today — a repeating rotation
(e.g. Upper/Lower/Upper/Lower) that advances by one, wrapping back to 0
after the last day, only when the day actually completed matches the
current position (`advanceProgramSequence` in
`packages/program-engine/src/sequentialProgress.ts`). Missing a day never
auto-skips it. A program stored before v0.1.1 has neither field at runtime
despite the required TypeScript type — every read site goes through
`programProgressionMode()`/`programSequencePosition()` rather than reading
the fields directly, same defaulting pattern as `body.ts`'s `notes` in
v0.0.8.

**Supersets and circuits (4B)**: `PlannedExercise` gained `group_id: string
| null`; `WorkoutTemplate` and `WorkoutSession` both gained `groups:
ExerciseGroup[]` (`{ id, type: 'superset' | 'circuit', rounds,
rest_after_seconds }`). Members of one group are the consecutive
`PlannedExercise` entries sharing a `group_id` — there's no separate
grouped-exercises array to keep in sync. `WorkoutSession.groups` is
snapshotted from the template at session start, same reason as
`planned_snapshot`: editing the template's groups later must not rewrite an
in-progress or completed session's history.

Gym Mode navigates by **slot**, not by raw planned-exercise index:
`buildGymSlots` (`packages/workout-engine/src/groups.ts`) collapses a flat
`planned_snapshot` into `GymSlot[]`, where an ungrouped exercise is still
its own slot and every member of one group collapses into a single slot at
its first member's position. A group executes **round by round** — one set
of every member, in order, before repeating — rendered by
`apps/web/src/gym/SupersetRound.tsx`, never the per-exercise
`ExerciseLogger` table (that shape would defeat the point of a superset:
all N sets of member A before member B ever starts). Round completion is
derived, not stored: `currentGroupRound` takes the _minimum_ per-member
completed-set count, so the group stays on the round its slowest member
hasn't finished, not the round its fastest member is on.
`rest_after_seconds` fires after the group's last member finishes a round,
not between members within one.

**Add Exercise during an active workout (4C)**: mirrors Replace Exercise's
scope model rather than inventing a new one. `addExerciseToSession`
(`packages/workout-engine/src/addExercise.ts`) appends a fresh
`PlannedExercise` to the _end_ of `planned_snapshot` only — no mid-workout
reorder UX. `scope: 'today'` stops there; `scope: 'program'` additionally
calls `addExerciseToTemplate` to append to the source `WorkoutTemplate`, so
only future sessions pick up the change, matching how Replace's `'program'`
scope only touches the template, never a session already in progress.

**Set-type flexibility (4D)**: `SetType` (`working | warmup | drop | amrap |
failure`) has existed on `PerformedSet` since v0.0.1, and PR eligibility
(`packages/pr-engine/src/eligibility.ts`) has always excluded `warmup` while
counting the rest — but until v0.1.1 nothing in the UI could actually
produce anything other than `'working'`. `ExerciseLogger.tsx` now has a
per-draft-row set-type select (default `working`); a completed row shows a
small label next to its set number for any non-working type. No data-model
change — this closed a UI gap against an already-complete schema.

**Training distribution (4E)**: `packages/progress-engine/src/
trainingDistribution.ts` tallies eligible (completed session, non-warmup)
working sets logged within a rolling window (default 7 days) by two axes:
**muscle group** (`Exercise.category` — always populated from the source
dataset, e.g. "chest", "back") and **movement family**
(`Exercise.enrichment.movement_family` — only populated for the ~33 curated
exercises, see "Enrichment & substitution" above). Sets whose exercise has
no curated movement family are counted separately as
`uncategorizedMovementFamilySets` rather than silently dropped or forced
into a guessed bucket. Deliberately _not_ built: any physiological
recovery/readiness percentage — that would require modeling the body, which
this stage's handoff explicitly excluded; this is a plain tally of what was
actually logged, nothing inferred. No manual classification of the other
~1,291 exercises was done to make this work, per the same handoff
instruction.

## Training engine (v0.2.0)

Progression policies, target provenance, set-phase semantics, deload, and
the full rest hierarchy are documented separately in **docs/PROGRESSION.md**
rather than here — it's substantial enough to warrant its own file.

**Freestyle workout**: `startWorkoutSession()` already accepted an
arbitrary caller-supplied `plannedSnapshot`/`groups` with nullable
`templateId`/`programId` since v0.1.1 — "Start Freestyle Workout"
(`TodayScreen.tsx`) needed no new engine code, just a new entry point
calling it with `plannedSnapshot: []`. Exercises are added the same way
Gym Mode already adds one mid-session (`addExerciseToSession`, v0.1.1
Stage 4C).

**Scheduling**: `WorkoutOccurrence` (`packages/data-model/src/occurrence.ts`,
new store, Dexie version 2 / SQLite migration `0002`) layers calendar-date
deviations on top of `Program`, which stays a pure template exactly as
before — see that type's own doc comment for why rows are created lazily
rather than one per future date. `packages/program-engine/src/workoutOccurrence.ts`
holds the four actions (`moveOccurrence`, `skipOccurrence`,
`replaceOccurrence`, `completeOccurrence`); callers look up any existing
row via `findOccurrence`/`findOccurrenceByEffectiveDate` first so a slot
never gets two rows for the same original date.

**Historical entries**: "Log Past Workout" (`LogPastWorkoutScreen.tsx`)
reuses `startWorkoutSession`'s new `startedAt`/`plannedCompletedAt`
parameters (backdating both timestamps) and the exact same Gym Mode
UI/engine as any other session — no second logging system. A same-date
collision offers Keep Both / Replace Existing (a `discardWorkoutSession`
status change, not a delete) / Cancel, never a silent merge. See
docs/PROGRESSION.md "Chronology safety" for how backdated entries resolve
progression correctly regardless of save order.

**Plate calculator** (`packages/workout-engine/src/plateCalculator.ts`):
greedy largest-plate-first per side, common bar/plate presets with simple
customization. Never rounds up past the requested load — an unreachable
exact target (e.g. 187.5 lb with 2.5 lb plates) resolves to the nearest
achievable total at or below it, flagged `exact: false` rather than
silently substituted.

**Equipment profiles**: device-local (`AtlasSettings.equipmentProfiles`,
same localStorage mechanism as the rest of Settings — which gym someone's
at isn't shared history). Reuses the existing substitution engine's
`availableEquipment` filter unchanged (`suggestSubstitutes` already
accepted this option before v0.2.0) rather than building new filtering
logic — `ExerciseContextSheet.tsx`'s "Equipment unavailable" entry only
appears when the active profile excludes a planned exercise's equipment,
and only ever suggests; it never mutates the plan.

**Import idempotency**: `computeImportFingerprint()`
(`packages/import-export/src/importFingerprint.ts`) hashes a source
document's stable content (excluding `exported_at`, which differs on
every export of the same source) with a small dependency-free string hash
— not cryptographic, just enough to catch "this looks like the same
source re-imported." Stamped onto the created `Program`/`WorkoutTemplate`
as `import_fingerprint`; the import preview step checks
`findExistingImportByFingerprint` against existing rows and warns before
the owner approves, rather than silently duplicating.

**Favorites**: `Exercise.is_favorite?: boolean`, optional like `media`.
`searchExercises()` (`packages/exercise-library/src/search.ts`) sorts
favorites first with a stable sort — the one function every exercise
list/picker in the app already filters through, so favorites rising
everywhere (Library, Add Exercise, Replace, the Program builder's picker)
falls out of one change rather than four.

**Wake lock** (existing since earlier, extended in v0.2.0): now requests
for the whole active session (`session.status === 'in_progress'`), not
only while a rest/exercise timer is running — typing weight/reps between
sets with no timer active must not let the screen lock either.

**Muscle map**: the polished anatomical body-map visualization was
deliberately not built (explicit handoff permission: "do not block the
entire release" over this). What did ship is the three data modes the
handoff asked for, as text/list views: Training Distribution (working
sets by muscle group, pre-existing since v0.1.1 Stage 4E),
**Training Recency** (new — `packages/progress-engine/src/trainingRecency.ts`,
days since a muscle group was last meaningfully trained, only for groups
with real history, no invented recovery percentage), and Strength Trend
(pre-existing, estimated-1RM series already on the Progress screen).

**Activity heatmap**: `computeActivityHeatmap()`
(`packages/progress-engine/src/activityHeatmap.ts`) — one value per
calendar day (workout count, minutes, or sets) over a trailing window,
keyed by the owner's local calendar date, not UTC. Every day in the
window is present (including zero-activity days) so the grid UI never
backfills gaps itself.

**Unit conversion (deferred)**: no unit system exists in ATLAS at all as
of v0.2.0 — every weight is implicitly lb, throughout history, targets,
increments, bodyweight, and now the plate calculator. Adding kg/lb
support properly (including the "convert values" vs. "keep the number,
relabel the unit" choice the handoff calls out) touches every one of
those surfaces at once; per the handoff's own instruction ("if this
requires a major unrelated migration, document it for the next phase
rather than destabilizing v0.2.0"), this is deferred rather than
half-built. See docs/ROADMAP.md.

## Starter data (removed from this repository)

Between v0.2.1 and v1.1.0 the app seeded one personal training program and
several Quick Workouts into a fresh install, generated from the maintainer's
own workout documents. That data, its seeder and its fixtures are not part of
this repository's public history. The app shipped here starts **blank**: no
programs, no workouts, no history. Only the exercise library and the benchmark
and milestone catalogs are seeded, because those are reference data.

The `starter_pack` field on `Program` and `WorkoutTemplate`
(`OwnerStarterPackProvenance` in `packages/data-model/src/sync.ts`) is a leftover
from that seeder. It is optional, informational only, never read for any
decision, and stays in the schema so existing databases that carry it keep
validating. New installs never set it.

To get your own plan in, use import (paste text, an `atlas-plan-v1` file, or an
HTML plan page) or build it in the Program tab. See
[IMPORT_FORMAT.md](IMPORT_FORMAT.md).

## Weekly schedule resolution (v0.2.2)

Today used to render the entire active Program (every week, every day) and
let the owner pick one -- redundant with the Program tab, and not actually
"today." `todaysScheduleEntry()` (`packages/program-engine/src/todaySchedule.ts`)
resolves the ONE thing Today should show:

- **Sequential** programs: unchanged, `currentSequentialDay()`.
- **Fixed** ("Weekday Schedule" in owner-facing UI) programs: the
  `ProgramDay` whose `weekday` (0=Sun..6=Sat, `Date.getDay()` convention)
  matches today's device-local weekday. `resolveDayWeekday()` falls back to
  parsing a recognizable weekday name out of the day's `label` when
  `weekday` itself is unset, so an existing fixed-mode program (including
  the owner's own seeded Weekly Workout Guide, whose days are explicitly
  stamped at seed time) resolves correctly without a forced migration.

A `WorkoutOccurrence` can override the plain weekday match: something moved
IN to today (by effective_date) takes priority; today's own regularly
scheduled day can instead resolve to `moved_away`, `skipped`, or
`completed` depending on its own occurrence's status. `completed`
specifically was a real bug caught in live testing, not just reasoned
about: an occurrence moved-and-then-completed onto a later date was being
treated as an ordinary open "workout" slot (offering "Start Workout" again,
and even surfacing as a false "Up Next" match) purely because its status
had never been checked. `resolveUpNext()` walks forward up to 7 days,
skipping rest/completed/none slots, for the compact "Up Next" summary.

`resolveWeeklySchedule`/`resolveUpNext` are pure functions -- Today does
not maintain its own copy of "what's scheduled," it recomputes from
`Program` + `WorkoutOccurrence[]` + today's date on every load.

## Single-week programs (v0.2.2)

A Program with exactly one `ProgramWeek` no longer shows a "Week 1" label
in normal owner-facing UI (`shouldShowWeekLabel()`,
`packages/program-engine/src/sequentialProgress.ts`) -- presentation only,
the underlying model is unchanged, and a genuine second week still shows
its label immediately.

## Alphabetical sorting (v0.2.2)

Every browse/discovery surface defaults to case-insensitive, locale-aware
A-Z (`compareByName()` in `@atlas/core`, or the equivalent inline
`localeCompare` for plain string lists like body-part/equipment filters) --
`searchExercises()` is still the one shared choke point for every exercise
list/picker (Library, Add Exercise, Replace Exercise, the Program/Quick
Workout builders, Freestyle), so this and the pre-existing
favorites-first behavior fall out of one change rather than five. This is
strictly a browse-time concern: `WorkoutTemplate.exercises`/
`PlannedExercise[]` order (what Program days and Gym Mode actually render
and log against) is never touched by any of this -- programmed order
(warm-up, then compounds, then accessories) stays exactly as authored.

## Milestone grouping (v0.2.2)

Milestones used to render as two flat lists (achieved, sorted by
`achieved_at` descending; not-yet-achieved, unsorted) -- readable only by
coincidence, since two different movements achieved on different days
interleave arbitrarily. `groupMilestones()`
(`packages/milestone-engine/src/groupMilestones.ts`) groups by canonical
`exercise_id` (never by title text), sorts groups alphabetically by
exercise display name, and sorts each group's milestones ascending by a
dimension-appropriate **semantic** target value (`target_weight`,
`target_reps`, `target_duration_seconds`, etc.) rather than the title
string -- "10, 25, 50, 75, 100 Push-Ups" instead of "100" sorting before
"25." Achieved and not-yet-achieved milestones of the same movement now
live in the same group, in the same ascending ladder, rather than two
separate sections.

The one milestone mapping flagged as possibly wrong ("60-Second Plank" ->
`weighted front plank`) was audited, not blindly "fixed": the raw seed
dataset has no plain plank exercise at all, and `weighted front plank` was
deliberately chosen in `curatedEnrichment.ts` back in v0.0.7 as the closest
real entry, with its `measurement_type` corrected to `time` specifically so
it behaves as an ordinary timed plank (no weight field shown) -- "weighted"
in the name is a dataset-naming artifact. All four built-in mappings
(bench press, push-up, pull-up, plank) were verified against the real seed
data and are pinned by a regression test. The plank group's own header
still literally reads "weighted front plank" (the exercise's real name,
same as everywhere else in the app) -- a known cosmetic quirk, not
corrected here since renaming the underlying exercise would touch its
media-matching and curated-enrichment keys for a purely cosmetic gain.

## Equipment instances, places, and session context (vNext Handoff 04B)

### One place identity

`TrainingLocation` is the only place identity: a session's
`training_location_id`, every `GymEquipmentInstance.training_location_id` and
every equipment-scoped record point at it. There is no second "gym profile"
model and no "active location" setting — the old device-local one was migrated
into `TrainingLocation` rows once (`apps/web/src/equipment/legacyProfiles.ts`;
the profile that was active becomes the default) and removed. Where the owner is
_now_ is the workout's own `training_location_id`.
`apps/web/src/equipment/singleEquipmentAuthority.test.ts` fails if either comes
back.

- **A place can be only a name.** Nothing is seeded (a fresh install has no
  places, and a workout starts anyway with `training_location_id: null`) and
  equipment is optional. Unknown equipment is never read as a known maximum.
- **The default is a flag on the entity** (`is_default`), so it is part of a
  backup. At most one place carries it: `setDefaultLocation` clears the previous
  holder, the first place created becomes the default, and restoring a backup
  that carries a default clears any other one already on the device.
- **Where a new workout starts** (`preselectedLocationId`, no questions asked):
  the only active place; else the default; else the place of the most recent
  workout; else nowhere. A place is never guessed from list order.
- **Archive vs delete.** `archived_at` hides a place from every "where are you
  training" choice (and ends its time as the default) but keeps the row, so
  sessions that happened there and equipment configured there keep resolving
  their names. A tombstone (`deleted_at`, which `getAll()` hides) is only offered
  for a place nothing refers to — no session, no equipment; otherwise the UI
  offers Archive alone. Nothing cascades: archiving or deleting a place never
  touches a session, a record, an event or an instance.

### Equipment instances

- `EquipmentDefinition` is a named kind (`type`, from `EQUIPMENT_TYPES` or an
  owner-named "Other"); instances share it.
- `GymEquipmentInstance` is one physical machine or rack at one place. Two
  machines at one place are two rows, the same make at two places is two rows,
  and nothing is assumed equivalent. Its loads are described in exactly one of
  four honest shapes (`parseLoadConfig`):
  - **exact list** (`exact_loads`) — authoritative, and may be uneven (a rack that
    skips from 5 to 8 to 10);
  - **range** (`min_load`, `max_load`, `increment`) — all three;
  - **maximum only** (`max_load`) — where the stack ends, not what lies below it:
    `availableLoads` stays empty, no intermediate load is ever synthesized, but a
    recommendation is still never above it;
  - **unknown** — nothing set. Progression falls back to its unconstrained
    decision; unknown is never read as "at the maximum".

  Loads are in `unit`. Logged history is in lb (`APP_LOAD_UNIT`; there is no unit
  preference), so an instance entered in kg is kept as entered but is never
  applied to lb history and never converted to a "free-weight equivalent".

- Per-instance owner state: `archived_at` (hidden from choices, kept for
  history); `max_prompt_dismissed_at` ("Is 170 lb the maximum on this machine?" is
  asked at most once — "yes" writes `max_load`, "no / not sure" writes this, and
  nothing is ever inferred); `legacy_equipment` (below).
- `ExerciseEquipmentContext` is the memory "this exercise uses that instance at
  that place": `is_default`, one per exercise per place (`planRememberedMapping`).
  Choosing a machine in a workout is the confirmation that writes it; ATLAS does
  not auto-map when several machines would do.
- **Legacy strings.** `TrainingLocation.equipment: string[]` (from before
  instances) stays readable and is never rewritten or deleted. Structured
  instances are the authoritative inventory for loads and progression. A legacy
  string appears under "Legacy equipment" with **Configure**, which creates an
  instance (marked `legacy_equipment`, so the string is not offered twice, and
  with no maximum guessed). For substitution the two are unioned — see
  SUBSTITUTIONS.md.

### What a workout records

All optional on `WorkoutSession`, so no migration, and every older session reads
as "not recorded":

| Field                                                        | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `training_location_id`                                       | where the workout happened; captured when it starts (planned, freestyle and quick workouts), `null` when no place exists or "No location" is chosen. Fixed once a set is logged — see "The place and each machine are fixed by the sets logged against them"                                                                                                                                                                                                                                                                                                                                |
| `exercise_equipment`                                         | `{ exercise_id, gym_equipment_id }[]` — **the** record of which instance each exercise was performed on in this session. It lives inside the session document (the `workout_sessions` store), so it travels with the session in a backup. One entry per exercise, not per set (the unit PRs and events use). Written when the owner picks a machine, or — for a machine remembered for the exercise at this place — when the exercise's first set is logged. An exercise with no chosen or remembered machine has no entry; nothing is guessed. Fixed once a set of that exercise is logged |
| `performed_local_date`, `time_zone_id`, `utc_offset_minutes` | see "Local time" below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**The place and each machine are fixed by the sets logged against them**
(`isLocationLocked`, `isExerciseEquipmentLocked`). The rule lives inside the
transforms `changeSessionLocation` and `setExerciseEquipment`, not only in the
screen: a refused change returns the very same session object, untouched (not even
its version moves). Context is a record of where and on what sets were performed,
so it only changes while that is still true to say.

- **The workout's place** is free to change until the first set is logged (a
  warm-up counts), and is fixed from then on. Before that, changing it clears any
  machine the owner had already picked at the old place — after a confirmation;
  never carried across, never swapped for a look-alike ("Chest Press #1 here" says
  nothing about any machine there) — and the targets of exercises with nothing
  logged are re-worked for the new place. After the first set the change is
  refused: the session keeps its place and every machine mapping exactly as they
  were. The control is replaced by the place's name with a "Locked" badge, and the
  screen says that a workout with logged sets stays at that place, and that
  training somewhere else means finishing this workout and starting another.
  Nothing is ever re-homed, so a set logged at one gym cannot end up at another.
- **An exercise's machine** is free to change until a set of _that_ exercise is
  logged, and is fixed from then on; sets of other exercises do not lock it. The
  session keeps one machine per exercise — deliberately no per-set machine — so a
  different one after set 1 would retroactively relabel set 1. A refused change
  leaves the stored equipment identity, the logged sets and the exercise's remembered
  default untouched. The panel shows the machine that was recorded, or "not recorded"
  (a machine cannot be added once sets were logged without one), with a "Locked"
  badge and the reason. The limit is real and stated: if the owner switches machines
  in the middle of an exercise, the rest of its sets belong in a new workout.
- A finished workout is locked entirely, so no completed workout has its place or
  machine rewritten. Removing the logged sets lifts the lock, because nothing is left
  to relabel.

### Performance context

A performance's comparable context is the pair
`(training_location_id, gym_equipment_id)`
(`packages/pr-engine/src/context.ts`: `performanceContextOf`,
`performanceContextKey` — the only place a session becomes a context). Records,
headline events, the stall check, the Strength view and the weekly review's
per-exercise counts all group by it, so two machines at one gym are separate
series, and so is one make at two gyms. History with neither recorded is its own
valid context, labelled "Unspecified / Legacy"; it is never assigned a place or a
machine afterwards. "Last time" and the progression baseline are deliberately
looser — see PROGRESSION.md. Details: PRS.md "Equipment-scoped series".

### Local time

A workout belongs to the calendar day on the wall clock where it was done, not
to the UTC date of its timestamps (`started_at` / `completed_at` stay UTC
instants). New sessions store:

- `performed_local_date` — `YYYY-MM-DD`, the day on the device's clock when the
  workout started. A stored fact: it does not move if the viewer later changes
  time zone.
- `time_zone_id` — the IANA zone the device reported
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`), or `null` when the runtime
  reports none. Provenance only: never used to re-derive the date, never inferred
  from a place's address.
- `utc_offset_minutes` — minutes east of UTC at that moment (UTC−4 is −240).
  Provenance only.

A live session takes all three from the device clock. A **backdated** session
(Log Past Workout, or any explicit start time) records only
`performed_local_date` — the day the owner picked, or the day the start instant
falls on here — and leaves `time_zone_id` and `utc_offset_minutes` `null`: the
zone of this device proves nothing about where an old workout was done, so none
is invented.

**Reading** is one function, `sessionLocalDate` (`@atlas/core`): the stored
`performed_local_date` when it is a valid `YYYY-MM-DD`; otherwise — every session
recorded before 04B — the day `completed_at ?? started_at` falls on in the
_viewer's_ time zone. That fallback is a documented approximation, not a
recovered fact: an old workout viewed from a different zone than it was done in
can land a day off. Weeks are Monday-first (`startOfWeekIso`, `mondayWeekIndex`).
The weekly review, the activity heatmap, milestone days (including the
consistency milestones' weeks), the PR event day, History's month grouping and the Log Past
Workout default all read it; `packages/progress-engine/src/localDayGuard.test.ts`
fails if a day or week is taken from the first ten characters of an ISO string.

### Backup

A backup carries every durable store this section adds — places, equipment
definitions, instances, exercise-equipment contexts, aliases, test protocols and
the PR event history — and an older backup still restores. See IMPORT_FORMAT.md
"Backup contents".

## Invariants held by the full-system acceptance pass (vNext 04B)

Each of these was found broken or unstated by testing the whole app, then fixed where
it is made, with a regression test.

- **One planned entry per exercise per workout** (`uniqueExercises.ts`). Everything a
  session records about an exercise — sets, slot completion, a skip, a goal, a timer,
  the machine — is keyed by the exercise, so two slots for it would share all of that.
  The pickers refuse an exercise already in the workout, `addExerciseTo*` and
  `replaceExercise` refuse it, an import folds repeats into the first entry (keeping
  the sets), and a template saved before the rule is folded when a workout starts.
- **Exactly one active program and one default place.** `setActiveProgram` and a
  restore both reconcile them (IMPORT_FORMAT.md "Backup contents"). `Program.activated_at`
  is stamped when a program becomes active and bounds the "Missed" look-back
  (`max(created_at, activated_at)`), so a program switched to today does not list a
  week of phantom missed workouts.
- **A workout's day label is its stored local day** (`formatSessionDate`, preferring
  `performed_local_date`): History, Strength / Library per-exercise history and the Gym
  Mode "History" sheet. Still formatted from the completion _instant_ in the viewer's
  zone, so they can differ from the counted day only after the zone changes: chart
  x-axis labels, milestone "Achieved" dates, and Today's "Completed Monday 7:15 PM".
- **Numbers have bounds** (`PLAN_LIMITS`, `@atlas/workout-engine`): planned sets ≤ 100,
  reps ≤ 999, load ≤ 5,000 lb, a work/rest time ≤ one day, distance ≤ 1,000,000 m, RPE/RIR ≤ 10 —
  the same limits bound the workout editor, set logging and an imported plan
  (IMPORT_FORMAT.md "Numbers in an imported plan"). A body measurement (`BODY_LIMITS`,
  `@atlas/body-composition`) must be > 0 and at most 1,500 lb (weight and the masses) /
  100 % / 100 (visceral) / 10,000 (BMR), carry at least one number, and not be dated in the
  future.
- **Log Past Workout** takes a day that has happened (not in the future, a start time
  that has not passed today is refused), a duration of 1–1,440 minutes (blank = 60), and
  asks before adding to a day that already has a workout. **Replace Existing** discards the
  earlier workout _and_ recomputes the personal records (and events) of every exercise it
  contained — records are derived from completed history, so they never outlive the
  workout that set them. It is the only way to remove a completed workout in the app;
  a milestone the discarded workout achieved stays achieved.
- **Exercise → muscle mapping** precedence and the owner-exercise name table are in
  ANATOMY.md "Exercise → muscle mapping".
