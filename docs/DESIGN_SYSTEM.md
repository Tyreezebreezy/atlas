# Design System

## Sport-Tech (v0.1.4)

Replaces "Stone & Sage" (v0.1.2/v0.1.3's provisional light palette, marked
"temporary... pending Figma review" in its own token file). The owner
rejected it outright: too bland/spa-like for a gym-use app, and the sage
background hurt readability. Sport-Tech is a dark, high-contrast,
athletic palette instead — near-black base, electric-blue primary accent.

All 14 color tokens live in `packages/ui/src/tokens.css` (CSS custom
properties, the single source every component consumes via `var(--atlas-*)`
per `docs/ARCHITECTURE.md`) and are mirrored in `packages/ui/src/tokens.ts`
for JS-side consumers (currently unused by name anywhere, kept for parity
with the CSS file). There is no theme-switching mechanism — one palette,
same as before.

| Token            | Value     | Role                                                                                                                                                                         |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background`     | `#0B0D10` | Page background (near-black)                                                                                                                                                 |
| `surface`        | `#15191E` | Card/panel fill                                                                                                                                                              |
| `surface-raised` | `#242B33` | Nested/elevated surface (media placeholder, inputs on a card)                                                                                                                |
| `text-primary`   | `#F2F4F7` | Primary text                                                                                                                                                                 |
| `text-secondary` | `#9AA5B1` | Secondary/meta text                                                                                                                                                          |
| `accent`         | `#3B9EFF` | Primary interactive: active nav, links, primary buttons, focus                                                                                                               |
| `accent-mist`    | `#193049` | Soft tinted background for accent-adjacent chips (active nav background, selected candidate)                                                                                 |
| `success`        | `#3DDC84` | PRs, completed-set confirmation                                                                                                                                              |
| `timer`          | `#22D3EE` | Rest timer, countdown, training-distribution bars                                                                                                                            |
| `warning`        | `#F5A524` | Validation warnings, import warning banners                                                                                                                                  |
| `danger`         | `#FF6B6B` | Reserved for destructive actions (v0.1.4 adds this token per the Sport-Tech spec; no existing UI used a destructive-specific color before, so nothing currently consumes it) |
| `milestone`      | `#D9A441` | Milestone cards/text (renamed from "bronze" — same warm-metallic role)                                                                                                       |
| `border`         | `#626D79` | Card/input/divider borders                                                                                                                                                   |

`surface`/`surface-raised` are deliberately low-contrast against
`background`/`surface` (~1.1–1.2:1) — an intentional subtle elevation
step, the same approach most dark-theme systems use, not a WCAG target.

## Contrast validation (WCAG relative-luminance formula)

Computed programmatically, not eyeballed. Every text/icon color clears
4.5:1 (WCAG AA normal text); most clear 7:1 (AAA). `border` clears 3:1
(WCAG 1.4.11 non-text/UI-component contrast) against both `background`
and `surface`.

| Pair                            | Ratio   | Result        |
| ------------------------------- | ------- | ------------- |
| text-primary / background       | 17.66:1 | AA            |
| text-primary / surface          | 16.02:1 | AA            |
| text-primary / surface-raised   | 12.98:1 | AA            |
| text-secondary / background     | 7.77:1  | AA            |
| text-secondary / surface        | 7.05:1  | AA            |
| text-secondary / surface-raised | 5.71:1  | AA            |
| accent / background             | 6.97:1  | AA            |
| accent / surface                | 6.32:1  | AA            |
| accent / accent-mist            | 4.82:1  | AA            |
| success / background            | 10.90:1 | AA            |
| success / surface               | 9.89:1  | AA            |
| warning / background            | 9.53:1  | AA            |
| warning / surface               | 8.65:1  | AA            |
| danger / background             | 7.01:1  | AA            |
| danger / surface                | 6.36:1  | AA            |
| timer / background              | 10.77:1 | AA            |
| timer / surface                 | 9.77:1  | AA            |
| milestone / background          | 8.65:1  | AA            |
| milestone / surface             | 7.85:1  | AA            |
| border / background             | 3.69:1  | AA (UI/large) |
| border / surface                | 3.35:1  | AA (UI/large) |

