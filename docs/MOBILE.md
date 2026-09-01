# Mobile & Platform Readiness

Covers ATLAS as an installed PWA today, iPhone/iPad readiness, and what a
future Tauri Android shell would need. See docs/ADAPTIVE_UI.md for the
layout/responsive work itself.

## PWA today

`apps/web/vite.config.ts` configures `vite-plugin-pwa`: name "ATLAS", short
name "ATLAS", `display: 'standalone'`, theme/background colors matching
Stone & Sage (`#F2F0EA`), three icons (192, 512, and a maskable 512).
`index.html` carries `viewport-fit=cover` (a prerequisite for
`env(safe-area-inset-*)` to do anything on iOS) and a matching
`theme-color` meta tag.

`registerType: 'prompt'` — a reload only ever happens on an explicit user
click. As of v0.1.0, `UpdatePrompt` also checks `useGymMode()` and
suppresses itself entirely while a workout is active, reappearing the
moment the user exits Gym Mode — "never force-reload mid-workout" now
covers "never even offer to" during a set, not just "never reload without
being asked."

**Verified in v0.1.0** (superseding v0.0.8's "not verified" finding — a
production build served via `vite preview`, in this same sandboxed browser
tool that previously blocked it):

- `navigator.serviceWorker.register('/sw.js')` succeeds and reaches
  `state: 'activated'`.
- Its precache (`workbox-precache-v2`, `generateSW` mode) genuinely
  contains the app shell: `/index.html`, both icons, and every JS chunk,
  confirmed via `caches.keys()`/`cache.keys()` — 21 entries.
- **The origin server was killed outright** (not DevTools network
  throttling — the actual `vite preview` process was stopped) and the tab
  reloaded. The app still rendered Today with zero console errors,
  entirely from the service worker's cache.
- With the server still dead: navigated to Program (a lazy `import()`
  chunk), created a Quick Workout, opened Add Exercise (loading the
  ~1.3MB, 1,324-row exercise-library chunk — the largest lazy chunk in the
  app), picked one, saved, started it from Today (another lazy chunk,
  Gym Mode), logged a weighted set, and finished — a full write-path
  round trip (IndexedDB, which is local by construction and was never
  actually at risk) plus every major lazy route chunk, all offline, zero
  console errors throughout.

This is materially stronger evidence than v0.0.8's build-output-only
signal; the offline-first requirement in the v0.1.0 handoff (open, view
Today, start workout, complete sets, finish, History/Progress/PRs/
Milestones/Body) is satisfied for everything exercised above. History,
Progress, PRs, Milestones, and Body were not separately re-driven offline
in this pass, but they read through the exact same `AtlasStorage` calls
already proven to need no network — there's no new offline risk specific
to those screens.

**Still not verified** (this environment has no real mobile hardware):
genuine "Add to Home Screen" + standalone launch + a real network radio
being switched off, on a physical iPhone/iPad — see the manual checklist
below. A sandboxed browser process reaching `activated` and serving from
cache with the dev server dead is strong evidence for a real device too,
but it is not the same as observing one.

## iPhone / iPad readiness

- Safe areas: `env(safe-area-inset-bottom)` applied to the tab bar and,
  since the v0.0.8 hardening pass, unconditionally to
  `.atlas-shell__content` so Gym Mode (no tab bar) also gets the buffer.
  Left/right/top insets aren't used anywhere yet — nothing in the current
  layout sits near those edges in a way a notch/Dynamic Island would
  actually clip; add them if a future header ever goes edge-to-edge.
- Dynamic viewport: no `100vh` anywhere (grep-confirmed) — `height: 100%`
  chained from `html`/`body`/`#root` already avoids the classic mobile
  Safari toolbar-jump bug without needing `dvh`.
- Standalone layout: verified via `display: 'standalone'` in the manifest;
  genuine "Add to Home Screen" behavior on a physical iPhone was not
  tested (no physical device in this environment) — see the manual
  checklist below.
- No hover-only interactions: audited the touch-target pass (docs/ADAPTIVE_UI.md)
  alongside this — didn't find any control that's _only_ reachable via
  hover.
- Text selection: not specially restricted anywhere; no need found to
  change it.
- Orientation: no orientation lock, no orientation-specific layout branch
  — the same COMPACT-state responsive rules apply regardless of portrait
  vs. landscape, which is the simplest correct behavior for a data-entry
  app like Gym Mode.
- Mobile viewport matrix re-verified for v0.1.0 at 360×800, 390×844,
  430×932, 768×1024 (tablet portrait), and 1024×768 (tablet landscape):
  zero page-level horizontal overflow at any size, sidebar nav correctly
  replaces the bottom tab bar from 768px up, Gym Mode's new Last/Best/
  Target row (see docs/ARCHITECTURE.md / GymModeScreen) wraps cleanly at
  the narrowest width tested.

## Data bootstrap (desktop → phone)

