# ATLAS

A local-first training app: build your own programs, run the workout in the gym, log every set, and watch the numbers move.

I built ATLAS because I wanted my workout system to fit my own programs instead of squeezing them into a social or gamified fitness app. You can write a program or paste one in, run it set by set, and the app tracks PRs, milestones, body measurements and history from what you actually logged. There are no accounts, no nutrition tracking, no social features and no XP or levels. All your data stays on the device.

## What it does

- **Programs and quick workouts.** Build workout templates and multi-week programs, activate one program at a time, and keep a Quick Workout library. Programs can be fixed or sequential (Today shows the current rotation day and only advances when that day is completed).
- **Gym Mode.** Start a workout and log sets with immediate autosave, previous-performance lookup, session notes, rest and timed-exercise timers, skip/replace/add exercise, supersets and circuits, and recovery of an interrupted session.
- **Exercise library.** 1,324 seeded exercises with search and filters, custom exercises, notes, a body-map muscle browser, and looping demonstrations for 64 of them (see attribution below).
- **Substitutions.** Deterministic, offline exercise-substitution scoring.
- **Progress.** PR detection (max load, reps, rep ranges, estimated 1RM, volume, bodyweight, timed, distance) with historical recalculation, per-exercise trend charts, and training distribution.
- **Milestones and benchmarks.** Built-in and custom milestones, plus percentile benchmarks.
- **Body composition.** Manual measurement entry and trend charts.
- **Import / export.** A portable `atlas-plan-v1` format for workouts, programs and full backups, with a paste-text workout parser and preview before anything is applied.
- **Works offline.** It's an installable PWA with a service worker, and there's a Windows desktop shell too.

The layout adapts from phone to wide desktop: bottom navigation on a phone, a sidebar from tablet width up, with content width bounded so nothing stretches across a big monitor. See [docs/ADAPTIVE_UI.md](docs/ADAPTIVE_UI.md) and [docs/MOBILE.md](docs/MOBILE.md).

## Screenshots

I haven't added screenshots to this repo yet. A fresh install starts empty (no programs, no history), so useful captures need a synthetic profile, and I haven't built one for the README. Until then, the best way to see it is to run it (below).

## Built with

TypeScript and React, Vite as a PWA, IndexedDB (Dexie) in the browser, and a Tauri 2 shell with a SQLite adapter for Windows. The domain logic lives in separate packages (`workout-engine`, `program-engine`, `pr-engine`, `progress-engine`, `milestone-engine`, `benchmark-engine`, `substitution-engine`, `import-export` and others) shared by both shells. Tests run on Vitest.

```
apps/web/       the React PWA
apps/desktop/   Tauri 2 shell for Windows
packages/       data model, storage adapters, and the engines above
docs/           architecture, data model, roadmap, security notes
```

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Current status

- **Version:** 1.1.0 (tagged `v1.1.0`; earlier releases from `v0.0.1` through `v1.0.0` are tagged too).
- **Platforms:** the PWA is the main target. The Windows desktop shell builds from `apps/desktop`. I have not published an Android or iOS-native build.
- **Docs drift:** `docs/ROADMAP.md` still lists some later versions as "not started" and is behind the tags. Treat the tags and `package.json` as the source of truth.
- **Out of scope:** nutrition tracking, social features, XP and levels.
- **Planned, not built:** syncing between devices.

## Run it from source

Node 20 or newer. For the desktop shell on Windows you also need Rust and the Tauri 2 prerequisites (WebView2, MSVC build tools).

```bash
npm install
npm run dev          # web app at http://localhost:5173
npm run tauri dev    # desktop shell

npm run lint
npm run typecheck
npm run test
npm run build
```

For the desktop build, go through `npm run tauri build` rather than a raw `cargo build --release`, which can load the dev URL instead of the bundled app.

## Third-party material

Exercise data is MIT-licensed structured data (see [docs/EXERCISE_DATA.md](docs/EXERCISE_DATA.md)). The looping exercise demonstrations come from Workout Guide under CC BY-SA 4.0 ([THIRD_PARTY_MEDIA.md](THIRD_PARTY_MEDIA.md)). The body-map geometry is vendored from `vulovix/body-muscles` under Apache-2.0 ([docs/ANATOMY.md](docs/ANATOMY.md), [LICENSES](LICENSES)).

## License

The application source has no license chosen yet (`package.json` says `UNLICENSED`), so all rights are reserved for now. The third-party material above keeps its own licenses.
