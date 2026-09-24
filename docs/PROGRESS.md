# Progress

vNext Handoff 03B. Progress is six sections behind a horizontally scrolling
tab row (`ProgressNav`, tabs semantics, arrow/Home/End keys):

| Section | What it answers | Reads |
| --- | --- | --- |
| Overview | What happened, and where am I progressing? | `progressOverviewState`, `buildWeeklyReview`, `recentProgress`, `buildMuscleMapViewModel` |
| Strength | Is this exercise getting stronger? | `buildStrengthView`, `trainedExercises` |
| Muscles | Where is the work going? | `buildMuscleMapViewModel` |
| Body | What is my weight doing? | `weightRollingAverageSeries` |
| History | What did I do? | (unchanged data model; grouped by month) |
| Milestones | What have I reached, and what am I after? | `groupMilestonesByCategory` |

**Rule:** the UI never re-derives PR, e1RM, stagnation, weekly-review,
equipment or progression logic, and the Body Map renderer never computes
analytics. Views call the domain functions below; anything that is more than
wording lives in a package with tests.

## Overview scales with history

`progressOverviewState(completedWorkouts)`: `empty` (0) → a plain sentence;
`early` (1–5) → workout count, recent progress, milestones; `established`
(6+, roughly two weeks of a 3-day program, when most exercises have been done
twice) → weekly review, recent progress, muscle preview, body weight, activity.
A card with nothing to say is not rendered; no trend is drawn from one point.

The weekly review is `buildWeeklyReview()` output as-is (sessions x / planned,
progressed / maintained / stalled, PRs, milestones, weekly body-weight
average). Zero counts and absent averages are omitted, never zero-filled.
"This week", "planned sessions" and "a week of the program" come from one place
(`program-engine/weekPlan.ts`), shared with Today.

## Strength: reps at load vs estimated 1RM

`buildStrengthView(sessions, exercise, { load, trainingLocationId })` returns
the metrics that exist for the exercise, the one it opens on, PR markers
(`record_indices`), the recurring loads, and the equipment contexts.

- **Estimated 1RM** uses the same estimator as PRs (Brzycki, sets of 1–10
  reps). A set above the supported range produces *no* point, and the metric
  says how many sessions were left out — it is never faked.
- **Reps at load** is the plain fact "how many reps at exactly this weight".
  It is the default when the last two sessions topped out at the same weight
  (an equipment ceiling: 170 lb × 12 → 14 → 16 → 18) or when no session has a
  supported set.
- Weight-bearing history is never blended across equipment contexts: once an
  exercise has history in more than one `training_location_id`, the view scopes
  to one at a time. (Today no UI records a location on a session, so this is
  dormant but tested.)

## Muscles

`buildMuscleMapViewModel` answers four different questions, never one blended
score:

| Mode | Question | Value |
| --- | --- | --- |
| Trained | How often? | workouts with the muscle as a primary target |
| Volume | Where did working sets go? | primary-target working sets |
| Focus | What does the program plan for a week? | planned sets and share of the week |
| Performance | How are the exercises for this muscle doing? | progressing / stable / stalled / not enough data |

V1 volume rule: a set counts once, fully, for each primary muscle; assisting
muscles are tallied separately and never become fractional sets. Group counts
count a set once per group (bench press hits Upper and Mid Chest: one set of
chest work). Performance reuses the weekly review's signals (`detectStagnation`,
current PRs); a baseline session's PRs are not progress; the roll-up to a
muscle is stalled > progressing > stable > not enough data with the mix always
shown. It is exercise performance, never "muscle growth".

The ranked list beside the map prints every value in words, so nothing is read
from color alone.

## Body

Weight is primary. The 7-day average (`weightRollingAverageSeries`) is drawn as
a quiet dashed line and only when a window holds ≥3 weigh-ins
(`ROLLING_MIN_WEIGH_INS`). Body-composition fields are optional, collapsed and
labeled as estimates. Charts never zoom noise into a trend (`minSpan`).

## Milestones

Categories: Performance (built-in lift goals), Benchmark, Consistency, Program,
Body, User-defined (the owner's own lift goals). Empty categories are not
rendered; a milestone appears once.

- **Program completion is hidden.** Handoff 02 defines it as "every ProgramDay
  run at least once", which is not a finished training block, so
  `isMilestoneVisible` excludes it everywhere (including the Overview and weekly
  review counts) until a real block/cycle model exists.
- **Benchmarks stay contained.** The existing comparison cards moved to their
  own pane in `BenchmarkComparisons.tsx`, still using the legacy
  `interpolatePercentile` — the only place that calls it. No new benchmark
  claims or seeding; reconciling with `evaluateBenchmarkStrict` is a separate
  handoff.

## Known debt

- **"PRs" counts every PersonalRecord row** (max load, e1RM, per-rep-count,
  per-load, volume), so one progressing exercise contributes many. The number
  is shown small and consistently with Today; a headline-PR definition belongs
  in a domain handoff.
- `--atlas-space-5` was never defined; four legacy rules used it. The
  exercise-progress ones are fixed; `.atlas-onboarding__panel`'s `padding`
  still uses it (so the onboarding card has no padding of its own).
- `describeMilestoneProgress` has no partial progress for consistency/body/
  benchmark goals; cards state the target instead.
