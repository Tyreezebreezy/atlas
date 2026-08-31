# Adaptive UI (v0.0.8 hardening/adaptive pass)

ATLAS runs the same codebase across phone, tablet, laptop, and desktop —
including snapped/quarter/half windows and ultrawide monitors — without a
separate mobile/desktop fork. This document covers the layout philosophy and
what was actually built. See docs/MOBILE.md for PWA/platform readiness and
docs/FORGE_EXTRACTION_NOTES.md for which patterns here are considered proven
enough to become Forge defaults later.

## Layout philosophy

ATLAS responds to **available space**, not device names or fixed monitor
resolutions. There is no `if (isIPhone)` or `1920×1080 → Layout A` branching
anywhere in the codebase. Four approximate layout states exist as a shared
vocabulary (documented as a comment in `packages/ui/src/tokens.css`, since
CSS custom properties can't appear inside `@media`/`@container` feature
queries — the literal breakpoint values are repeated at each query site):

| State    | Range             | Typical context                           |
| -------- | ----------------- | ----------------------------------------- |
| COMPACT  | `<48rem` (768px)  | phone, quarter-window, narrow half-window |
| MEDIUM   | 48rem–64rem       | tablet, half-window, small laptop         |
| EXPANDED | 64rem–75rem       | desktop, large tablet landscape           |
| WIDE     | `>75rem` (1200px) | large desktop, ultrawide                  |

Only **one** breakpoint is actually wired into layout-level CSS today
(`48rem`, where navigation switches — see below). The other three are a
documented vocabulary for future use, not three more media queries added
for their own sake — most of the actual responsiveness in this pass comes
from CSS Grid's intrinsic sizing, not breakpoints at all (next section).

## Container-aware, not breakpoint-proliferated

Per-component responsiveness is handled almost entirely through
**`grid-template-columns: repeat(auto-fit, minmax(Npx, 1fr))`** on card-like
list containers (Progress's Recent/Milestones/Benchmarks, Program's
Quick-Workouts/Programs list, History's session list). This needs **zero**
media or container queries: a grid naturally shows 1 column when its own
rendered width is narrow and more columns as it grows, and it reacts to the
container's actual width (which differs from the viewport once the sidebar
or the WIDE max-width bound apply), not the raw viewport. This is the
`PROVEN` pattern from this pass — see docs/FORGE_EXTRACTION_NOTES.md.

`.atlas-shell__content` also carries `container-type: inline-size` (named
`atlas-content`), so a genuine `@container` query is available to any
descendant that needs to react to something grid alone can't express (e.g.
changing a card's internal layout, not just column count). None of the
current components needed one badly enough to justify it over the simpler
grid approach — noted as `PROMISING` for later, not `PROVEN` yet.

**Deliberately NOT grid-ified**: Body's measurement history
(`.atlas-body__history-list`). Its rows are denser (date + weight + several
optional metrics + notes) than the sparse cards elsewhere, and a genuinely
chronological log reads better as one continuous list a user scans
top-to-bottom than wrapped into a multi-column grid. Not every list benefits
from the same treatment — see section 14's "only use split/multi-column
layouts where they improve usability."

## Navigation

The tab set (Today/Program/Progress/Library/More) and their order never
change between layout states — same information architecture everywhere,
nothing to relearn switching devices. Only the **position** changes, all in
`.atlas-shell`/`.atlas-shell__tabbar` (`App.css`):

- **COMPACT**: bottom tab bar (original v0.0.1 behavior, unchanged).
- **MEDIUM and up** (`≥48rem`): a persistent left sidebar (`--atlas-nav-width:
168px`), driven by `flex-direction: row` on `.atlas-shell` plus `order: -1`
  on the tab bar (no JSX/DOM reordering needed — `NavShell.tsx` renders
  content before nav exactly as before; CSS `order` repositions it). Active
  tab gets a `--atlas-color-sage-mist` background instead of the compact
  mode's underline-style color change.

No icon-only rail exists — ATLAS's nav has always been text-only, and adding
icons now would be a separate design decision, not something this pass
invents casually.

## Content bounding at WIDE

