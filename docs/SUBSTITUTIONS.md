# Exercise Substitution Engine (v0.0.5)

`packages/substitution-engine` ranks candidate replacement exercises for a
given exercise. Deterministic and fully offline — no LLM, no network call,
no randomness. The same inputs always produce the same ranked list, which
is what makes it testable and what makes "why was this suggested" always
answerable from the `reasons` list the engine returns alongside each score.

## Entry point

```ts
suggestSubstitutes(target: Exercise, pool: Exercise[], options?: {
  availableEquipment?: string[]; // omit to skip equipment filtering entirely
  excludeExerciseIds?: string[]; // e.g. exercises already planned in this workout
  limit?: number;
}): SubstitutionCandidate[] // { exercise, score, reasons }[], highest score first
```

Used from `apps/web/src/gym/ReplaceExercisePanel.tsx` to populate the
"Suggested" list when replacing an exercise mid-workout. The manual search
fallback in the same panel is a separate, ordinary `searchExercises` call
from `packages/exercise-library` — the two are independent; search doesn't
use scoring, and suggestions don't use text matching.

## Scoring

Every candidate starts at 0. Each signal below fires independently and adds
its fixed weight — there's no multiplicative or diminishing-returns math,
just addition, so the total score is always traceable to which signals
fired.

| Signal                                      | Weight | Reasoned? |
| ------------------------------------------- | -----: | :-------: |
| `enrichment.known_substitute_ids` match     |     50 |    yes    |
| Same `movement_pattern`                     |     40 |    yes    |
| Same `target_muscle`                        |     30 |    yes    |
| Same `enrichment.movement_family`           |     15 |    yes    |
| Shared `secondary_muscles` (5 each, capped) |   ≤ 15 |    yes    |
| Same `measurement_type`                     |     10 |    no     |
| Same `is_unilateral`                        |      5 |    no     |

**"Reasoned" matters for qualification, not just display.** A candidate
must have at least one reasoned signal to appear in the results at all —
the two reason-less signals (measurement type, unilateral/bilateral) can
only pad the score of a candidate that already qualified on something real.
Without this rule, two anatomically unrelated exercises that merely happen
to share `measurement_type: 'reps_weight'` — true for the vast majority of
the seeded library — would "match" on nothing meaningful and clutter the
suggestion list with noise. This is enforced by filtering on
`reasons.length > 0`, not `score > 0`.

`known_substitute_ids` is deliberately the highest single weight: it's a
human-curated judgment (see docs/EXERCISE_DATA.md), which is a stronger
signal than any single derived-field match. In practice a real curated
substitute also shares movement pattern and target muscle, so it typically
scores well above that alone — the weight ordering means an explicit
curation call never gets outranked by mere field overlap on an
uncurated exercise.

## Filtering (applied before scoring)

- The target exercise itself is always excluded.
- `excludeExerciseIds` — always excludes soft-deleted candidates
  (`deleted_at !== null`) and anything the caller explicitly passes (e.g.
  every exercise already in the current workout, so you're never offered a
  "swap" to something you're already doing that day).
- `availableEquipment` — if provided, a candidate is excluded when it needs
  equipment outside that list; a bodyweight exercise (`equipment: []`)
  always passes regardless. If omitted (the only mode the UI currently
  uses — there's no equipment-inventory Settings yet), no equipment
  filtering happens at all.

## Ordering

Sorted by score descending; ties break on exercise name ascending
(`localeCompare`). This means the exact same `(target, pool, options)`
always produces the exact same ordered list — no hidden dependency on
insertion order, `Date.now()`, or `Math.random()`.

## Worked example

Target: **barbell bench press** (curated: `horizontal_push`, target muscle
`chest`, known substitutes `dumbbell bench press`, `lever chest press`).

| Candidate                   | Score | Why                                                                          |
| --------------------------- | ----: | ---------------------------------------------------------------------------- |
| dumbbell bench press        |   120 | known substitute (50) + pattern (40) + muscle (30)                           |
| lever chest press           |   120 | known substitute (50) + pattern (40) + muscle (30)                           |
| barbell incline bench press |    70 | pattern (40) + muscle (30) — not a _curated_ substitute for the flat variant |
| push-up                     |    70 | pattern (40) + muscle (30)                                                   |
| dumbbell lateral raise      |     0 | no shared signal — excluded, not shown as score 0                            |

## Known data-quality quirk

The imported seed dataset has at least one exact duplicate name (`lever
chest press` appears twice as two distinct rows/ids — see
docs/EXERCISE_DATA.md, pre-dates v0.0.5). Both rows score and display
independently; this is a property of the source data, not a bug in the
engine, and `known_substitute_ids` resolution during curated-enrichment
seeding links to whichever of the two duplicate rows appears later in the
seed array (`Map` overwrite semantics) — the other still surfaces via the
`movement_pattern`/`target_muscle` signals instead, so nothing is silently
dropped, one just arrives by a different reasoned path.

## Not implemented

- **User-declared equipment inventory.** `availableEquipment` is a real,
  tested parameter, but no Settings UI collects it yet — building an
  equipment-inventory feature wasn't in scope for v0.0.5.
- **`enrichment.avoid_if` filtering.** The field exists (informational
  hints like `'knee_pain'`, never a diagnosis) but nothing in the app
  collects user conditions to filter against, so it's not wired into
  scoring. Populate and wire it when/if a condition-input feature exists.
