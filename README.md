# ATLAS

A personal, local-first fitness and training tracker. Create or import workouts and
programs, run them in the gym, log every set, detect PRs, track milestones, and see
progress over time — offline-first, syncing later through CITADEL.

ATLAS is a training app, not a general health platform. No nutrition tracking, no
social features, no XP/levels. See [docs/ROADMAP.md](docs/ROADMAP.md) for scope.

## Structure

```
apps/
  web/       React + TypeScript + Vite PWA — the shared frontend
  desktop/   Tauri 2 shell wrapping apps/web for Windows
packages/
  data-model/  Shared TypeScript types for every core entity
  storage/     Storage interface + IndexedDB (Dexie) and SQLite (Tauri SQL) adapters
  core/        Platform-independent domain logic (IDs, device identity, storage selection)
  ui/          Shared design tokens
docs/          Architecture, data model, roadmap, security notes
```

One core, two shells. All fitness/domain logic lives in `packages/`, not duplicated
per platform. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Develop

```bash
npm install
npm run dev          # web app at http://localhost:5173
npm run tauri dev    # desktop shell (wraps the same web app)
```

## Validate

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run tauri build -- --debug   # or: cd apps/desktop/src-tauri && cargo check
```

## Requirements

Node ≥20, Rust stable + Cargo, and on Windows: WebView2 runtime (ships with Windows 11) and the Visual Studio Build Tools C++ workload (for Tauri).
