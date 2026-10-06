# Anatomy: the Body Map

One component, `apps/web/src/anatomy/BodyMap.tsx`, paints every anatomical
figure in ATLAS: Progress > Muscles and Overview, the Exercise Library's body
browse, the custom-exercise muscle picker, an exercise's detail page, and the
program planner. `singleRenderer.test.ts` pins that.

The figure is vendored vector geometry; ATLAS's muscle taxonomy
(`@atlas/anatomy`, 30 muscles in 22 `svg_id`s) was **not** changed to fit it.
An adapter maps between the two, and every place they don't line up is a
documented, tested allowlist entry rather than hidden mapping logic.

## Provenance and license

- Source: [`vulovix/body-muscles`](https://github.com/vulovix/body-muscles)
  v1.0.0 (npm), **Apache-2.0**, Copyright 2024 Ivan Vulović.
- Taken: each shape's `id`, `name` and SVG path `d` only (89 shapes: 40 front,
  49 back), unmodified and in upstream order, into
  `src/anatomy/vendoredMuscleShapes.ts`. The file is generated
  (`scripts/extract-body-muscles.mjs`) and says so in its header.
- Not taken: the package's `BodyChart` renderer, its yellow/orange/red color
  scale and event logic. `package.json` has no dependency on it.
- Notices: the license text and upstream `NOTICE` ship verbatim in
  `apps/web/public/licenses/body-muscles/`; `src/anatomy/NOTICE.md` and
  `LICENSES/README.md` record the pin, tarball integrity and scope.

## Mapping (`src/anatomy/anatomyMapping.ts`)

Three tiers, each audited by `anatomyMapping.test.ts`:

1. **Direct.** A canonical `svg_id` drawn on upstream shape(s) of its own.
2. **Allowlisted shared/fallback** (`SHARED_REGION_ALLOWLIST`). An `svg_id`
   with no shape of its own, drawn on a neighbor's. Each entry carries a
   reason and a visual verdict:

   | ATLAS region | Drawn on | Verdict (reviewed 2026-09-24) |
   | --- | --- | --- |
   | `chest-mid` | sternal pec (`chest-lower-*`) | accepted — reads as the body of the pec; cannot tell Mid from Lower Chest |
   | `mid-back` (rhomboids) | mid trapezius (`traps-mid-*`) | accepted — sits where the rhomboids are; cannot tell them from mid/lower traps |
   | `abductors` | gluteus medius (`gluteus-medius-*`) | accepted (owner, 2026-10-05) — only the hip pads light, so the region is labelled **Hip Abductors**, not "Outer Thigh"; the muscle id `hamstrings.abductors` is unchanged and a custom lateral-thigh path stays deferred (the entry's `followUp`) |

   Nothing here invents anatomy. A `needs-custom-svg-patch` verdict requires a
   `followUp` (test-enforced) and waits for real art.
3. **Decorative.** Upstream shapes ATLAS has no counterpart for (neck, nape,
   quadratus lumborum) or that aren't muscle (head, hands, feet, joints).
   Drawn, never colored or interactive.

The audit (`auditAnatomyMapping()`, printable with `formatAnatomyAudit()`)
reports: every canonical `svg_id` drawn (22/22), which ATLAS muscles share an
upstream shape, which upstream shapes are unused, and integrity problems. Tests
fail if a canonical muscle loses its mapping, if the allowlist drifts, or if a
fallback is left `unreviewed`.

Shared regions select everything they represent: tapping the sternal pec
selects both Lower and Mid Chest, and its accessible name says so ("Lower
Chest / Mid Chest").

## Exercise → muscle mapping (`packages/anatomy/src/map.ts`)

`muscleMapOf(exercise)` is the one read path. In order: a stored user-defined
`muscle_map`, then the **curated** table (lowercase exercise name), then the
**imported** normalization of the dataset's `target_muscle` /
`secondary_muscles` / `category` strings. Nothing is written back, so a fix to
the curated table or the rules corrects rows already stored.

The acceptance pass audited ~45 exercises (the dataset's common lifts and every
strength exercise in the owner's starter program) against what the app derived,
and corrected what was plainly wrong:

- **The owner's starter exercises** are custom rows with a category and nothing
  else, so they only ever got the category fallback — which put biceps _and_
  triceps on a pressdown, quads _and_ hamstrings on a leg curl, the lateral
  deltoid on a face pull and calves on a tibialis raise. ~30 of them are now
  curated by name.
- **Dataset squats, lunges, step-ups and leg presses** are filed under "glutes"
  with the quadriceps only secondary; a leg day showed no direct quad work. When
  the target is glutes, the name says squat / lunge / step-up / leg press and
  the quadriceps are listed, the quadriceps are primary too. The same for
  deadlifts, good mornings and pull-throughs with the hamstrings. A stretch or a
  bridge with the same dataset signature is untouched (the rule needs the name).
- **Overhead / shoulder / military presses** filed under all of "delts" no
  longer credit the rear deltoid.
- A bare "shoulders" secondary on a chest exercise is the **front** deltoid (what
  a press works), not the lateral head.

Known coarse spots, left as the dataset states them rather than guessed: "delts"
on a raise is all three heads; "forearms" is flexors and extensors; a bare
"shoulders" secondary on a non-chest exercise is the lateral head; "pectorals" is
all three chest regions (so an incline press does not favor the upper chest). An
exercise whose strings map to nothing simply has no muscles — never invented
ones.

## Renderer contract

`BodyMap` paints; it owns no analytics. Callers pass per-muscle states:

- **Selection vocabulary** (Library, editors): `primary`, `secondary`,
  `selected`. A selected region gets a green fill, a heavy white outline and
  `aria-pressed`.
- **Analytics vocabulary** (Progress): `heat` (an idle→ATLAS-blue ramp driven
  by a 0..1 intensity), `assist` (dashed; assisted only, never fractional
  heat), `tone` (`positive` / `neutral` / `caution` hatched / `muted` dashed).
  `selected: true` adds only the outline, so a tapped region keeps its meaning.
- One tab stop and one announcement per region (12 front / 11 back), not per
  upstream sub-shape. Non-interactive figures are `role="img"`.

The selection outline is an overlay drawn after every region so a neighbor's
gap stroke can never paint over it.

## Upgrading the vendored art

```bash
npm pack body-muscles@<version> && tar -xzf body-muscles-<version>.tgz
node scripts/extract-body-muscles.mjs package apps/web/src/anatomy/vendoredMuscleShapes.ts
npm test
```

The tests pin the upstream shape counts and fail until the mapping and
allowlist have been re-reviewed. Re-read the new upstream `NOTICE`/`LICENSE`.
