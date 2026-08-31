# Forge Extraction Notes

Documentation only — nothing here touches The Forge. ATLAS is the reference
implementation; this records which patterns from the v0.0.8 hardening/
adaptive pass are solid enough to become Forge defaults later, and which
aren't there yet. Full detail lives in docs/ADAPTIVE_UI.md and
docs/MOBILE.md; this is the classification summary.

## PROVEN

Patterns actually built, verified in a real browser AND a real packaged
Tauri build, and worth carrying into Forge as a default.

- **`auto-fit`/`minmax()` grid for card lists** — zero media/container
  queries needed; a list container naturally goes 1→N columns based on its
  own rendered width. Simpler and more robust than either a JS width
  calculation or a per-component breakpoint. This is the single highest-
  value pattern from this pass.
- **CSS `order` for nav repositioning** — switching a bottom tab bar to a
  left sidebar needed one `@media` block and zero JSX/DOM changes.
  Avoids maintaining two separate nav render paths.
- **`container-type: inline-size` on the main content region**, named, so
  any future descendant can opt into a `@container` query without
  replumbing — cheap to add even where nothing uses it yet.
- **Bounded max-width at WIDE, centered** — the single-line fix for the
  "ultrawide stretches everything" problem. Trivial, and every
  screen-space-driven app will eventually need it.
- **44px touch-target token, applied via `var()` not literals** — makes a
  future audit ("did we regress this?") a single grep for raw pixel values
  instead of a manual re-check of every control.
- **Root height via `height: 100%` chained from `html`/`body`/`#root`,
  not `100vh`** — avoids the mobile-toolbar bug for free, no `dvh` fallback
  needed. Worth defaulting to from the start of a new project rather than
  retrofitting.
- **Platform capability isolation** (`isTauriRuntime()`, the
  `AtlasStorage` adapter split) — confirmed by grep that zero pure-logic
  packages touch a platform global; only two small, already-isolated
  browser-API call sites exist in the whole web app. This discipline, kept
  from day one, is what made this pass's Android-readiness review fast and
  clean rather than an archaeology project.

## PROMISING

Built or considered, but not exercised enough this pass to call proven.

- **`@container` queries for a component's internal layout** (not just
  column count) — the container is wired up (`atlas-content`), but no
  current ATLAS component needed one badly enough to write one. Worth
  revisiting once a real case appears (a card whose _internal_ structure,
  not just its grid position, should change at a size threshold).
- **Deliberately excluding a dense chronological list from grid-ification**
  (Body's measurement history) — a real, considered decision, but only
  tested against one concrete list. Whether "sparse card vs. dense log"
  is the right general rule, or just right for this one list, isn't
  proven yet.

## ATLAS-SPECIFIC

Real, correct, but shaped by decisions specific to this product — don't
default-copy into Forge without re-deriving for the new context.

- **Stone & Sage's exact palette/token values** — the mechanism (CSS
  custom properties, `color-mix()` for tinted warning backgrounds) is
  general; the specific colors aren't.
- **No nav icons** — ATLAS's nav has always been text-only; a Forge
  default nav pattern should probably support icons, which would change
  the sidebar-width math (`--atlas-nav-width: 168px` is sized for text
  labels).
- **The exact 8 milestone dimensions and their weight/reps/duration/
  distance compatibility rules** — the _pattern_ (a small pure function
  flagging a semantic mismatch as a non-blocking hint, never a hard
  validation) is reusable; the specific rule table is ATLAS's own domain
  model.

## DEFER

Named in the handoff, explicitly not built this pass, not because they
failed but because they weren't in scope or lacked a real use case yet.

- **A user-profile/age system** — explicitly deferred (section 5); would
  only exist to serve `benchmark-engine`'s already-implemented but
  currently-always-fallback age-bracket lookup.
- **A grip-strength data-entry subsystem** — explicitly deferred (section
  5); the benchmark row is seeded for completeness but has no ATLAS
  exercise to attach to.
- **True hardware DPI-switching validation, a physical notched device, a
  real multi-monitor move** — see docs/MOBILE.md's manual checklist;
  these need real hardware this environment doesn't have, not more code.
- **Native Android/iOS shells** — explicitly out of scope for this pass;
  docs/MOBILE.md records what groundwork already exists and what would
  still need building.
