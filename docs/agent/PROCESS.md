# Development Process

How this repo has actually been built, version by version, since v0.0.1 —
useful context for picking up work here, whether that's a person or an
agent.

## Versioning

One git tag per version, `vMAJOR.MINOR.PATCH`, always an annotated tag
(`git tag -a`, not lightweight), created only after that version's full
validation gate is green and the working tree is clean. See
docs/ROADMAP.md for the full list and what shipped in each.

Versions through v0.x map to **feature milestones**, not calendar time or
commit count — each one is "the version that added X." A version's own
code comments/tests may say `vX.Y.Z (Stage N)` when the work being added
was itself organized into lettered/numbered sub-stages by whatever handoff
authorized it (e.g. v0.1.1's Stage 4A–4E). Get the actual target version
number right _before_ writing those comments — it's easy to accidentally
reference an already-tagged version that doesn't actually contain the code
being written (a real mistake made and caught during v0.1.1: several new
comments said "v0.1.0" when v0.1.0 was already tagged and pushed days
earlier; fixed by grepping for the wrong version string across the diff
before committing).

**Docs-only stages don't get their own version tag.** If a handoff's stage
list includes pure-documentation work (an AGENTS.md, a parity contract, a
design-notes doc) with no runtime code change, it's folded into the commit
for the nearest preceding or following functional version rather than
invented a version bump of its own — versions in this repo have always
corresponded to a behavior change, and a docs commit alone isn't one.

**Tags are immutable once pushed.** Never re-tag, force-push a tag, or
rewrite a commit an existing tag points at. If a version's already-tagged
state turns out to have been wrong, the fix is a new version, not an
edit to history.

## The validation gate

Before any commit that closes out a version:

```bash
npm run lint
npm run format:check   # or `npm run format` + review the diff is whitespace-only
npm run typecheck
npm run test
npm run build
cd apps/desktop/src-tauri && cargo check && cargo test   # skip only if truly zero Rust files changed
```

All green, working tree clean (`git status`), before tagging. A version
whose Rust side wasn't touched still gets `cargo check`/`cargo test` run
and the result stated explicitly ("unaffected, no Rust changes") rather
than skipped silently — see docs/ROADMAP.md's per-version notes for the
established phrasing.

`npm run format:check` on a fresh Windows checkout can flag files that
have zero real content difference — a `core.autocrlf` line-ending
artifact, not a real formatting problem. Diagnose with
`git diff --ignore-space-at-eol` before assuming genuine drift; the fix is
running the project's own formatter (`npm run format`) and confirming the
resulting diff touches only files actually intended to change, never
editing git config.

## Working through a multi-stage handoff

Large handoffs in this repo's history have been executed as a sequence of
gated stages, continuing automatically stage to stage as long as:

- validation is green and the tree is clean at each stage boundary,
- no destructive migration or data loss is required,
- no genuine architecture conflict shows up between what the handoff
  assumes and what the repo actually contains,
- and no licensing question is left ambiguous (e.g. exercise media — see
  docs/EXERCISE_MEDIA.md for a real instance of a licensing constraint
  shaping what got built).

Stop and surface the issue — rather than guessing — only for something in
that list, or for an instruction that conflicts with itself or with the
verified state of the repo. Routine implementation choices (which file a
new function lives in, how to name a type, whether a UI element needs a
new CSS class) get decided and documented in code comments/docs, not
escalated.
