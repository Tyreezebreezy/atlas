# Future Integration Design Notes

Design notes only, per the handoff that requested them. **Nothing in this
document is implemented, scheduled, or authorized to be built.** Each
section below needs its own separate owner-approved handoff before any
code gets written against it — this file exists so that future handoff
doesn't have to start from a blank page, not to pre-approve the work.

## Health Connect (Android)

Health Connect is Android's on-device, permissioned health-data broker —
apps read/write through it rather than to each other directly. Relevant
only once native Android (docs/ROADMAP.md v0.4.0) exists; there is no way
to integrate with it from the web/PWA or Windows desktop shells, and no
Android shell exists yet (see docs/PLATFORM_PARITY.md).

Rough shape a future design would need to work out:

- **Write direction first.** ATLAS's own `WorkoutSession`/`PerformedSet`
  history is the source of truth; the natural first integration is
  ATLAS → Health Connect (an `ExerciseSession` record per finished
  workout, likely `duration`/`title` at minimum), not the reverse. Reading
  data _from_ Health Connect (e.g. importing sessions logged in another
  app) is a materially bigger scope decision — different data-quality and
  exercise-matching questions than v0.0.9's own import pipeline already
  had to solve (see docs/IMPORT_FORMAT.md) — and shouldn't be assumed
  as part of the same phase.
- **Opt-in, permission-scoped, revocable.** Health Connect's own permission
  model already forces this; ATLAS's UI would need its own explicit toggle
  on top (default off), not just relying on the OS prompt appearing once.
- **Mapping ATLAS's `PersonalRecord`/`Milestone` concepts has no direct
  Health Connect equivalent** — those likely stay ATLAS-only rather than
  forcing a lossy mapping onto a session-and-metrics-shaped external API.

## Android home-screen widget

A platform capability the web/PWA and Windows desktop shells cannot offer
regardless of how the web app itself is built — home-screen widgets are a
native-OS surface, not something a browser or Tauri webview can register.
Waits on native Android for the same reason Health Connect does.

Likely shape: read-only, showing the next planned workout (today's program
day or a suggested Quick Workout) — mirrors what `TodayScreen` already
computes (`docs/DATA_MODEL.md`'s sequential-progression logic included),
so the widget would reuse that read path rather than duplicate the "what's
next" logic. No write actions from the widget itself in a first version —
logging a set from a home-screen widget's constrained surface is a much
harder interaction-design problem than showing one, and isn't needed to
deliver the core "what's my next workout" value.

## Telemetry

**Explicitly out of scope** — docs/ROADMAP.md lists telemetry under
"Out of scope entirely unless explicitly re-authorized," alongside
nutrition tracking, social features, and an AI coach. ATLAS has never
wired in any analytics, crash-reporting, or usage-tracking service; that's
a deliberate local-first/privacy-first stance, not something left undone
by oversight. Documented here only because Stage 8 of the handoff that
requested this file named it explicitly — this section is _not_ a
recommendation to build it.

If a future owner explicitly re-authorizes some form of telemetry (most
plausibly opt-in crash reporting, which is the least privacy-invasive
version of "telemetry"), the non-negotiables a design would need to start
from: opt-in only, default off, no PII, no workout content (exercise
names/weights/notes are exactly the kind of personal data this app's
local-first design exists to keep off a server), and a visible way to see
and revoke consent after the fact, not just at first-run.

## ATLAS API / MCP

A way for something other than the ATLAS UI itself — a script, an LLM
tool, a future CITADEL sync agent — to read or write ATLAS data
programmatically. Distinct from CITADEL sync (docs/ROADMAP.md v0.3.0):
sync replicates data between devices/a server; this is _local_
programmatic access on one device, useful even after sync exists (e.g. an
agent querying "what did I bench last week" or logging a set on your
behalf while you talk to it, entirely offline).

Rough shape a future design would need to work out:

- **Local-only by default.** The natural home is the Tauri desktop shell,
  which can already run a local process — a local HTTP server bound to
  `127.0.0.1` (or an MCP server over stdio, spawned by or alongside the
  desktop app) is the shape that doesn't require inventing any new
  network-facing surface or authentication-over-the-internet story. A
  browser/PWA-only install has no equivalent local-process capability, so
  this is realistically desktop-first, mobile-later-if-ever.
- **Goes through the same `AtlasStorage` interface every screen already
  uses** (docs/ARCHITECTURE.md) — no parallel data-access path, no risk of
  the API and the UI disagreeing about what a `WorkoutSession` looks like.
- **Read operations are the obviously-safe first scope** (query workouts,
  PRs, programs); anything that logs a set or starts/finishes a session on
  the user's behalf needs its own explicit design pass — Gym Mode's
  autosave-every-set model (docs/DATA_MODEL.md) assumes a human is
  driving it in real time, and an API-driven write path bypassing that
  assumption is a bigger decision than exposing it wasn't in this note's
  scope to make.
- **No implicit network exposure.** Whatever transport is chosen, it must
  not become reachable from outside the local machine without a separate,
  explicit, owner-approved decision to do so.