## What changed from "Stone & Sage"

- `--atlas-color-sage` / `-sage-mist` → `--atlas-color-accent` / `-accent-mist` (renamed, not just recolored — the old name would actively lie about the new color).
- `--atlas-color-bronze` → `--atlas-color-milestone` (same rename reasoning; every use of "bronze" was already milestone-specific).
- Two dead token references found and fixed while re-theming (`App.css` referenced `--atlas-color-canvas` and `--atlas-color-surface-alt`, neither ever defined — both now point at `--atlas-color-surface-raised`).
- New tokens: `surface-raised` (visual hierarchy — section 17), `danger` (explicit Sport-Tech spec requirement).
- `apps/web/index.html`'s `<meta name="theme-color">` and `vite.config.ts`'s PWA manifest `theme_color`/`background_color` updated to match (previously three literal copies of the old background hex, outside the token files).

No component-level CSS changed beyond these token values/names — every
screen in `apps/web/src` already consumed color exclusively via
`var(--atlas-*)` (verified by grepping for raw hex codes before starting;
none found outside the token files), so the whole app re-themes from one
file. Verified live via the dev server: Today, Library, Library search,
and Exercise Detail (including a `frame-sequence` media placeholder on
the new `surface-raised` tile) all render correctly with zero console
errors.

## vNext Handoff 03B additions

- **Surfaces separate by elevation, not borders.** Progress uses `.atlas-panel`
  (`surface`) and one `--lead` card (`surface-raised` + an accent top edge) so a
  screen has a visual center; hairlines use `--atlas-chart-grid`. Outlined
  cards (1px `border`) are kept for controls, not for content.
- **Segmented control primitive** (`.atlas-segmented`, plus the Progress tab
  row and chart metric picker): a `surface` track, transparent options, the
  active one `accent-mist`. A `<button>` without an explicit reset renders as
  the browser's gray button in the dark color scheme — every segmented control
  must set `border: 0; background: transparent`.
- **Edge accents are inset strips** (`box-shadow: inset 3px 0 0 <color>`), not
  `border-left`, which curves into a crescent at rounded corners. Gold =
  milestone reached, blue = benchmark.
- **Muscle heat is ATLAS blue.** `--atlas-muscle-heat` is now `accent` (it was
  the timer cyan); selection mode stays green (`--atlas-muscle-selected`), so
  the two vocabularies of the shared Body Map never look alike.
- `--atlas-space-5` does not exist (see `docs/PROGRESS.md` known debt); use
  `space-4` / `space-6`.

## Acceptance pass additions (vNext 04B)

- **Overlays are real dialogs.** A full-screen overlay (the Gym Mode options sheet,
  the welcome overlay) uses `useModalFocus` (`apps/web/src/a11y/`): `role="dialog"`
  `aria-modal="true"` `tabIndex={-1}`, focus moves in when it opens, Tab / Shift+Tab
  stay inside (and pull back focus that slipped behind the overlay), Escape closes
  it (the welcome overlay: same as Skip), and focus returns to whatever opened it.
  Every view inside the sheet puts focus on its own first control, and every heading
  clears the 44px close button pinned to the corner.
- **A button sets a full `border`, never just `border-color`.** A `<button>` with
  only a colour keeps the browser's 2px outset bevel (seen on the completed-set check,
  and on `.atlas-template-editor__save` wherever it is used outside the editor's
  action row). Every control that shares a rule must also carry its own border style.
- **Repeated actions name what they act on.** "Add" x18, "Edit"/"Delete" x8 and
  "Remove exercise" read identically in a list of buttons; give each an
  `aria-label` that includes the item ("Add 185 lb Bench Press", "Delete the Oct 4,
  2026 measurement"). Fields inside a list item whose own text names the row are left
  as they are.
- **Destructive actions confirm inline, in place**, and name the consequence ("Delete
  X? Past workouts stay in your history ... This can't be undone."). Done for program,
  workout, milestone, place, equipment, body measurement, discard and
  replace-existing.
