# Installing ATLAS on iPhone / iPad

**URL**: <https://atlas-pwa-7eq.pages.dev>

(A persistent Cloudflare Pages deployment — see docs/DEPLOY.md for details
and the redeploy command. The install steps below don't change if the
hosting ever moves to the owner's own infrastructure later.)

## iPhone

1. Open the URL above in **Safari** (must be Safari — Add to Home Screen
   for a PWA only works from Safari on iOS, not Chrome/Firefox/other
   browsers even though they can browse the same page).
2. Tap the **Share** button (square with an arrow, in the bottom toolbar).
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name (**ATLAS**) and tap **Add**.
5. Launch ATLAS from the Home Screen icon, not from Safari — the
   Home Screen launch is what opens it in standalone mode (full-screen, no
   browser address bar), which is what all of ATLAS's mobile layout work
   (docs/ADAPTIVE_UI.md, docs/MOBILE.md) was actually built and verified
   against.
6. If you have existing ATLAS data on Windows: More → Import/Export → Full
   ATLAS Backup → Restore, using a backup exported from the Windows app
   first (see "Bringing over existing data" below).
7. Start using ATLAS.

## iPad

Same steps as iPhone above. Additionally check once installed:

- **Portrait**: bottom tab bar, single-column layout (same as iPhone).
- **Landscape**: should still be fully usable — nothing should require
  scrolling sideways.
- From roughly tablet width up, navigation switches from a bottom bar to a
  persistent sidebar (see docs/ADAPTIVE_UI.md) — confirm it reads clearly
  in whichever orientation you actually use most.
- Home Screen launch, same as iPhone — standalone mode, no Safari chrome.

## Bringing over existing data

On the Windows desktop app: **More → Import/Export → Full ATLAS Backup →
Export Full Backup**. This saves a `.json` file containing every Program,
Quick Workout, workout session/history, PR, milestone, and body
measurement — everything except Settings (device-local by design, see
docs/ARCHITECTURE.md) and the canonical exercise library (it reseeds
itself fresh on any new install, so it doesn't need to travel).

On the phone, after installing: **More → Import/Export → Full ATLAS
Backup → Restore**, choose that file. This round trip was verified this
release (docs/DEPLOY.md's testing notes) — the same restore path works
identically whether the file came from Windows/SQLite or another
browser/IndexedDB install, since both write through the same
`AtlasStorage` interface (docs/ARCHITECTURE.md).

## What to actually test once installed (there's no way to verify this without a real device)

**iPhone**

- Home Screen icon looks right, launches standalone (no Safari UI).
- Today screen loads; start a workout.
- Log a weighted set and a bodyweight set.
- Start a rest timer, let it run, background the app, come back — timer
  should reflect real elapsed time, not have paused (timestamp-based, see
  docs/DATA_MODEL.md).
- If you have a superset/circuit programmed: log a full round.
- Try **+ Add Exercise** mid-workout.
- Open an exercise with a demonstration animation (e.g. Bench Press,
  Squat, Deadlift, Pull-Up, Push-Up, Row, Curl, Shoulder Press) and
  confirm it plays as a small looping demo, not a video that autoplays
  loudly or unexpectedly.
- Finish the workout, check it shows up in History.
- Fully close the app (swipe up/away, not just background) and reopen —
  confirm everything you just logged is still there.
- Turn on Airplane Mode, confirm the app still opens and works.

**iPad**

- Install, launch, check portrait and landscape.
- Confirm the demonstration animation and a full workout flow both work
  the same as on iPhone.

Report back anything that looks wrong, especially anything in the list
above — those are exactly the things that can't be truthfully verified
from this side without your hands on the actual hardware.

## Update behavior

When a new version gets deployed to the same URL, ATLAS **never**
force-reloads a phone that has it open — especially not mid-workout. The
update prompt is suppressed entirely while Gym Mode is active and only
offers to reload once you've exited it (see docs/ARCHITECTURE.md, "Timers,
skip, replace (v0.0.5)" / docs/ROADMAP.md's v0.1.0 entry). Your data stays
in IndexedDB across the reload either way — a service-worker update never
touches it. Redeploying is documented in docs/DEPLOY.md.
