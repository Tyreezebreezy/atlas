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
- **core** — ID generation, device identity, storage adapter selection. Future
  versions add workout/program/PR/milestone/benchmark/substitution engines here
  as their roadmap version lands (see deviation note below).
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
still gets its own module, just introduced on demand.

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
