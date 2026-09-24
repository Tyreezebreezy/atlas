# Agent Notes

ATLAS is a personal, local-first fitness/training tracker (React+TS web PWA,
Tauri 2 desktop shell, shared TypeScript core). This file is a short
orientation for an agent working in this repo — the real depth lives in
`docs/*.md`, which this file points into rather than repeats.

## Before touching code

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first — package
boundaries, the planned-vs-performed model, and why packages get created
on demand rather than up front. Then [docs/DATA_MODEL.md](docs/DATA_MODEL.md)
for the entity shapes and the version-by-version history of what was added
and why. [docs/ROADMAP.md](docs/ROADMAP.md) is the actual (not aspirational)
per-version status. Feature-specific docs (PRS, MILESTONES, BENCHMARKS,
BODY_COMPOSITION, SUBSTITUTIONS, EXERCISE_DATA, EXERCISE_MEDIA,
IMPORT_FORMAT, MOBILE, ADAPTIVE_UI, PROGRESS, ANATOMY) go deep on one topic each — check the
table of contents in ARCHITECTURE.md/DATA_MODEL.md for which one covers
what you're touching before assuming something isn't documented.

## Validate

```bash
npm run lint
npm run typecheck
npm run test
npm run build
cd apps/desktop/src-tauri && cargo check && cargo test
npm run tauri build   # only this proves the *packaged* app, not just that Rust compiles
```

All of these should be clean before calling a change done. See
[docs/agent/PROCESS.md](docs/agent/PROCESS.md) for the fuller gate/versioning
convention this repo has followed since v0.0.1.

## Rules that aren't obvious from reading the code

- **Whole-document storage, no migrations.** Both storage backends store
  entities as JSON blobs (or the field-flat equivalent). Adding a field to
  an existing entity needs no migration — old records just lack it at
  runtime despite the required TypeScript type. See docs/DATA_MODEL.md
  ("Migrations") before reaching for a schema-migration pattern that
  doesn't exist here.
- **Packages are created on demand, not speculatively.** A new `packages/*`
  only gets created the first version that gives that concept real logic.
  Don't pre-create an empty package for something planned but not yet
  built. See docs/ARCHITECTURE.md ("Deviation from the original 13-package
  proposal").
- **Never hand-classify the whole 1,324-exercise library.** Curated
  enrichment, movement-family classification, and (as of v0.1.2) media are
  all deliberately populated for a small representative subset, not every
  row. See docs/EXERCISE_DATA.md.
- **No autoplay, anywhere.** Established for exercise media (v0.1.2) but
  applies as a general rule to anything with a play/pause affordance this
  app ever adds.
- **Never rewrite an already-pushed git tag.** Each `vX.Y.Z` tag is
  immutable once pushed — see docs/agent/PROCESS.md.
- **`cargo build`/`cargo check` alone does not prove the desktop app
  works.** It can silently load the Vite dev server instead of the bundled
  frontend. Always go through `npm run tauri build`/`npm run tauri dev` to
  validate the packaged app. See docs/ARCHITECTURE.md.
