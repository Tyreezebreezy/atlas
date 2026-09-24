# Benchmarks (v0.0.7)

`packages/benchmark-engine` compares a user's own performance against
population norms — a fundamentally different concept from PRs (your own
history) and milestones (a fixed goal you either have or haven't hit yet).
There is no "achieved" event for a benchmark and nothing is evaluated on
workout finish; a comparison is computed live, wherever it's shown, against
whichever `Benchmark` rows currently exist.

## Authority: the compatibility gate (Handoff 04A)

Every current, user-facing comparison comes from `evaluateBenchmarkStrict`
(`evaluateBenchmarkStrict.ts`), the only evaluator the app calls. A claim needs
a compatible match on everything the registry records; if any of it is missing
or does not line up, the answer is a typed
`NO_COMPATIBLE_BENCHMARK { code, reason }` — never an estimate.

| Check (in this order)                                                                                            | Code                                   |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| a benchmark definition exists                                                                                    | `NO_BENCHMARK`                         |
| `evaluation_method` is `strict_anchor`                                                                           | `LEGACY_METHOD`, `METHOD_UNSUPPORTED`  |
| `source`, `dataset_version`, `benchmark_version` are present                                                     | `PROVENANCE_INCOMPLETE`                |
| `test_protocol_id` is present, resolves to a `TestProtocol`, and `matchProtocol` accepts the result's type       | `PROTOCOL_INCOMPATIBLE`                |
| `unit` is present and equals the result's unit                                                                   | `UNIT_INCOMPATIBLE`                    |
| `comparison_population`, `geography`, `population_type` are present (and equal the person's named group, if any) | `REFERENCE_INCOMPATIBLE`               |
| an age-banded row needs the person's age, known and inside the band                                              | `AGE_INCOMPATIBLE`                     |
| the row has thresholds, and the result reaches the lowest one                                                    | `NO_THRESHOLDS`, `BELOW_LOWEST_ANCHOR` |

With a match it reports the **highest documented threshold reached**: against
P50 = 33 / P70 = 41 / P80 = 47 / P90 = 57, a result of 45 is "stronger than
70%", not an invented 76%. The result also carries the anchor's own value and a
`provenance` (`method`, `dataset_version`, `benchmark_version`). There is
deliberately no fallback to interpolation, and the Details disclosure on a card
shows the source, protocol, reference population, threshold reached and
versions.

`Benchmark.evaluation_method` (`BenchmarkEvaluationMethod`, additive):

- `strict_anchor` — the thresholds are documented anchors. The only method that
  yields a claim today.
- `validated_model` — reserved for an explicitly validated continuous model.
  None exists and nothing evaluates it, so it fails closed.
- `legacy_interpolated` — what an _absent_ value means: every v0.0.7 row
  (ATLAS-modeled points meant for interpolation). A compatibility label only,
  never a current claim; stored rows are never rewritten to say so.

**What this means for the seeded data.** All five seeded rows are v0.0.7 rows
(and each is also age-banded, protocol-less, unit-less and
`benchmark_version`-less), so **none currently yields a comparison**. For an
exercise the person has a matching PR for, the Benchmarks pane shows the
restrained "No verified comparison available for this result." with the reason
under Details. That is the intended, honest outcome: the rows are modeled curves
(grade D), not documented anchors. A comparison lights up only once a definition
with `evaluation_method: 'strict_anchor'` and the full registry metadata exists
and — for an age-banded one — ATLAS knows the person's age. Neither is seeded
or invented here; a benchmark dataset pack and profile input are separate work.

**History.** Comparisons were always derived live, so no legacy result was ever
persisted and there was nothing to migrate. On the milestone side,
`BenchmarkAchievementInput` now requires an `evaluation` provenance whose
`method` type excludes `legacy_interpolated`, and an achieved
`benchmark_threshold` milestone keeps it in `achieved_benchmark_evaluation`. An
achieved milestone is never re-evaluated (the standing rule), so a later
dataset, method or standing neither revokes nor rewrites it.
`benchmarkAchievements` stays unwired in the live workout-finish path
(`evaluateMilestonesForSession.ts`).

## Percentile interpolation (`interpolatePercentile.ts`) — legacy

**Legacy (Handoff 04A): no user-facing code calls this.** It is kept, marked
`@deprecated` and isolated, so v0.0.7 behavior stays readable and testable;
`apps/web/src/progress/singleEvaluator.test.ts` fails if the web app imports it.
What follows describes that legacy behavior.

Deterministic linear interpolation between the `(percentile, value)` points
in a `Benchmark.percentile_thresholds` map (e.g. `{ "50": 20, "90": 30 }`).
A value outside the known range is **clamped, never extrapolated** — the
result carries `belowMinimum`/`aboveMaximum` flags rather than a
fabricated percentile past what the underlying data actually supports.

## Display formatting (`formatPercentile.ts`)

Clamped to `[1, 99]` either way — a benchmark comparison never claims "100%"
or "0%". Percentile ≥ 90 (or `aboveMaximum`) reads as `"Top N%"`; everything
else reads as `"Stronger than P% of {population}"`. Never renders fake
decimal precision (`"87.394284%"`) — always rounded to a whole percent.

## Evidence grading

`Benchmark.evidence_grade` (`A`–`D`) is internal metadata, **never shown on
the primary motivational card** — it exists so a future maintainer (or this
session, revisiting the data) can tell a nationally-representative dataset
apart from an ATLAS-modeled approximation. `A` = nationally representative
study; `B` = strong population study or registry; `C` = fitness-norm or
convenience-sample data; `D` = ATLAS-modeled from qualitative or partial
sources. The optional `<details>`/`<summary>` disclosure on each benchmark
card (native HTML, no custom accordion component) surfaces `source` and
`sample_description` for a curious user, but never the letter grade itself.

## Seeded dataset (`benchmarkData.ts`)

Researched via live web search rather than relying on memory alone (per the
v0.0.7 handoff's explicit instruction), 2026-08-28. Every row here is graded
**D** — none of the five is a verbatim copy of an official percentile
table; each is an ATLAS-modeled curve anchored to real published summary
statistics or category anchors that search actually turned up. Full
per-metric reasoning, source URLs, and what was found vs. modeled live in
each `BenchmarkSpec`'s `source`/`sampleDescription`/`method`/`notes` fields
— summarized:

| Metric               | Exercise                   | Anchor                                                                                 |
| -------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `pushups`            | push-up                    | ACSM 5th ed. (2024) category anchors (~17-21 "average", 29+ "excellent")               |
| `pullups`            | pull-up                    | Commonly-cited fitness-test category norms (weakest sourcing of the five)              |
| `bench_press_1rm_lb` | barbell bench press        | Strength Level aggregated lift data, 48.7M+ lifts (2014-2026), 180 lb reference lifter |
| `grip_strength_kg`   | _none_ (no ATLAS exercise) | NHANES-derived normative data via a JOSPT 2018 peer-reviewed paper, ages 25-29         |
| `plank_seconds`      | weighted front plank       | Two independent collegiate (18-25) plank-hold studies                                  |

`grip_strength_kg` has `exercise_id: null` and is seeded for completeness
but not surfaced in the v0.0.7 UI — there's no ATLAS exercise a grip-strength
dynamometer reading could attach to as a `PerformedSet`.

None of the source tables are reproduced verbatim or in full — only the
handful of percentile points ATLAS needs, per the explicit instruction not
to copy large copyrighted tables.

## Which PR proves which benchmark

`apps/web/src/progress/BenchmarkComparisons.tsx` maps each metric to the PR
kind that demonstrates it and the unit that PR is in (`BENCHMARK_OBSERVATION`):
`pushups`/`pullups` → the exercise's `bodyweight`-kind PR (most reps in one
set), in reps; `bench_press_1rm_lb` → `estimated_1rm`, in lb; `plank_seconds` →
`timed`, in seconds. A benchmark card only appears once the user has a matching
PR for that exercise — there's nothing to compare against otherwise. The
result is then run through the gate above (`benchmarkComparisons.test.ts`).

## Age and population

`Benchmark.age_min`/`age_max`/`age_group` and `comparison_population` exist
and `findBenchmark` already implements age-bracket matching with a fallback
to an age-unrestricted row — but ATLAS collects no user age anywhere yet, so
in practice every lookup takes the age-unrestricted fallback path today. Since
Handoff 04A the gate goes further: an age-banded row cannot yield a claim at all
while the person's age is unknown.
Bench press's percentiles are also **absolute weight, not bodyweight-relative**
— a documented v0.0.7 simplification (real strength standards normally
condition on the lifter's own bodyweight; ATLAS's do not yet), not an
oversight.

## Versioning and recomputation

`Benchmark.dataset_version` (currently `atlas-benchmarks-2026.1`) makes a
comparison's provenance recomputable rather than baked-in:
`evaluateBenchmarkStrict` and `formatPercentileDisplay` are always called live
against whichever `Benchmark` rows are currently active, never stored on a
`WorkoutSession` at the time of achievement. `ensureBenchmarksSeeded` is a
no-op once any row of the _current_ `dataset_version` exists; bumping the
constant and shipping a new `BENCHMARK_SPECS` table (a future version, once
better-sourced data is found) reseeds cleanly without a migration, and old
comparisons naturally recompute against the new dataset the next time
they're shown — nothing needs an explicit backfill step.
