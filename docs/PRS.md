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
