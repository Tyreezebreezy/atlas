# Third-party notice: anatomical SVG path data

`vendoredMuscleShapes.ts` in this directory is generated from the
**body-muscles** npm package, v1.0.0
(<https://github.com/vulovix/body-muscles>, Apache-2.0, Copyright 2024
Ivan Vulović):

> This product includes software developed by Ivan Vulović.
> https://github.com/vulovix/body-muscles

The full Apache-2.0 license text and the upstream NOTICE file ship verbatim
with the app at `apps/web/public/licenses/body-muscles/` (served as
`/licenses/body-muscles/LICENSE.txt` and `NOTICE.txt`). Provenance details
(pinned version, tarball integrity, what was and wasn't taken) are in the
repo-level `LICENSES/README.md`.

## What was vendored, and what wasn't

Only each shape's `id`, `name` and SVG path `d` were extracted — unmodified
and in upstream order — into a TypeScript data file. That file is a
transformed form of the upstream source, and says so in its header.

ATLAS does **not** use the package's `BodyChart` class, its intensity color
scale (slate→yellow→orange→red), or any of its rendering/event logic, and
`package.json` takes **no** dependency on it. `BodyMap.tsx` renders the
geometry itself, with ATLAS's own component API and color tokens
(`--atlas-muscle-*`).

## Where the ATLAS mapping lives

Nothing ATLAS-specific is stored in the vendored file. How each upstream
shape maps onto ATLAS's canonical muscle taxonomy — including every
intentional shared/fallback mapping — is in `anatomyMapping.ts`, audited by
`anatomyMapping.test.ts`. See `docs/ANATOMY.md`.

## Upgrading

```bash
npm pack body-muscles@<new version> && tar -xzf body-muscles-<new version>.tgz
node scripts/extract-body-muscles.mjs package apps/web/src/anatomy/vendoredMuscleShapes.ts
npm test
```

The test suite pins the upstream shape counts, so it fails until the mapping
and allowlist have been re-reviewed against the new data. Re-read the new
upstream `NOTICE`/`LICENSE` and refresh `apps/web/public/licenses/body-muscles/`
and `LICENSES/README.md` if either changed.