v0.0.9's Full ATLAS Backup (`packages/import-export`, More → Import /
Export → Full ATLAS Backup) is the bootstrap path named in the v0.1.0
handoff: export on Windows ATLAS, transfer the file, restore on the
iPhone/iPad PWA. It preserves IDs, timestamps, versions, and device
metadata, and is restorable into a clean database — see
`docs/IMPORT_FORMAT.md`'s "portable vs. raw-ID documents" section. This is
explicitly temporary, ahead of real sync (CITADEL, v0.3.0); no new code
was needed for this handoff item beyond what v0.0.9 already shipped.

## Android-ready architecture

**No native Android shell is being built now** (out of scope, explicitly
deferred to a later version). This section only inspects for unnecessary
blockers.

Platform-dependent code is already isolated, not scattered through
business logic — confirmed by grepping `apps/web/src` for direct
`navigator.*`/`localStorage` usage: exactly two files touch a browser-only
global directly, and both already live in their own small module rather
than being inlined into a screen component:

- `apps/web/src/settings/settings.ts` — `localStorage`, a single JSON blob
  (documented as a deliberate device-local choice in docs/ARCHITECTURE.md,
  not a synced entity).
- `apps/web/src/gym/useWakeLock.ts` — the Screen Wake Lock API, wrapped in
  its own hook (both the Tauri desktop webview and the PWA use the same
  web API directly today).

Everything else — `packages/storage`'s `IndexedDbAdapter`/`SqliteAdapter`
split behind the `AtlasStorage` interface, `packages/core`'s
`isTauriRuntime()` runtime switch — already follows the "platform
differences live at the shell/capability layer, business logic stays
shared" rule from docs/ARCHITECTURE.md. `pr-engine`, `milestone-engine`,
`benchmark-engine`, `body-composition`, `import-export`, `workout-engine`,
`program-engine`, `substitution-engine`, and `data-model` have zero
platform-specific code in any of them — confirmed by the same grep sweep,
re-run for v0.1.0 including the new `import-export` package.

**Remaining blockers for a real Android shell** (documented, not
addressed — out of scope for this pass): `useWakeLock` and `settings.ts`
would need an Android-appropriate implementation behind the same
call-site shape; haptics and native notifications have no ATLAS code
today at all; a future Health Connect integration would be new surface,
not a refactor of existing code.

## Offline behavior

See "Verified in v0.1.0" above for the live result. Mechanically: the
service worker precaches the app shell (`generateSW` mode, 23 entries /
~1.84MB in the v0.1.0 production build, dominated by the exercise seed
data chunk). Workout execution has no network dependency at all: every
read/write goes through `AtlasStorage` (IndexedDB in the browser, SQLite
in Tauri), never a network call.

## Manual validation checklist (hardware this environment can't reach)

For the user to run before treating v0.1.0 as done on a real device:

1. **Real iPhone/iPad Home Screen install**: Safari → Share → Add to Home
   Screen. Confirm the icon, confirm standalone launch (no browser
   chrome/URL bar), confirm the app opens to Today.
2. **Real offline**: with the app already installed/opened once (so the
   service worker has had a chance to install), switch on Airplane Mode,
   relaunch from the Home Screen icon. Confirm Today loads, start a
   workout, log a weighted and a bodyweight set, use a rest timer, finish
   the workout, check History/Progress/PRs/Milestones/Body Composition
   all still render. This environment proved the equivalent with a killed
   dev server in a sandboxed browser (see above); a real device with a
   real radio switched off is the one thing that couldn't be substituted.
3. **Timer backgrounding**: start a rest or exercise timer, background the
   app (Home button/swipe) for at least the timer's duration, return.
   Confirm the timer shows correctly elapsed/expired (timers are
   timestamp-derived, not `setInterval`-driven, so this should hold, but
   wasn't observed on real iOS backgrounding behavior specifically).
4. **On-screen keyboard**: focus a numeric input in Gym Mode (weight/reps),
   confirm the keyboard doesn't obscure the input or cause a layout jump,
   confirm safe-area padding still looks correct with the keyboard open.
5. **Close and reopen**: fully quit the app (swipe away, not just
   background), reopen from the Home Screen. Confirm an in-progress
   workout resumes at the correct exercise (session recovery is already
   covered by the desktop Tauri+SQLite close/reopen tests; this confirms
   the same IndexedDB-backed behavior on iOS Safari's WebKit, which has
   its own history of being stricter about IndexedDB persistence than
   desktop browsers).
6. **Update behavior**: with a workout active, trigger a new deployed
   build (or simulate by bumping the service worker). Confirm no
   "update available" prompt appears until Gym Mode is exited (v0.1.0
   added this gate; see `UpdatePrompt.tsx`).
7. **Windows display scaling**: set Windows scaling to 125%/150%/175%/200%
   (Settings → Display), reopen the packaged Tauri app at each, confirm
   text and icons stay sharp (no blur) and no control becomes too small to
   hit accurately. CSS logical pixels and relative units are already used
   throughout (no raw physical-pixel sizing found in `App.css`), so this
   should hold, but hasn't been physically observed on real scaled
   hardware.
8. **Real multi-monitor**: drag the packaged Tauri window between two
   displays of different physical size/DPI, confirm no stale-measurement
   glitch.
