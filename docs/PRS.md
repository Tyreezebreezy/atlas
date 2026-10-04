# Personal Records & Progress (v0.0.6)

`packages/pr-engine` and `packages/progress-engine` turn completed workout
history into personal records and progress summaries. Both are pure,
storage-independent packages — `PersonalRecord` persistence and recomputation
triggers live in `apps/web` (`src/progress/recalculatePRs.ts`), not in the
engines themselves, matching the established workout-engine/program-engine
division of labor.

## Bodyweight exercise path

The `bodyweight` PR kind (see table below) existed in the data model and
`pr-engine` from the start of v0.0.6, but initial runtime testing found it
had **no reachable UI path**: every one of the 1,324 seeded exercises came
in as `reps_weight` or `time` (the import heuristic never produces
`reps_bodyweight`, see docs/EXERCISE_DATA.md), and `CustomExerciseForm`
hardcoded `measurementType: 'reps_weight'` too. Fixed the same version,
before v0.0.6 was considered complete:

- `curatedEnrichment.ts` gained a `measurement_type_override` field, applied
  to push-up, pull-up, chin-up, chest dip, triceps dip, and inverted row —
  all exact, verified names in the seed dataset. "Bodyweight Squat" was
  explicitly requested but has no matching exercise in the dataset (the
  closest candidates — `bodyweight squatting row`, `bodyweight drop jump
squat` — are different exercises, not a plain bodyweight squat), so it
  was left alone rather than forcing a bad match, the same judgment call
  already made for "Bulgarian Split Squat" in v0.0.5.
- `CustomExerciseForm` gained a "How is this logged?" selector (Weight +
  Reps / Bodyweight Reps / Time / Distance — human-readable labels, never
  the raw enum) so a user can create a genuinely bodyweight custom
  exercise, not just weighted ones.
- No `additional_load` field was added for weighted bodyweight variants
  (weighted pull-ups, weighted dips) — explicitly deferred ("do not
  overbuild... unless the existing model already supports it cleanly," and
  it doesn't yet); `weight` stays unused/hidden for `reps_bodyweight`
  exercises exactly as it already was.
- No migration was needed for either backend, same "whole document"
  storage reasoning as everywhere else in this doc — this only changes
  which value gets written into an existing field, not the shape of any
  table/store.

## Eligibility (`pr-engine/eligibility.ts`)

A `PerformedSet` counts toward PRs only if:

- its session's `status === 'completed'` (`in_progress`, `discarded`, and
  `skipped` sessions never contribute, regardless of what sets they contain)
- its `set_type !== 'warmup'`

`working`, `drop`, `amrap`, and `failure` sets all count — each represents a
real completed effort. This is the one place a judgment call was made
without a strong existing signal either way; the handoff's own suggested
default (exclude warm-ups, include everything else) was followed.

A per-exercise entry in `WorkoutSession.skipped_exercises` does **not**
invalidate sets that were actually logged for that exercise before the skip
— the marker only means the slot wasn't fully completed as planned. Sets
that genuinely exist are genuine performance.

## PR kinds

| Kind            | Meaning                                                                                                             | Applies to `measurement_type` |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `max_load`      | Heaviest weight ever lifted, any rep count                                                                          | `reps_weight`                 |
| `rep`           | Most reps in one set, at any weight                                                                                 | `reps_weight`                 |
| `rep_range`     | Best weight at an **exact** observed rep count — one row per rep count that has ever occurred, not a hardcoded list | `reps_weight`                 |
| `estimated_1rm` | Highest Epley-estimated 1RM across qualifying sets                                                                  | `reps_weight`                 |
| `volume`        | Best single-**session** total (`sum(weight × reps)` for this exercise in that session), not a per-set value         | `reps_weight`                 |
| `bodyweight`    | Most reps in one set — same computation as `rep`, different kind tag so the UI never implies a weight               | `reps`, `reps_bodyweight`     |
| `timed`         | Longest single-set `duration_seconds`                                                                               | `time`, `distance_time`       |
| `distance`      | Longest single-set `distance_meters`                                                                                | `distance`, `distance_time`   |

