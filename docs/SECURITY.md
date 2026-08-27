# Security & Privacy Notes

ATLAS is a single-user, local-first personal app. Practical local-app security,
not enterprise controls.

- **No telemetry, no analytics, no third-party network calls** by default.
- **No secrets or credentials in the repository.** Nothing to configure yet —
  there is no server component in v0.0.1.
- **Tauri permissions**: least-privilege. `apps/desktop/src-tauri` only enables
  the SQL plugin scoped to the app's own database file — no filesystem,
  shell, or network capability grants beyond what's needed.
- **Imported content** (free text, TXT/MD/JSON plans, future PDFs) is treated as
  untrusted input: parsed and validated, never rendered as raw HTML, never
  executed. Import pipeline (v0.0.9) enforces size limits and format
  allowlisting before anything reaches storage.
- **Local data only.** IndexedDB (web) and a local SQLite file (desktop) never
  leave the device until CITADEL sync (v0.3.0) is built, and CITADEL sync must
  be authenticated and private when it lands — this repo does not implement or
  connect to it yet.
