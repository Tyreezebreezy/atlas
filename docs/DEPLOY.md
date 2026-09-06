# Deploying the ATLAS PWA

## Current production deployment

**<https://atlas-pwa-7eq.pages.dev>**

A persistent Cloudflare Pages project (`atlas-pwa`, under a real Cloudflare
account — `[redacted-email]`), deployed 2026-09-06. Not
time-limited, not a claim-window trick — replaces the earlier temporary
Workers deployment (`atlas-pwa.grand-dormouse.workers.dev`), which expired
as expected and now 502s. The Pages subdomain got a `-7eq` suffix because
the bare `atlas-pwa.pages.dev` name was already taken by someone else
globally; the **project name** is still exactly `atlas-pwa`.

Same architecture as always: this is the exact same `apps/web/dist`
production build docs/ARCHITECTURE.md describes, served statically. No
backend, no database, no analytics, nothing server-side — IndexedDB on the
visiting device remains the only place ATLAS data ever lives.

Verified live at deploy time: manifest (200, correct content), service
worker (registered, `activated`, survives reload), IndexedDB (`atlas` v10,
1324-exercise library seeds correctly on first Library visit), exercise
media (frame PNGs load, correct CC BY-SA attribution rendered), zero
console errors.

## Redeploying

```bash
npm run build -w @atlas/web           # produces apps/web/dist
npx wrangler pages deploy apps/web/dist --project-name=atlas-pwa --branch=main
```

Run from the repo root. The project already exists, so this uploads a new
deployment to the same `atlas-pwa-7eq.pages.dev` URL — no
`wrangler pages project create` needed again. Requires being logged in as
the account above (`npx wrangler whoami` to check; `npx wrangler login` if
not — opens a browser OAuth prompt, must be run on a machine that can
receive the `localhost` callback).

## Moving to the owner's own infrastructure later

No ATLAS code or build step changes. Once home server/Nginx Proxy
Manager (or any other static host) is reachable, the same
`apps/web/dist` output gets copied/synced there and served over HTTPS the
normal way that host already serves other static sites — Cloudflare Pages
is incidental to _this_ deployment, not an ATLAS architecture dependency.