`rep_range` is deliberately **exact-match only** (a 205×6 set does not also
update a "5-rep" record) — cross-rep inference is exactly what
`estimated_1rm` already does, so `rep_range` staying literal keeps the two
kinds from overlapping in what they claim to answer.

A `volume` PR has no single originating set (it's a sum across a session's
sets), but `PersonalRecord.source_set_id` is non-nullable — it's attributed
to the last qualifying set of that session, so `source_session_id` (the
field that actually matters for volume) is still exact.

## Estimated 1RM (`pr-engine/estimate1RM.ts`)

Epley: `weight * (1 + reps / 30)`, with one deviation — **a true 1-rep set
returns the load unchanged** rather than the formula's ~3.3% inflation at
`reps === 1`, per explicit requirement ("for a true 1-rep set, 1RM should
equal actual load"). Not computed above `E1RM_REP_CUTOFF = 12` reps — Epley
degrades badly at high rep counts, and a wrong-looking number is worse than
no number. All ATLAS screens use this one function; there is no second e1RM
formula anywhere.

## Tie behavior

Eligible sets are sorted ascending by `completed_at` before every
comparison, and the picking logic keeps the **first** item on a tie — so
two equal performances credit whichever happened earlier ("first
achieved"). Concretely: matching an existing PR in a later session does
**not** move `source_session_id` to the later session, and therefore does
not surface as a "new PR" on that later workout's completion summary
(`newPRsFromSession` filters on `source_session_id === thisSessionId`).
Only a _strictly_ better performance moves the record.

## Historical recalculation

`calculatePRs(sessions, exercise)` is a full, deterministic recompute from
scratch every time it's called — there is no incremental/mutable PR state
to get out of sync. Inserting an older session, a newer session, a
stronger historical session, or correcting existing data all "just work"
because the function has no memory of what it computed last time. This is
covered directly by tests in `packages/pr-engine/src/calculatePRs.test.ts`
("historical recalculation" describe block) and is also structurally
guaranteed for Program/template changes: `calculatePRs` never reads
`WorkoutTemplate`/`Program` data at all, so it is impossible for a template
edit to affect a PR.

Exercise replacement (today-only or Update Program scope, see v0.0.5) is
transparent to PR calculation: `replaceExercise` only ever changes
`planned_snapshot`, never `performed_sets`, and `calculatePRs` is always
called per `exercise_id` — sets logged before a replacement keep the
original id and contribute to the original exercise's history; sets after
point at the replacement and contribute to _its_ history. No special-casing
needed.

## Persistence & recalculation trigger

`apps/web/src/progress/recalculatePRs.ts`: on `handleFinish` in
`GymModeScreen`, every distinct `exercise_id` touched by the just-completed
session gets a full `calculatePRs` recompute, then an **upsert** (keyed by
`kind` + `reps`) against the exercise's existing stored `PersonalRecord`
rows — reusing row ids for unchanged keys rather than soft-deleting and
recreating everything, so a `PersonalRecord`'s id doesn't churn on every
workout. Stale keys (a rep count that no longer has a current record — not
a realistic case since completed-session sets are immutable, but handled
for correctness) are soft-deleted.

`ExerciseProgress` (the per-exercise Progress tab) computes PRs **live**
from history on every render rather than reading the persisted table — at
personal scale (dozens of sessions per exercise, not thousands) this is
sub-millisecond and guarantees the view can never show something stale.
`ProgressScreen` (the aggregate tab, potentially dozens of exercises)
reads the **persisted** table instead — the O(all-history) recompute that
would be cheap for one exercise is unnecessary work multiplied across
every exercise the user has ever touched, and a plain indexed read of
already-materialized data is the simpler, cheaper option at that scale.

## Charts

`apps/web/src/progress/TrendChart.tsx` is a hand-rolled SVG line chart —
**no charting dependency was added**. The chart needs here (a handful of
simple "value over session date" lines, personal-scale data, rarely more
than a few dozen points) didn't justify one: a dependency would mean
fighting its theming API to match Stone & Sage, adding to an already
size-flagged production bundle, and taking on an API surface far larger
than what five chart types need. `TrendChart` handles zero points (an
empty-state message), one point (a value/date pair, no line), and N points
(a polyline with per-point tooltips shown via click/focus, since SVG
`<title>` hover tooltips don't work reliably on touch). Revisit if a future
version needs zoom/pan, log scales, or datasets large enough that a
polyline stops being adequate.

Chart series (`packages/progress-engine/src/chartSeries.ts`) are one point
per session — the best (or, for volume, summed) qualifying value that
session — computed with the same eligibility rules as PRs.

## Workout completion integration

`GymModeScreen.handleFinish` recalculates PRs for every touched exercise,
then diffs the resulting `PersonalRecord[]` against the session id via
`newPRsFromSession` to populate `WorkoutSummary`'s "New PRs" section. This
never shows a PR that was only _tied_, per the tie-behavior rule above.

## Headline PR events (vNext Handoff 04A / 04A.1)

The `PersonalRecord` rows above are _detailed_ records — one per kind, per rep
count, per load, so one good bench session can leave a dozen — and they are only
ever the **current** bests: a record a later session beats leaves the table. The
number a person means by "6 PRs this week" is different, and it is a history:
how many exercise performances beat something. That lives in its own additive
store, `PersonalRecordEvent`, next to `personal_records` (which is unchanged).

| | `PersonalRecord` | `PersonalRecordEvent` |
| --- | --- | --- |
| What it is | the current best for one record slot | one headline PR: a performance that beat an earlier record |
| When it changes | replaced or removed as soon as it is beaten | kept; removed only when its source performance stops existing |
| Read by | Strength, PR history, the workout summary's "New PRs", the stall check | every "PRs" count (Today, Overview, Weekly Review) and the muscle Performance mode |

> One event = one exercise, in one completed session, in one equipment context
> (`training_location_id`), that **beat at least one record an earlier session in
> that context already held** — however many detailed records it beat.

- **Baseline is not a PR.** The first eligible session of an exercise in an
  equipment context is its baseline: it sets records (the first numbers) but
  beats nothing, so it is no event. Old history with no location is its own
  context; no gym is ever guessed. The same first-exposure index
  (`pr-engine/exposure.ts`) backs the weekly review's progressed/maintained
  counts and the muscle Performance mode, so they cannot disagree about what
  "first" means.
- **A record set for the first time is not beating one.** `calculatePRs` makes a
  row for every rep count and load ever used, so a lighter day at a load never
  used before "sets" a `rep_at_load` record. Beating an earlier record is the
  test, so that day is not an event (and `pr_kinds` lists only the kinds beaten).
  This is deliberately tighter than 04A's "holds any row" count; dropping the
  `existing.has(...)` filter in `derivePREventsForExercise` restores it.
- **Identity.** `personalRecordEventId(session, exercise, location)` =
  `pr-event:<session>:<exercise>:<location|none>`, so there is at most one event
  per combination and writing it again is an upsert, never a duplicate.
- **Content.** `pr_kinds` (distinct, ordered so `pr_kinds[0]` is the primary
  kind: `max_load`/`weighted_bodyweight`, `rep_at_load`, `estimated_1rm`,
  `rep`/`bodyweight`, `timed`/`distance`, then `rep_range`/`volume`),
  `achieved_at` (earliest record), `evaluator_version`, and `estimator_id` /
  `estimator_version` when an `estimated_1rm` record contributed. The detailed
  rows are not copied — they stay in `personal_records`. There is no
  `is_baseline` flag (it would always be false) and no `record_ids` (the rows
  are recomputed and their ids reused per slot, so stored ids would dangle).
  `equipment_context_id` is not stored: the PR engine scopes by
  `training_location_id` only, and an event follows exactly that boundary.

### Derivation

`derivePREventsForExercise` replays an exercise's history chronologically, per
context. For each later session it runs the existing `calculatePRs` over the
history up to and including that session; the records it attributes to the
session (ties go to the earliest, so only a strictly better performance moves a
record) whose slot already existed in the previous replay are the records it
beat. That before/after comparison of `calculatePRs`' own output is the only
definition of improvement — nothing compares one set to another, so there is no
second PR detector to drift.

An event depends only on the sessions before it, so a later, better session
**never changes an earlier event** (tested as a prefix property). Cost is
quadratic in one exercise's session count: ~75 ms for a lift done 400 times,
~0.7 s to replay 800 sessions in full. `ponytail:` if that ever matters, replay
only from the finished session onward — the prefix property makes that exact.

### Versioning

`PR_EVENT_EVALUATOR_VERSION` (`pr-events-1/brzycki-v1`) names the derivation and
the default e1RM estimator, so changing either changes the string. An event
stamped with an older version is history, not a cache: reconciliation never
rewrites or removes it because the evaluator or estimator changed. It is removed
only when its source performance no longer exists (a discarded session, or no
eligible sets left). A new evaluator may _add_ events for sessions the old one
did not recognize; it never deletes one.

### Keeping the ledger in step (`apps/web/src/progress/prEvents.ts`)

- **Live and backdated workouts.** `recalculatePRsForExercise` — the one place
  the post-session PR recompute runs, from `GymModeScreen.handleFinish`, which
  Log Past Workout also finishes through — also calls
  `reconcilePREventsForExercise`, so the ledger and the standing records update
  together, idempotently (finishing the same session again writes nothing and
  bumps no versions).
- **Historical backfill and self-healing.** `reconcilePREvents(storage)` walks
  every exercise's history, adds/updates/removes per
  `planPREventReconciliation`, and returns counts plus `skipped` — an exercise in
  completed sessions that is not in the exercise library is reported
  (`EXERCISE_UNRESOLVED`) and its stored events are left exactly as they are,
  never invented. `ensurePREventsUpToDate` runs it once per launch (memoized per
  storage instance, like `ensureBenchmarksSeeded`); Today and Progress load
  events only through `loadPREvents`, which waits for it. The first launch after
  the upgrade builds the whole history; every later one finds nothing to change.
  It also repairs anything that changed history outside the finish path — for
  example "Replace Existing" in Log Past Workout discards a completed session,
  which takes its events with it at the next reconcile.
- **Restore.** A backup carries the events (`personal_record_events`, optional
  like `workout_occurrences`); a restore then forces a reconcile, which rebuilds
  them from the restored sessions for an older backup that has none.

### Storage

Additive: Dexie `version(6)` (`personalRecordEvents`, no upgrade function), SQLite
migration `0006_add_personal_record_events.sql` (same `(id, deleted_at, data)`
shape), both adapters, backup/restore. Nothing existing is rewritten; a database
that already holds history simply starts with the store empty. Tested with a
real v5→v6 Dexie upgrade and the Rust migration round-trip.

### Consumers

`buildWeeklyReview` takes `prEvents` (not `personalRecords`): `pr_count` and
`exercises_progressed` come from the events in the period — Today's "This Week"
and the Overview's review card read that one figure, and
`apps/web/src/progress/singleEvaluator.test.ts` fails if either screen feeds the
review anything else or counts rows itself. `exercisePerformanceState` reads
events for "progressing". The stall check (`detectStagnation`) still reads the
standing records: it flags a stall from "no record among the last K exposures",
and moving it to events would change _when_ it first fires on a short history
whose first session is the baseline — a behavior change this handoff does not
make. The detail surfaces (Strength record markers and PR history, the workout
summary's "New PRs") still list every detailed record.

### Limits

- Events are derived from history as it stands, so editing or replacing history
  re-derives current-version events (an event follows the data); older-version
  events are frozen until their session disappears.
- The launch reconcile replays all history once per launch. `ponytail:` skip it
  when a cheap fingerprint of the completed sessions is unchanged if it ever hurts.
