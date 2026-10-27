# Progression, Set Semantics, and Rest (v0.2.0)

Deterministic, not an AI recommendation system: same inputs always produce
the same target and the same explanation, no randomness, nothing inferred
from a model. See `packages/program-engine/src/progressionDecision.ts` for
the full algorithm this document describes.

## Progression policies

```ts
type ProgressionPolicyKind = 'none' | 'double_progression' | 'linear_load' | 'timed';
```

One shape (`ProgressionPolicy`) covers all four kinds rather than a union
type per kind — `load_increment` (double progression's post-ceiling bump,
or linear load's per-session bump) and `duration_increment_seconds` /
`duration_ceiling_seconds` (timed only) sit unused when irrelevant to the
configured kind. Not a plugin system: a fifth kind is still a code change
in `progressionDecision.ts`, deliberately, per the handoff's "do not
overbuild a plugin language yet."

**Assignment**: `Program.default_progression_policy` (weakest) →
`PlannedExercise.progression_policy` (wins outright when set) — see
`effectiveProgressionPolicy()` in `packages/program-engine/src/progressionPolicy.ts`.
Absent/null at either level means "no opinion here"; only the final
fallthrough to `NO_PROGRESSION` actually means "none."

### Double progression

Advances only once **every** logged set reaches `target_reps_max` from the
_previous_ session (its own snapshotted target, read from
`previousSession.planned_snapshot`, never today's in-memory target) — one
set topping out the range is not enough. Example:

```
100×10, 100×10, 100×9  (target 8-12)   -> held at 100
100×12, 100×12, 100×12 (target 8-12)   -> advances to 105×8-12
```

### Linear load

Advances by `load_increment` after a session where every set met at least
`target_reps_min`. A session that didn't meet the floor holds
(`previous_result: 'failed_held'`) rather than continuing to add weight —
"failed sessions should not blindly continue adding weight."

### Timed

Advances `target_duration_seconds` by `duration_increment_seconds` once
the previous target was met, stopping (holding, not erroring) at
`duration_ceiling_seconds` — "up to a defined ceiling before another
progression mechanism is required."

### Bodyweight and the ceiling

`progressableLoadField(exercise)` picks which field actually progresses:
`target_weight` for `reps_weight`, `target_external_load` for
`reps_bodyweight`, or nothing for a pure calisthenic movement with no
external load ever configured. Hitting the ceiling with **no** load field
to increment produces `previous_result: 'suggest_advance'` instead of
`'advanced'` — the target is left unchanged and the decision's
`decision_summary` suggests an extra set, added load, or a harder
variation. ATLAS never silently swaps in a different exercise; a
suggestion is surfaced, never auto-applied.

Weighted bodyweight (a weighted pull-up) tracks its added load via
`PerformedSet.external_load` / `PlannedExercise.target_external_load` —
fields kept deliberately separate from `weight`/`target_weight`, which
mean a barbell/dumbbell/machine load for a `reps_weight` exercise. A
`reps_bodyweight` set's `weight` is always `null`, never a fake `0`.

Per-side (unilateral) targets are read exactly as stored — nothing here
multiplies or halves a rep count, so `target_reps_min/max` stays whatever
per-side convention the rest of the codebase already uses.

## Target provenance ("Why?")

Every resolved target carries a `ProgressionDecision`:

```ts
interface ProgressionDecision {
  policy: ProgressionPolicyKind;
  previous_session_id: string | null;
  previous_target: ProgressionTargetSnapshot | null;
  previous_result: ProgressionResult; // first_time | held | advanced | failed_held | deload_excluded | suggest_advance
  decision_summary: string;
  resulting_target: ProgressionTargetSnapshot;
  computed_at: string;
}
```

Structured evidence, not prose to regenerate later — the UI (Gym Mode's
"..." menu → "Why this target?", `ExerciseContextSheet.tsx`) reads these
fields directly rather than re-deriving an explanation from scratch.

**Snapshot immutability**: `PlannedExercise.progression_decision` is
populated only once, by `applyProgressionToSession()`
(`packages/program-engine/src/applyProgressionToSession.ts`), immediately
before `startWorkoutSession()`. It then rides into
`WorkoutSession.planned_snapshot` via the snapshot copy that mechanism
already made since v0.1.1 — editing the Program or its policy afterward
can never rewrite a session that already started, the same guarantee
`planned_snapshot` has always given the rest of the target fields.

## Equipment constraints and session context (vNext Handoff 01 / 04B)

A target is held to what the equipment can actually load. The same code path
decides it in both places it is shown, and screens never decide a load themselves
(`singleEquipmentAuthority.test.ts` fails if one imports a load primitive):

- **Live "Today" line** — `recommendProgression` (`recommendProgression.ts`).
- **The target stamped at session start** — `decideWithinEquipment`, which asks the
  same function and adopts only what it changed.

**Which equipment.** `effectiveExerciseEquipment`: the machine chosen for the
exercise in this workout, else the one remembered for the exercise at this
workout's place. Neither → no constraint, never "at the maximum" (the owner is
never forced to configure a gym). An instance in kg is not applied to lb history.

**What constrains** (loads as described in DATA_MODEL.md "Equipment instances"):

- exact list or range — the desired load if the equipment has it, else the next
  real load above the current one; never an arithmetic value it cannot produce;
- maximum only — the desired load if it fits under the maximum, else the maximum
  itself; at the maximum nothing further. No step below the maximum is invented;
- unknown — nothing constrains.

**At the ceiling**, rep progression takes over, one rep at a time toward the
policy's `ceiling_reps_max` (`increase_reps`, reason "Max available load"); when
load and reps are both exhausted the answer is `review` ("Load and reps at their
limit"), never an added set. `max_acceptable_load_jump` still turns an oversized
jump into rep progression (`NEXT_LOAD_TOO_LARGE`).

**One universal cap.** Whatever path produced a load, a recommendation is never
above the equipment's known maximum (`cappedAtMaximum`) — including a load carried
over unchanged from heavier equipment elsewhere (170 on the Main Gym's machine, a
120 lb machine today).

From the tests: an 80 lb dumbbell rack never yields 85, from 75 or from 80; a
170 lb machine at 170 × 15 progresses reps (170 × 16) rather than a load that does
not exist; a second gym with 120 lb dumbbells lets the same program progress past
80; an instance with no loads never pretends to have a maximum.

**One-time maximum question.** After the same top load has been reached in at
least `MAX_CONFIRMATION_MIN_SESSIONS` (3) completed sessions on an instance that
has no loads and no maximum, the owner is asked once "Is 170 lb the maximum on
this machine?". Yes records `max_load`; No / not sure records
`max_prompt_dismissed_at` and it is never asked again for that instance. A maximum
is never inferred.

**Baseline and "Last".** `sessionsPreferringContext` (`pr-engine/context.ts`):
progress from, and compare with, the same machine at the same place when the
exercise has been done there; otherwise from all history, so a new machine or a
second gym starts from the program rather than a blank page. Records, headline
events and Strength never fall back like this.

**Session start.** `applyProgressionToSession(..., contextFor)` takes, per exercise,
the machine it will be on and the history to progress from
(`apps/web/src/equipment/sessionStartContext.ts` builds both from the chosen
place). When the equipment changes the outcome the stamped decision says so:
`previous_result` becomes `held` if an advance did not happen, and
`decision_summary` gains the constraint, so "Why this target?" stays true. Without
a context — Log Past Workout has no place — the result is exactly the
unconstrained decision.

**When the machine or place is chosen after the workout started** (the first time
at a gym), `restampUntouchedTargets` re-works the target of an exercise nothing is
logged on yet, for the machine and place it is now on: only on picking a machine
(that exercise) or changing place (all of them). Both are only possible before the
first set of that exercise / of the workout, which is also why the re-stamp never
rewrites a target a set was performed against (see DATA_MODEL.md "The place and each
machine are fixed by the sets logged against them"). An exercise with a logged set keeps
the target it was done against, and so does an entry that never had a progression
decision (added or replaced mid-workout). The live "Today" line always recomputes,
and a manual entry always wins. One limit: the re-stamp works from the stamped
target as the "current target", which only matters for an exercise's first-ever
exposure.

## Chronology safety

`findPreviousNormalSession()` looks up a session's progression baseline by
`completed_at`, strictly before the boundary timestamp passed in — never
array order or "the last one created." This mirrors
`packages/pr-engine/src/calculatePRs.ts`, which was already chronology-safe
by construction before this phase (full recompute from all sessions
sorted by `completed_at`, not an incremental "compare to current PR"
update) — see that file's own tests for the pre-existing proof.

**Historical entries** (`LogPastWorkoutScreen.tsx`, "Log Past Workout")
pass the backdated timestamp as `applyProgressionToSession`'s `nowIso`, so
a workout entered today for three weeks ago resolves its target against
what was actually true three weeks ago — sessions logged since then are
correctly invisible to that lookup, and a later real session's own
baseline is unaffected by the backfill (it finds ITS OWN correct
predecessor by the same chronological rule, regardless of what order the
two were saved in).

## Deload

`WorkoutSession.is_deload?: boolean` — session-level, the simplest model
that fits the existing architecture. A deload session is fully logged
(sets still count for PRs, history, everything) and is simply excluded
from `findPreviousNormalSession`'s search, so it can never become the
baseline for the next normal session:

```
Normal: Bench 185  -> Deload: Bench 135 (is_deload: true)  -> Next normal: baseline still 185
```

Set at Today-screen session start ("Start as Deload" alongside the
existing Skip button); nothing else in the app branches on it except that
one lookup.

## Set phase migration

`SetType` used to conflate two dimensions: warmup-vs-work and
normal-vs-amrap/drop/failure. v0.2.0 splits them:

```ts
type SetPhase = 'warmup' | 'work';
type SetType = 'normal' | 'amrap' | 'failure' | 'drop' | 'rest_pause'; // 'working'/'warmup' no longer valid here
```

`PerformedSet.phase` is optional — a set from before this field existed
has none at runtime despite the required type. Every phase-sensitive read
site goes through `setPhaseOf()`/`setTypeOf()`
(`packages/workout-engine/src/setClassification.ts`) rather than reading
the fields directly:

- `phase` present → use it.
- Absent, `set_type === 'warmup'` → phase `'warmup'` (the old convention).
- Absent, anything else (including the old `'working'` default) → phase
  `'work'`, type `'normal'`.

This keeps `eligibility.ts`'s warm-up exclusion (already correct since
before this phase, for PRs, training distribution, and now progression's
`findPreviousNormalSession`) working identically for old and new data —
proven by a real pre-v0.2.0-shaped fixture in
`packages/pr-engine/src/calculatePRs.test.ts`, not just the new-shape
tests. New code never writes the old values; `ExerciseLogger.tsx`'s
per-row dropdown maps its six user-facing choices
(`normal/warmup/amrap/drop/failure/rest_pause`) to the correct
`{phase, setType}` pair via `phaseAndTypeForKind()`.

There is no auto-generated warm-up ramp feature in ATLAS (no "40/60/80% of
working weight" ramp generator) — the handoff's "if changing a warm-up
load affects auto-generated warm-up sets" concern is accordingly not
applicable; nothing generates warm-up sets to begin with. A user-added
warm-up set is a fully independent `PerformedSet` like any other.

## Rest hierarchy

Most specific wins outright, no blending:

```
WorkoutSession.rest_override_seconds       (this session only)
        ↓
ExerciseGroup.member_rest_seconds          (mid-round only, opt-in)
        ↓
PlannedExercise.rest_seconds               (this plan slot)
        ↓
Exercise.default_rest_seconds              (library-wide default)
        ↓
Program.default_rest_seconds               (this program's default)
        ↓
DEFAULT_REST_SECONDS = 90                  (global fallback)
```

`resolveRestSeconds()` (`packages/workout-engine/src/timer.ts`) takes a
context object covering all of these. The pre-v0.2.0 three-tier version
(plan slot → exercise default → global) is unchanged in relative order;
v0.2.0 only adds the session-override and program-default tiers around
it, plus the group tier for the mid-round case.

**Group (superset/circuit) rest** is two independent things:

- `rest_after_seconds` — after the group's last member finishes a round.
  When not explicitly set, falls back to the **longest** of the group's
  members' own `rest_seconds` (`resolveGroupRestSeconds()`) rather than
  picking arbitrarily — the handoff's own "preferred default: longest
  relevant member rest" rule.
- `member_rest_seconds` — between members _within_ a round. Null/absent
  by default (no rest between members), matching a typical superset circuit ("Exercise A → Exercise B → end round →
  rest"). `SupersetRound.tsx` logs a whole round in one action (no
  per-member step to insert a real timer into), so a configured
  `member_rest_seconds` is surfaced as an informational line rather than
  an enforced timer — the handoff's own "if not [cleanly representable],
  prioritize between-round rest and preserve the intra-pair guidance as
  notes" applies here.
