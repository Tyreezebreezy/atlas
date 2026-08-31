# Mobile & Platform Readiness

Covers ATLAS as an installed PWA today, iPhone/iPad readiness, and what a
future Tauri Android shell would need. See docs/ADAPTIVE_UI.md for the
layout/responsive work itself.

## PWA today

`apps/web/vite.config.ts` configures `vite-plugin-pwa`: name "ATLAS", short
name "ATLAS", `display: 'standalone'`, theme/background colors matching
Stone & Sage (`#F2F0EA`), three icons (192, 512, and a maskable 512).
`index.html` already carries `viewport-fit=cover` (a prerequisite for
`env(safe-area-inset-*)` to do anything on iOS) and a matching
`theme-color` meta tag.

`registerType: 'prompt'` — the app never force-reloads mid-workout
(`UpdatePrompt.tsx`'s own comment cites this explicitly); a user sees an
"ATLAS update available" banner and chooses when to apply it.

**Verified**: the production build (`vite build`) generates a valid
`sw.js` and `manifest.webmanifest`; both are directly fetchable
(`fetch('/sw.js')` → 200, correct content-type) and the manifest parses
with the expected `name`/`display`/`icons`. **Not verified**: live
`navigator.serviceWorker.register()` in this testing environment — it
failed with a generic `TypeError: ... An unknown error occurred when
fetching the script`, despite the same file being directly fetchable
moments earlier by plain `fetch()`. This is consistent with the sandboxed
browser tool used for this pass restricting ServiceWorker registration
specifically (a common safety restriction in automated testing browsers,
since a registered SW gets persistent background execution and can
intercept all future requests to the origin) rather than an ATLAS
configuration problem — the manifest, icons, and generated SW file are all
independently confirmed correct. **Manual check recommended before v0.1.0**:
open the production build in a real Chrome/Edge tab (not an automation
sandbox), confirm the SW registers (Application tab in DevTools), then use
DevTools' Network "Offline" throttling to confirm the offline flow in
section "Offline behavior" below.

## iPhone / iPad readiness

- Safe areas: `env(safe-area-inset-bottom)` already applied to the tab bar
  since before this pass; this pass extended it to `.atlas-shell__content`
  unconditionally so Gym Mode (which has no tab bar) also gets the buffer.
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
  hover (ATLAS has no tooltips-on-hover-only pattern; `TrendChart`'s
  point tooltips are click/focus-triggered by design, documented in
  docs/PRS.md specifically because hover doesn't work on touch).
- Text selection: not specially restricted anywhere; no need found to
  change it.
- Orientation: no orientation lock, no orientation-specific layout branch
  — the same COMPACT-state responsive rules apply regardless of portrait
  vs. landscape, which is the simplest correct behavior for a data-entry
  app like Gym Mode (unlike a game or video player, there's no reason to
  lock orientation).

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
  its own hook (already noted in docs/ARCHITECTURE.md as "nothing about it
  is platform-independent" — both the Tauri desktop webview and the PWA
  use the same web API directly today).

Everything else — `packages/storage`'s `IndexedDbAdapter`/`SqliteAdapter`
split behind the `AtlasStorage` interface, `packages/core`'s
`isTauriRuntime()` runtime switch — already follows the "platform
differences live at the shell/capability layer, business logic stays
shared" rule from docs/ARCHITECTURE.md. `pr-engine`, `milestone-engine`,
`benchmark-engine`, `body-composition`, `workout-engine`, `program-engine`,
`substitution-engine`, and `data-model` have zero platform-specific code in
any of them (no `packages/*` file imports `navigator`, `window`, or a Tauri
API) — confirmed by the same grep sweep.

**Remaining blockers for a real Android shell** (documented, not
addressed — out of scope for this pass): `useWakeLock` and `settings.ts`
would need an Android-appropriate implementation behind the same
call-site shape (Tauri's plugin ecosystem has both a wake-lock and a
storage/preferences plugin that could slot in analogously to how
`SqliteAdapter` slots in for desktop); haptics and native notifications
have no ATLAS code today at all (nothing to migrate, but nothing to reuse
either); a future Health Connect integration would be new surface, not a
refactor of existing code.

## Offline behavior

The service worker (once registered — see the PWA section above) precaches
the app shell (`generateSW` mode, confirmed 20 entries / ~1.8MB in the
production build output, dominated by the exercise seed data chunk — see
"Bundle" in docs/ADAPTIVE_UI.md's sibling findings). Workout execution
itself has no network dependency at all: every read/write goes through
`AtlasStorage` (IndexedDB in the browser, SQLite in Tauri), never a network
call, both already covered by this project's existing persistence tests.
The realistic offline risk is purely "does the _shell_ (JS/CSS/HTML) load
without a network," which is what the service worker's precache exists to
solve — not proven live in this session (see above), but the precache
manifest being generated correctly is a strong, direct signal it will work.

## Manual validation checklist (hardware this environment can't reach)

For the user to run before the v0.1.0 release phase, outside this sandbox:

1. **Real ServiceWorker/offline check**: open the production build in
   real Chrome/Edge, confirm the SW registers (DevTools → Application →
   Service Workers), then DevTools → Network → Offline, reload, confirm
   the app shell still loads and a workout can be started/logged/finished.
2. **Real iPhone/iPad**: Add to Home Screen, confirm standalone display
   (no browser chrome), confirm the bottom nav/Gym Mode actions clear the
   home indicator, confirm no layout jump when the on-screen keyboard
   opens for a number input.
3. **Windows display scaling**: set Windows scaling to 125%/150%/175%/200%
   (Settings → Display), reopen the packaged Tauri app at each, confirm
   text and icons stay sharp (no blur) and no control becomes too small to
   hit accurately. Not automatable from this environment — CSS logical
   pixels and relative units are already used throughout (no raw physical-
   pixel sizing found in `App.css`), so this should hold, but hasn't been
   physically observed on real scaled hardware.
4. **Real multi-monitor**: drag the packaged Tauri window between two
   displays of different physical size/DPI, confirm no stale-measurement
   glitch (the resize-without-reload behavior verified in this pass via
   CDP viewport overrides should cover this, but a real OS-level monitor
   switch wasn't performed here).
