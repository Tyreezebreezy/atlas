# ATLAS Architecture

## One core, two shells

```
                 ATLAS CORE  (packages/core, data-model, ui)
                      |
               Storage Interface  (packages/storage)
                  /        \
                 /          \
          IndexedDB        SQLite
        (apps/web, Dexie)  (apps/desktop, tauri-plugin-sql)
```

`apps/web` is the single React frontend. `apps/desktop` is a thin Tauri 2 wrapper
— it has no frontend source of its own; its `tauri.conf.json` points
`frontendDist`/`devUrl` at `apps/web`. The same components, screens, and domain
logic run in the browser/PWA and inside the desktop webview.

No fitness logic is implemented twice. `packages/core` and its callers depend on
the `AtlasStorage` interface from `packages/storage`, never on Dexie or
tauri-plugin-sql directly. At runtime, `packages/core`'s platform detector
(`isTauriRuntime()`) picks the IndexedDB adapter or the SQLite adapter. Future
CITADEL sync and a future Android client reuse the same core and interface —
they only need a new storage adapter or a sync layer behind the existing
interface, not a rewrite.

## Package boundaries

- **data-model** — plain TypeScript types only. No runtime code, no dependencies.
  Every entity carries `SyncMeta` (`id`, `created_at`, `updated_at`, `version`,
  `device_id`, `deleted_at`) for future CITADEL sync, per the sync-readiness
  requirement. Soft delete (`deleted_at`) everywhere instead of hard delete.
- **storage** — the `AtlasStorage` interface plus two implementations
  (`IndexedDbAdapter`, `SqliteAdapter`). Owns migrations (via each backend's own
  native versioning — no custom migration engine).
- **core** — ID generation, device identity, storage adapter selection.
- **substitution-engine** — deterministic, offline exercise-substitution
  scoring (no LLM). Pure functions over `Exercise[]`; no storage or UI
  dependency, same division as `workout-engine`/`program-engine`.
- **pr-engine** — eligibility rules and deterministic PR calculation over
  `WorkoutSession[]`. No storage dependency; persistence and the
  recalculate-on-finish trigger live in `apps/web`.
- **progress-engine** — exercise summaries and chart-series generation,
  built on `pr-engine`'s eligibility rules. No storage dependency.
- **milestone-engine** — built-in + custom milestone evaluation over
  `WorkoutSession[]`, built on `pr-engine`'s `eligibleSetsForExercise`. No
  storage dependency; persistence and the evaluate-on-finish trigger live in
  `apps/web`, same division as `pr-engine`.
- **benchmark-engine** — percentile interpolation and the seeded population
  benchmark dataset. No storage dependency.
- **ui** — design tokens (Stone & Sage) shared by every screen.
- **apps/web** — screens, navigation, PWA manifest/service worker.
- **apps/desktop** — `src-tauri/` only: Rust entry point, Tauri config, SQL
  migrations, Tauri SQL plugin wiring.

## Deviation from the original 13-package proposal

The handoff doc's structure lists a package per engine (workout-engine,
program-engine, substitution-engine, progress-engine, pr-engine,
milestone-engine, benchmark-engine, body-composition, import-export,
exercise-library) — explicitly marked "conceptual... prefer simpler
organization." v0.0.1 only created packages with real content
(`data-model`, `storage`, `core`, `ui`); v0.0.2 added `exercise-library`;
v0.0.3 added `workout-engine` and `program-engine` when they got real logic.
Each remaining engine package gets created when its roadmap version adds
logic to it, instead of sitting empty for months. This is a structural
simplification, not a scope cut — every concept in section 9 of the handoff
still gets its own module, just introduced on demand. `substitution-engine`
was created this way in v0.0.5; `pr-engine`/`progress-engine` in v0.0.6;
`milestone-engine`/`benchmark-engine` in v0.0.7 — each the first version
that gave that concept real logic.

`workout-engine`/`program-engine` hold pure data-transform functions (create,
duplicate, reorder, activate-one-of-many) — storage reads/writes happen in
the `apps/web` screens that call them, same division as `exercise-library`.
Neither package owns a UI framework dependency.

`exercise-library`'s seed data (`src/data/atlas-exercises.json`) lives inside
the package itself rather than the handoff's suggested top-level `data/`
folder, so the package stays self-contained instead of reaching outside its
own directory via a relative import.

## Planned vs. performed (critical)

`WorkoutTemplate` / `ProgramDay` hold **prescriptions** (target sets/reps/weight).
`WorkoutSession` holds a **snapshot** of what was planned at start time (copied,
not a live reference) plus the actual `PerformedSet[]`. Editing or deleting a
program later never rewrites history, because sessions don't point at mutable
program state — they carry their own copy. See `docs/DATA_MODEL.md`.

## Sync readiness

No network sync is implemented yet. Every entity's `SyncMeta` fields exist from
v0.0.1 so CITADEL sync (v0.3.0) doesn't require a schema redesign — just a sync
queue and conflict resolution layered on top of the existing storage interface.

## Gym Mode (v0.0.4)

`GymModeContext` (`apps/web/src/gym/GymModeContext.tsx`) is lifted above
`NavShell`, not inside it — an active `WorkoutSession` takes over the _entire_
app (no tab bar) rather than being just one tab's content, so there's no way
to accidentally context-switch away mid-set. `TodayScreen` is the only entry
point that calls `enterGymMode()`; everything else about starting a workout
(picking a program day, picking a Quick Workout) lives there.

