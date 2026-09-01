# Cross-Platform Parity Contract

ATLAS is one React/TypeScript core (`apps/web`) behind the `AtlasStorage`
interface (see docs/ARCHITECTURE.md), currently reachable through two real
shells plus one **planned, not-yet-started** one. This table is the
contract: what's actually shipped and verified per platform as of v0.1.3,
not aspirational.

| Feature                                                          | Web / PWA (browser, incl. installed iPhone/iPad)                                                           | Windows Desktop (Tauri)              | Android (native)                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| Core workout/program authoring, Quick Workouts                   | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Gym Mode execution, immediate-autosave logging                   | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Timers (rest/exercise, timestamp-based)                          | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Skip / Replace exercise                                          | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Add Exercise mid-workout (v0.1.1)                                | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| Supersets / Circuits (v0.1.1)                                    | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| Sequential program progression (v0.1.1)                          | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| Import / Export (`atlas-plan-v1`)                                | Full                                                                                                       | Full                                 | PLANNED                                                       |
| PRs, Milestones, Benchmarks                                      | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Body Composition                                                 | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Training Distribution (v0.1.1)                                   | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| Exercise Media (v0.1.2 abstraction, v0.1.3 real media)           | Full — 64/1,324 exercises have a real demonstration; the rest correctly show none                          | Full²                                | PLANNED                                                       |
| Offline support                                                  | Full — real service-worker offline verified (v0.1.0); exercise-media lazily cached, not precached (v0.1.3) | Full — native, no network dependency | PLANNED                                                       |
| Production hosting                                               | Full — deployed, real HTTPS URL (docs/DEPLOY.md)                                                           | N/A — packaged installer, not hosted | N/A                                                           |
| Data storage backend                                             | IndexedDB (Dexie)                                                                                          | SQLite (tauri-plugin-sql)            | Not chosen yet                                                |
| Installable to home screen / as a desktop app                    | Full (PWA manifest + service worker)                                                                       | Full (native installer)              | N/A — would ship as a native app, not installed via a browser |
| CITADEL sync                                                     | Not started (v0.3.0) — `SyncMeta` fields exist on every entity since v0.0.1, no sync logic anywhere yet    | Not started (v0.3.0)                 | Not started                                                   |
| Native platform integration (Health Connect, widgets, wearables) | N/A                                                                                                        | N/A                                  | Not started — see Stage 8 design notes                        |

¹ **Verified via `cargo check`/`cargo test` (Rust compiles, existing Rust
tests pass) only.** v0.1.1 and v0.1.2 did not touch any file under
`apps/desktop/src-tauri` — same shared frontend code the SQLite adapter has
already exercised in every prior version's real close/reopen/resume/finish
packaged-app testing (see docs/ROADMAP.md v0.0.4 onward) — but a fresh
`npm run tauri build` and interactive walkthrough of _these specific_
features (supersets, sequential programs, Add Exercise, training
distribution) in the packaged Windows app was not performed until v0.1.3
(see ² below — still not a full interactive walkthrough, for a different
reason). Treat as low-risk, not zero-risk, until that walkthrough happens.

² **v0.1.3 did rebuild and launch the packaged desktop app** — fresh
`cargo build --release` succeeded, the NSIS installer was produced, the
stale WebView2 cache was cleared per the documented gotcha
(docs/ARCHITECTURE.md), and the launched process created a real, responsive
native window (confirmed via `Get-Process`/Win32 `IsWindowVisible`/
`IsIconic` — not hung, not crashed). What wasn't achieved: this session's
remote-desktop automation could not get that window to render visibly
across any of the machine's monitors to actually click through it, despite
several restore/foreground/reposition attempts — most likely an artifact of
how this specific automation environment surfaces windows, not a code
defect (nothing this release touched window management, and the exact same
class of app has been interactively verified via packaged builds in every
version since v0.0.4). Reported honestly as unverified rather than
papered over. The packaged app's frontend is byte-identical to the
extensively browser-verified web build (`AtlasStorage`, "One core, two
shells" — see docs/ARCHITECTURE.md), so the risk this leaves open is
specifically SQLite-adapter/WebView2-hosting behavior, not application
logic.

## What "PLANNED" means for Android

Zero code. No `apps/android` (or equivalent) exists. `v0.4.0 Pixel /
Android` in docs/ROADMAP.md is the placeholder; nothing in this row should
be read as partial or in-progress. Per the handoff that authorized this
document, Android work does not start without its own separately
owner-approved handoff — this table exists to make today's real gap
explicit, not to scope that future work.

## Known unverified-on-real-hardware gaps (not Android-specific)

Carried forward from v0.1.0 (docs/MOBILE.md) and still true: physical
iPhone/iPad Home Screen install, real Airplane Mode, and real
backgrounding/keyboard behavior have only been verified via browser
viewport emulation and a killed local dev server, never a physical Apple
device — there is none in this environment. The Windows desktop shell
_has_ been verified on real packaged builds repeatedly (see the ¹ note
above for the one place that verification is currently behind).
