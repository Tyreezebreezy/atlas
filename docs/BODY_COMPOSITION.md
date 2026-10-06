# Body Composition (v0.0.8)

`packages/body-composition` turns logged `BodyMeasurement` history into
chart series and a bodyweight-lookup used by milestone evaluation. Pure and
storage-independent, same division as every other engine package —
persistence lives in `apps/web` (`src/body/BodyScreen.tsx`).

## The entity was already there

`BodyMeasurement`, its storage repository, its Dexie store, and its SQLite
table have existed since v0.0.1 — the same "entity exists, unused until an
engine gives it real logic" pattern as `PersonalRecord`/`Milestone`/
`Benchmark` in v0.0.6/v0.0.7. v0.0.8 added exactly one field (`notes`) and
no migration was needed, same "whole document" storage reasoning
established throughout this project.

## Manual entry

`apps/web/src/body/BodyMeasurementForm.tsx` exposes every metric the entity
supports (weight, body fat %, muscle mass, water %, fat mass, lean mass,
visceral fat, bone mass, BMR, notes) rather than only the two named as a
minimum (weight, body fat %) — the handoff's "minimum" reads as a floor, not
a ceiling, and leaving the rest of an already-schema-supported entity
unreachable through the UI would repeat the exact `reps_bodyweight` gap
found and fixed in v0.0.6 (docs/PRS.md). All fields beyond `date` are
optional, but a measurement must carry **at least one number**, and what is
typed is bounded (`bodyMeasurementProblem`, `@atlas/body-composition`): every
number is above 0 and at most 1,500 (weight and the lb masses), 100 (body fat %,
water %, visceral fat) or 10,000 (BMR), and the date is a real day that has
happened. The form states the reason inline instead of saving. (It used to save
anything -- an empty row, -5 lb, 99,999 lb, 400 % body fat, a future date -- and one
such row stretched the trend chart's axis until the real data was a flat line.)
A single blank field still means "not measured".

## Selection rule (`resolveBodyweightForDate`)

The bodyweight to use for a given date: the latest measurement on or before
that date; if none exists (e.g. backfilling a workout logged before ever
weighing in), the latest measurement available at all, even if it postdates
the target. Returns `null` only when no measurement carries a weight
anywhere — callers (milestone evaluation) treat that as "cannot be evaluated
yet," never as zero. This is the one piece of real logic in the package
worth a dedicated, tested function rather than inline CRUD; see
docs/MILESTONES.md "Bodyweight-relative resolution" for how milestone
evaluation calls it per-set and freezes the resolved value at achievement.

## Charts

`weightSeries`/`bodyFatSeries` (`bodyMeasurementSeries.ts`) reuse
progress-engine's `ChartPoint` shape unchanged — `BodyMeasurement.id` fills
the `sessionId` slot, which `TrendChart` only ever uses as a React key and
tooltip grouping, never as an actual session reference. No new charting
code, no new dependency: the existing hand-rolled SVG `TrendChart`
(docs/PRS.md "Charts") renders body-composition trends exactly as it
renders PR trends.

**A real bug found and fixed during runtime testing**: `TrendChart`'s date
label formatter (`formatDateShort`) called `new Date(iso)` directly, which
is safe for the full timestamp strings PR series always used
(`WorkoutSession.completed_at`) but silently wrong for the plain
`"YYYY-MM-DD"` date-only strings `BodyMeasurement.date` uses — `new
Date("2026-07-01")` parses as UTC midnight, and `toLocaleDateString()` in
any timezone behind UTC renders that as the previous day. A measurement
logged for "Jul 1" displayed as "Jun 30" on the chart (while the History
list below it, which parses dates manually, correctly showed "Jul 1, 2026"
-- the mismatch is what caught it). Fixed once in the shared
`formatDateShort`, not in the new body-composition call site, so any future
series producer that also passes a date-only string is safe automatically.

## Body screen

`apps/web/src/body/BodyScreen.tsx` lives under the "More" tab (alongside
History and Settings) rather than as a sixth primary tab or inside Progress
— body composition is a related but distinct concept from workout Progress,
explicitly "separate from Gym Mode." It shows weight/body-fat trend charts,
a chronological history list (most recent first) with every non-null metric
and any notes, and a "+ Log Measurement" button. No editing or deleting a
past measurement yet — out of scope for this version, same as `ExerciseNote`
never got edit/delete before it needed it.