`.atlas-shell__content` gets `max-width: var(--atlas-content-max-width-wide)`
(75rem / 1200px) plus `margin: 0 auto` at `≥48rem`. Verified directly: at a
real 3440px ultrawide viewport, content stays bounded to exactly 1200px
(computed `getBoundingClientRect().width`), never stretching edge-to-edge —
directly satisfies "avoid a gigantic empty card stretched 3200px."

## Charts

`TrendChart` (docs/PRS.md) was already fully responsive before this pass —
`viewBox` + CSS `width: 100%; height: auto` is the standard scalable-SVG
pattern, and it predates this work. **A real bug was found and fixed here**:
its date-label formatter parsed date-only strings (`BodyMeasurement.date`,
`"YYYY-MM-DD"`) as UTC midnight, which renders as the previous day in any
timezone behind UTC — a measurement logged for Jul 1 showed "Jun 30" on the
chart (caught because the History list right below it, which already parsed
dates safely, correctly showed "Jul 1"). Fixed once in the shared formatter,
not the new call site, so any future series producer passing a date-only
string is automatically safe. See docs/BODY_COMPOSITION.md.

## Touch targets

Audited every `min-height`/`min-width` in `App.css`: found and fixed 13
controls below the 44px standard (as low as 32px — reorder/remove icon
buttons in the template and program editors, the exercise-timer Stop
button, Skip/Replace/Cancel buttons, several number inputs). All now use
`var(--atlas-touch-target)` (44px) instead of a literal pixel value, so
future controls inherit the standard by using the token rather than
guessing a number. Confirmed zero `min-height`/`min-width` values remain in
the 20–43px range.

## Safe areas & dynamic viewport

`.atlas-shell__content`'s bottom padding is
`calc(var(--atlas-space-6) + env(safe-area-inset-bottom))` unconditionally
— not just when the tab bar (which already carried its own inset) is
present. This matters specifically for Gym Mode, which replaces the tab bar
entirely with nothing else to absorb the home-indicator area; before this
fix, Finish Workout could end up flush against it on a notched phone.

No `100vh` exists anywhere in the codebase (confirmed by grep) — the shell
was already built on `height: 100%` chained from `html`/`body`/`#root`,
which tracks the layout viewport correctly as mobile browser chrome
shows/hides, without the classic `100vh`-includes-the-toolbar bug. `dvh`
was considered and deliberately not added on top of an already-correct
pattern — see docs/FORGE_EXTRACTION_NOTES.md for the honest reasoning
(nothing to fix, so nothing was changed).

## Verified viewport/window matrix

Directly measured (not simulated) via the Browser pane and, separately, via
CDP against the **packaged Tauri release build** (`Emulation.setDeviceMetricsOverride`,
since WebView2's CDP surface doesn't expose the `Emulation.enable` domain
call some tooling expects, but does honor the override itself):

| Width  | Where tested     | Overflow | Nav                                |
| ------ | ---------------- | -------- | ---------------------------------- |
| 360px  | Browser + Tauri  | none     | bottom bar                         |
| 390px  | Browser (visual) | none     | bottom bar                         |
| 600px  | Tauri            | none     | bottom bar                         |
| 768px  | Browser          | none     | sidebar                            |
| 900px  | Tauri            | none     | sidebar                            |
| 1280px | Browser + Tauri  | none     | sidebar                            |
| 1920px | Browser + Tauri  | none     | sidebar                            |
| 3440px | Browser          | none     | sidebar, content bounded to 1200px |

All five Tauri sizes were checked **live in one continuous session, no
reload between sizes** — confirming resize-without-reload works in the
packaged app, not just conceptually.

## What was physically validated vs. simulated

- **Physically validated**: all viewport widths above (real rendering, real
  computed styles, real screenshots at 768px/1920px/390px), keyboard
  Tab-driven focus visibility (real key press, not a scripted `.focus()`
  call — the first attempt using `.focus()` gave a false "no outline"
  reading, corrected by re-testing with an actual Tab keypress), touch
  target sizes (computed styles), safe-area CSS syntax validity (computed
  `padding-bottom` resolves correctly; `env()` itself contributes 0px in
  this non-notched test environment, so the _presence_ of a real device
  notch inset was not physically observable here).
- **Simulated / not physically validated**: real hardware DPI switching
  (100%/125%/150%/175%/200% Windows scaling), a physical notched
  iPhone/iPad, true multi-monitor movement between displays of different
  physical size. See docs/MOBILE.md for a manual checklist covering these.
