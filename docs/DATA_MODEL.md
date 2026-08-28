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

| Entity                                       | File          | Notes                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exercise`                                   | `exercise.ts` | canonical + aliases, category, target/secondary muscle, equipment, movement pattern, measurement type, enrichment fields (movement family, push/pull/squat/hinge/carry/rotation flags, difficulty, known substitutes) — schema since v0.0.1, curated data for ~33 common exercises since v0.0.5, see "Enrichment & substitution" below |
| `Program`, `ProgramWeek`, `ProgramDay`       | `program.ts`  | long-running plan, multiple saved programs, active/inactive                                                                                                                                                                                                                                                                            |
| `QuickWorkout`                               | `program.ts`  | independent of the active program; running one never advances it                                                                                                                                                                                                                                                                       |
| `WorkoutTemplate`, `PlannedExercise`         | `workout.ts`  | the **planned** side — target sets/reps/weight/RPE/RIR/rest                                                                                                                                                                                                                                                                            |
| `WorkoutSession`, `PerformedSet`             | `workout.ts`  | the **performed** side — see Architecture doc's "Planned vs performed"                                                                                                                                                                                                                                                                 |
| `ExerciseNote`, `ProgramNote`, `SessionNote` | `notes.ts`    | three distinct scopes, not one generic notes table                                                                                                                                                                                                                                                                                     |
| `PersonalRecord`                             | `records.ts`  | discriminated by kind: max load, rep, rep-range, estimated 1RM, volume, timed, distance, bodyweight                                                                                                                                                                                                                                    |
| `Milestone`                                  | `records.ts`  | built-in and custom; dimension is data (exercise/weight/reps/volume/duration/distance/bodyweight-multiplier), not code — new milestones never require a code change                                                                                                                                                                    |
| `Benchmark`                                  | `records.ts`  | separate from PRs/milestones; carries `evidence_grade` (A–D) internally, never shown in the primary UI                                                                                                                                                                                                                                 |
| `BodyMeasurement`                            | `body.ts`     | weight, body fat %, fat/lean/muscle mass, water, visceral fat, bone mass, BMR — all nullable, `source` field                                                                                                                                                                                                                           |

## Estimated 1RM formula

**Epley** (`weight * (1 + reps / 30)`) is the documented default, used
consistently everywhere a 1RM estimate is needed. Chosen for being the most
common and simplest well-documented formula. The PR engine (v0.0.6) is the first
consumer; this is recorded now so the choice doesn't drift. Alternative formulas
(Brzycki, Lombardi) can be added behind a `formula` parameter later without
touching stored data — ATLAS stores raw performed sets, not precomputed 1RMs.

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
