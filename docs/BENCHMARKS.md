# Benchmarks (v0.0.7)

`packages/benchmark-engine` compares a user's own performance against
population norms — a fundamentally different concept from PRs (your own
history) and milestones (a fixed goal you either have or haven't hit yet).
There is no "achieved" event for a benchmark and nothing is evaluated on
workout finish; a comparison is computed live, wherever it's shown, against
whichever `Benchmark` rows currently exist.

## Percentile interpolation (`interpolatePercentile.ts`)

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

`apps/web/src/progress/ProgressScreen.tsx` maps each metric to the PR kind
that demonstrates it (`BENCHMARK_PR_KIND`): `pushups`/`pullups` → the
exercise's `bodyweight`-kind PR (most reps in one set), `bench_press_1rm_lb`
→ `estimated_1rm`, `plank_seconds` → `timed`. A benchmark card only appears
once the user has a matching PR for that exercise — there's nothing to
compare against otherwise. This mapping is a small UI-level lookup table,
not engine logic, so it isn't unit-tested separately; it's exercised by the
same real browser/Tauri runtime pass as the rest of v0.0.7.

## Age and population

`Benchmark.age_min`/`age_max`/`age_group` and `comparison_population` exist
and `findBenchmark` already implements age-bracket matching with a fallback
to an age-unrestricted row — but ATLAS collects no user age anywhere yet, so
in practice every lookup takes the age-unrestricted fallback path today.
Bench press's percentiles are also **absolute weight, not bodyweight-relative**
— a documented v0.0.7 simplification (real strength standards normally
condition on the lifter's own bodyweight; ATLAS's do not yet), not an
oversight.

## Versioning and recomputation

`Benchmark.dataset_version` (currently `atlas-benchmarks-2026.1`) makes a
comparison's provenance recomputable rather than baked-in:
`formatPercentileDisplay`/`interpolatePercentile` are always called live
against whichever `Benchmark` rows are currently active, never stored on a
`WorkoutSession` at the time of achievement. `ensureBenchmarksSeeded` is a
no-op once any row of the _current_ `dataset_version` exists; bumping the
constant and shipping a new `BENCHMARK_SPECS` table (a future version, once
better-sourced data is found) reseeds cleanly without a migration, and old
comparisons naturally recompute against the new dataset the next time
they're shown — nothing needs an explicit backfill step.
