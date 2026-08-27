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

| Entity                                       | File          | Notes                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exercise`                                   | `exercise.ts` | canonical + aliases, category, target/secondary muscle, equipment, movement pattern, measurement type, enrichment fields (movement family, push/pull/squat/hinge/carry/rotation flags, difficulty, known substitutes) — enrichment schema exists now, data seeded in v0.0.2 |
| `Program`, `ProgramWeek`, `ProgramDay`       | `program.ts`  | long-running plan, multiple saved programs, active/inactive                                                                                                                                                                                                                 |
| `QuickWorkout`                               | `program.ts`  | independent of the active program; running one never advances it                                                                                                                                                                                                            |
| `WorkoutTemplate`, `PlannedExercise`         | `workout.ts`  | the **planned** side — target sets/reps/weight/RPE/RIR/rest                                                                                                                                                                                                                 |
| `WorkoutSession`, `PerformedSet`             | `workout.ts`  | the **performed** side — see Architecture doc's "Planned vs performed"                                                                                                                                                                                                      |
| `ExerciseNote`, `ProgramNote`, `SessionNote` | `notes.ts`    | three distinct scopes, not one generic notes table                                                                                                                                                                                                                          |
| `PersonalRecord`                             | `records.ts`  | discriminated by kind: max load, rep, rep-range, estimated 1RM, volume, timed, distance, bodyweight                                                                                                                                                                         |
| `Milestone`                                  | `records.ts`  | built-in and custom; dimension is data (exercise/weight/reps/volume/duration/distance/bodyweight-multiplier), not code — new milestones never require a code change                                                                                                         |
| `Benchmark`                                  | `records.ts`  | separate from PRs/milestones; carries `evidence_grade` (A–D) internally, never shown in the primary UI                                                                                                                                                                      |
| `BodyMeasurement`                            | `body.ts`     | weight, body fat %, fat/lean/muscle mass, water, visceral fat, bone mass, BMR — all nullable, `source` field                                                                                                                                                                |

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
