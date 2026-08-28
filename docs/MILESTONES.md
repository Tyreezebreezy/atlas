# Milestones (v0.0.7)

`packages/milestone-engine` turns completed workout history into achieved
milestones — built-in and custom. Pure and storage-independent, same
division as `pr-engine`: persistence and the evaluate-on-finish trigger live
in `apps/web` (`src/progress/evaluateMilestonesForSession.ts`).

## Achieved once, never re-evaluated

This is the one deliberate difference from PRs. A PR tracks "current best"
and is fully recomputed from scratch on every call. A milestone tracks "was
this ever reached" — once `achieved_at != null`, `evaluateMilestone` returns
the **same object reference**, forever. `evaluateMilestones.test.ts` asserts
this with `toBe` (reference equality), not just `toEqual`, specifically so
callers can cheaply diff `before`/`after` arrays with `!==` to find what
actually needs a database write (`evaluateMilestonesForSession.ts` does
exactly this).

While `achieved_at` is still null, evaluation is a full recompute over all
eligible history every time — the same "no incremental state to get out of
sync" guarantee `calculatePRs` makes, so backfilling an older qualifying
session correctly assigns the earlier achievement date. Inactive
(`active: false`) milestones and milestones with no `exercise_id` are always
skipped.

## Dimensions

Eight dimension types were required; `Milestone.dimension` covers exactly these
via nullable `target_*` fields (a new milestone is a data row, never a code
change):

| Dimension               | Checked against                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `weight`                | `set.weight >= target_weight`                                                                                                                                            |
| `reps`                  | `set.reps >= target_reps`                                                                                                                                                |
| `weight_and_reps`       | both of the above, same set                                                                                                                                              |
| `volume`                | session-summed `weight × reps` for the exercise `>= target_volume`                                                                                                       |
| `duration`              | `set.duration_seconds >= target_duration_seconds`                                                                                                                        |
| `distance`              | `set.distance_meters >= target_distance_meters`                                                                                                                          |
| `bodyweight_multiplier` | `set.weight >= bodyweightAtSet * multiplier` — `bodyweightAtSet` resolved per-set against `BodyMeasurement` history, see "Bodyweight-relative resolution (v0.0.8)" below |
| `custom`                | `set.weight >= target_weight`, where `target_weight = reference_value * multiplier`, computed once at creation (e.g. "Squat Six Girlfriends" = 100 lb × 6)               |

`custom` precomputes `target_weight` once at creation because it's a
deliberately fixed number chosen by the user, unrelated to their own
bodyweight. `bodyweight_multiplier` cannot do the same — see below.
`volume` is evaluated per-session rather than per-set (`findVolumeMatch`),
since no single set carries a session total.

## Bodyweight-relative resolution (v0.0.8)

Before v0.0.8, `bodyweight_multiplier` had no bodyweight history to read —
the user typed their own current weight into `reference_value` at creation
time, same mechanism as `custom`, and that snapshot never changed. Now that
`BodyMeasurement` has a real entry UI (docs/BODY_COMPOSITION.md), the target
is resolved dynamically: `evaluateMilestone` calls
`resolveBodyweightForDate(bodyMeasurements, set.completed_at)` for every
candidate set and compares against `bodyweightAtSet * milestone.multiplier`
— per the documented selection rule (latest measurement on or before the
set's date; if none, the latest measurement available at all; if no
measurement exists anywhere, the milestone cannot be evaluated yet).
`createMilestone` no longer precomputes `target_weight` for this dimension
at all — it starts `null` and stays that way until achievement.

The "do not retroactively alter achieved status when future weight
measurements change, preserve the value used when achievement occurred"
requirement falls out of the existing achieved-once-never-re-evaluated rule
for free, but with one addition: the resolved `bodyweightAtSet * multiplier`
at the moment of the matching set is **frozen into `target_weight`** as part
of achievement, alongside `achieved_at`/`origin_session_id`/`origin_set_id`
— so a user can see exactly what target they hit, and it can never drift
even if they log a much lower (or higher) weight afterward. Verified
directly (not just unit-tested): achieved a "2x Bodyweight Deadlift"
milestone with a 178 lb logged bodyweight (target froze at 356 lb), then
logged a 150 lb measurement and finished another workout to force a second
evaluation pass — `target_weight` and `achieved_at` were provably unchanged
(same `version`, same timestamp) both in the browser and in the packaged
Tauri+SQLite build.

## Built-in milestones

`builtInMilestones.ts` lists a restrained, curated set — 19 entries across
Bench Press (135/185/225/225-for-5/275/315 lb), Push-Ups (10/25/50/75/100),
Pull-Ups (1/5/10/15/20), and Plank (60/120/180 sec) — not hundreds of
achievements. `ensureBuiltInMilestonesSeeded` mirrors
`ensureExercisesSeeded`'s pattern exactly: no-op once any built-in milestone
exists, name-matched against the current exercise library, silently skips a
spec whose exercise name doesn't resolve (same resilience as
`curatedEnrichment`'s substitute lookup) rather than throwing. "Bodyweight
Squat" and a plain "Plank" were considered and dropped from the built-in
list for the same reason documented in docs/PRS.md — no exact matching
exercise name exists in the seed dataset for the former, and the latter is
seeded under "weighted front plank" (reclassified to `time` in v0.0.7, see
docs/EXERCISE_DATA.md) rather than a separate name.

## Custom milestone builder

`apps/web/src/progress/MilestoneForm.tsx` reuses the existing
`ExercisePicker` component unmodified for exercise selection, then exposes
all 8 dimensions via a human-readable "Type" select (never the raw enum
value) with only the relevant numeric field(s) shown per dimension. Every
dimension requires an exercise — even `custom`/`bodyweight_multiplier`,
since `evaluateMilestone` unconditionally skips any milestone with no
`exercise_id`, and there'd otherwise be no set to check the target against.
`bodyweight_multiplier` only asks for a multiplier (v0.0.8) — no reference
value field, since bodyweight now resolves automatically from logged
`BodyMeasurement` history instead of being typed in once.

## Workout completion integration

`GymModeScreen.handleFinish` calls `evaluateMilestonesForSession` alongside
the existing PR recalculation. It persists only the milestones that changed
(the `!==` diff above) and returns the newly-achieved subset, which
`WorkoutSummary` renders in a bronze-accented "Milestones" section
(`--atlas-color-bronze`, already an existing Stone & Sage token) with a
restrained fade/rise entrance animation gated behind
`@media (prefers-reduced-motion: no-preference)` — no animation at all when
the user's OS prefers reduced motion.

`ProgressScreen` shows achieved milestones (bronze) and active/unachieved
ones (plain) in a "Milestones" section, a monthly achieved count alongside
the existing PR count, and folds milestones into the same "Recent" feed as
PRs (sorted by date, mixed, capped at 5) rather than a separate list.
