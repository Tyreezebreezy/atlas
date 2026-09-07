# Cross-Platform Parity Contract

ATLAS is one React/TypeScript core (`apps/web`) behind the `AtlasStorage`
interface (see docs/ARCHITECTURE.md), currently reachable through two real
shells plus one **planned, not-yet-started** one. This table is the
contract: what's actually shipped and verified per platform as of v0.1.4,
not aspirational.

| Feature                                                                       | Web / PWA (browser, incl. installed iPhone/iPad)                                                           | Windows Desktop (Tauri)              | Android (native)                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| Core workout/program authoring, Quick Workouts                                | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Gym Mode execution, immediate-autosave logging                                | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Timers (rest/exercise, timestamp-based)                                       | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Skip / Replace exercise                                                       | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Add Exercise mid-workout (v0.1.1)                                             | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| Supersets / Circuits (v0.1.1)                                                 | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| Sequential program progression (v0.1.1)                                       | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| Import / Export (`atlas-plan-v1`, v0.1.4 adds HTML import)                    | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| PRs, Milestones, Benchmarks                                                   | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Body Composition                                                              | Full                                                                                                       | Full                                 | PLANNED                                                       |
| Training Distribution (v0.1.1)                                                | Full                                                                                                       | Full¹                                | PLANNED                                                       |
| Exercise Media (v0.1.2 abstraction, v0.1.3 first real media, v0.1.4 deepened) | Full — 97/1,324 exercises have a real demonstration; the rest correctly show none                          | Full²                                | PLANNED                                                       |
| Sport-Tech visual design (v0.1.4)                                             | Full — one token file, every screen re-themes from it                                                      | Full²                                | PLANNED                                                       |
| Offline support                                                               | Full — real service-worker offline verified (v0.1.0); exercise-media lazily cached, not precached (v0.1.3) | Full — native, no network dependency | PLANNED                                                       |
| Production hosting                                                            | Full — deployed, real HTTPS URL, verified live PWA-upgrade path (docs/DEPLOY.md)                           | N/A — packaged installer, not hosted | N/A                                                           |
| Data storage backend                                                          | IndexedDB (Dexie)                                                                                          | SQLite (tauri-plugin-sql)            | Not chosen yet                                                |
| Installable to home screen / as a desktop app                                 | Full (PWA manifest + service worker)                                                                       | Full (native installer)              | N/A — would ship as a native app, not installed via a browser |
| CITADEL sync                                                                  | Not started (v0.3.0) — `SyncMeta` fields exist on every entity since v0.0.1, no sync logic anywhere yet    | Not started (v0.3.0)                 | Not started                                                   |
| Native platform integration (Health Connect, widgets, wearables)              | N/A                                                                                                        | N/A                                  | Not started — see Stage 8 design notes                        |

¹ **Verified via `cargo check`/`cargo test` (Rust compiles, existing Rust
tests pass) only.** v0.1.1, v0.1.2, and v0.1.4 did not touch any file under
`apps/desktop/src-tauri` — same shared frontend code the SQLite adapter has
already exercised in every prior version's real close/reopen/resume/finish
packaged-app testing (see docs/ROADMAP.md v0.0.4 onward) — but a fresh
`npm run tauri build` and interactive walkthrough of _these specific_
features (supersets, sequential programs, Add Exercise, training
distribution, HTML import) in the packaged Windows app has not been
performed (see ² below — still not a full interactive walkthrough, for a
different reason, across v0.1.3 and v0.1.4 alike). Treat as low-risk, not
zero-risk, until that walkthrough happens.

² **Both v0.1.3 and v0.1.4 rebuilt and launched the packaged desktop
app** — fresh `cargo build --release` succeeded each time, the NSIS
installer was produced, the stale WebView2 cache was cleared per the
documented gotcha (docs/ARCHITECTURE.md), and the launched process created
a real, responsive native window (confirmed via `Get-Process`/Win32
`IsWindowVisible`/`IsIconic` — not hung, not crashed). What wasn't
achieved either time: this session's remote-desktop automation could not
reliably click through that window to interactively verify it. The
specific symptom changed between the two attempts (v0.1.3: the window
reported Win32's `(-32000,-32000)` minimized-off-screen sentinel; v0.1.4:
the window reported normal on-screen coordinates and was momentarily
frontmost, but a screen-control tool call against it was blocked by an
app-permission-path mismatch between the freshly-built exe and the
already-granted installed path, and after reinstalling to the granted
path the window's z-order was still unstable against another window
already running on the machine) — different failure mode, same practical
outcome: no successful interactive click-through either time. Most likely
an artifact of how this specific automation environment surfaces and
arbitrates windows, not a code defect (nothing in either release touched
window management, and the exact same class of app has been interactively
verified via packaged builds in every version since v0.0.4). Reported
honestly as unverified rather than papered over. The packaged app's
frontend is byte-identical to the extensively browser-verified web build
(`AtlasStorage`, "One core, two shells" — see docs/ARCHITECTURE.md), so
the risk this leaves open is specifically SQLite-adapter/WebView2-hosting
behavior, not application logic.

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