Session-execution logic lives in `packages/workout-engine` alongside the
existing template-authoring logic (`session.ts`, `previousPerformance.ts`,
`sessionSummary.ts`) rather than a new package — "workout" already covers
both authoring and execution conceptually, and the split was never about
topic, only about which version added real logic first.

## Timers, skip, replace (v0.0.5)

Timer/skip/replace logic lives in `packages/workout-engine` (`timer.ts`,
`skip.ts`, `replace.ts`) alongside session execution — same reasoning as
Gym Mode itself: these are all `WorkoutSession` lifecycle concerns, not a
new topic that earns its own package. `substitution-engine` is the one
genuinely new package, because ranking candidate exercises is a distinct
concept from anything session-lifecycle-shaped.

`useWakeLock` (`apps/web/src/gym/useWakeLock.ts`) is a plain browser-API
hook, not domain logic, so it lives in `apps/web` rather than a shared
package — nothing about it is platform-independent (the Tauri desktop
webview and the PWA both use the same web Screen Wake Lock API directly,
there's no adapter to abstract).

**Settings is device-local `localStorage`, not a new synced entity.**
`apps/web/src/settings/settings.ts` reads/writes a single JSON blob. This
was a deliberate choice, not an oversight: Settings can only be edited
outside Gym Mode (no tab bar during an active session), so there's no
cross-component reactivity need, and there's exactly one preference so far
(pre-exercise countdown). Revisit as a real `SyncMeta`-carrying entity if
Settings grows enough to need CITADEL sync.

## PRs & Progress (v0.0.6)

`PersonalRecord`, `Milestone`, and `Benchmark` are not new entities — they,
their storage repositories, their Dexie stores, and their SQLite tables
have all existed since v0.0.1 (see docs/DATA_MODEL.md), simply unused until
an engine existed to populate and read them. v0.0.6 only extended
`Milestone`/`Benchmark` with a handful of new nullable/non-indexed fields
(no `PersonalRecord` change was needed at all) — no migration, same "whole
document" storage reasoning established in v0.0.5.

`pr-engine`/`progress-engine` are pure and storage-independent; the
recalculate-and-persist trigger (`apps/web/src/progress/recalculatePRs.ts`)
and all UI live in `apps/web`, matching every other engine package's
division of labor. See docs/PRS.md for the full PR/progress design
(eligibility rules, e1RM formula, tie behavior, historical recalculation,
the live-vs-persisted read tradeoff, and the hand-rolled-SVG charting
decision).

## Milestones & Benchmarks (v0.0.7)

`milestone-engine` and `benchmark-engine` are pure and storage-independent,
same division as every other engine package. Milestones follow PRs'
integration pattern closely — evaluated and persisted from
`GymModeScreen.handleFinish` (`apps/web/src/progress/evaluateMilestonesForSession.ts`),
surfaced in `WorkoutSummary` and `ProgressScreen` — but with one deliberate
behavioral difference (achieved-once, never re-evaluated, vs. PRs'
always-current-best) documented in docs/MILESTONES.md. Benchmarks are a
different shape entirely: no achievement event, no workout-finish
integration at all — a comparison is computed live wherever it's shown,
against whichever `Benchmark` rows are currently seeded. See
docs/MILESTONES.md and docs/BENCHMARKS.md for the full design.

The custom milestone builder (`apps/web/src/progress/MilestoneForm.tsx`)
reuses the existing `ExercisePicker` component unmodified — the first
concrete case of a `program/` screen component being reused from
`progress/`, made possible because `ExercisePicker` already took its
`storage`/`onPick`/`onCancel` props generically rather than assuming a
program-building context.

## A real build/runtime gotcha found during v0.0.4 testing

Building the desktop shell via plain `cargo build --release` (bypassing
`@tauri-apps/cli`) produces a binary that loads `devUrl` (the Vite dev
server) instead of the embedded `frontendDist` assets — confirmed by testing:
`cargo build --release` directly, then launching the binary, loaded whatever
happened to be running on `localhost:5173` rather than the app's own bundled
UI. **Always build the desktop shell via `npm run tauri build` /
`npm run tauri dev`, never a raw `cargo build`/`cargo check` alone**, when the
question is "does the packaged app behave correctly" rather than just "does
the Rust compile." `cargo check`/`cargo test` remain fine for compiler-level
validation.

## A real caching gotcha found during v0.0.7 desktop testing

Rebuilding and relaunching the desktop app against the **same** WebView2
user-data directory (`%LOCALAPPDATA%/com.tyree.atlas/EBWebView`, persistent
across launches by design, same identifier every build) can keep serving a
**stale cached `index.html`** — confirmed directly: after a fresh
`npm run tauri build --no-bundle` with new frontend code, the running app's
`<script src>` still pointed at a hashed filename from a previous build.
Deleting the `EBWebView` directory (or otherwise clearing the profile) before
relaunching fixed it immediately. The content-hashed JS chunks themselves
aren't the problem — `index.html` is the one asset with a stable filename
across builds, so it's the one WebView2's cache can serve stale without any
hash mismatch to notice. This only bit iterative same-machine
rebuild-and-relaunch testing (a real end user installing an actual new
version gets a fresh install, not a live profile reuse), so it wasn't
treated as an ATLAS bug to fix — but it's worth knowing before concluding a
rebuilt desktop app "isn't picking up changes" when it's actually not being
served the new build at all. If a desktop CDP test ever shows unexpectedly
stale UI right after a rebuild, check the loaded script hash
(`[...document.querySelectorAll('script[src]')].map(s => s.src)`) against
`apps/web/dist/assets/` before assuming the app itself has a bug.
