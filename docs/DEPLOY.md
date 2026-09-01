# Deploying the ATLAS PWA

## Current production deployment

**<https://atlas-pwa.grand-dormouse.workers.dev>**

Deployed 2026-09-01 as a temporary, zero-login Cloudflare Workers Static
Assets deployment (see "Temporary vs. permanent" below) — a bridge to get
a real, installable, HTTPS PWA onto a phone today, not a replacement for
moving to the owner's own infrastructure (home server / Nginx Proxy
Manager) once that's reachable from wherever ATLAS is being deployed from.
The architecture doesn't change either way: this is the exact same
`apps/web/dist` production build docs/ARCHITECTURE.md already describes,
served statically. No backend, no database, no analytics, nothing
server-side — IndexedDB on the visiting device remains the only place
ATLAS data ever lives.

## Redeploying

```bash
npm run build -w @atlas/web           # produces apps/web/dist
cd apps/web
npx wrangler deploy --assets=./dist --name atlas-pwa --compatibility-date 2026-01-01 --temporary
```

- `--assets=./dist` — deploy the static build directory as-is; no Worker
  script, no server code. `wrangler` uploads only files that changed since
  the last deploy under this name.
- `--name atlas-pwa` — must stay exactly this to redeploy to the **same**
  URL rather than create a new one.
- `--temporary` — uses Cloudflare's zero-login temporary-account flow (see
  below). Once the deployment has been claimed into a real Cloudflare
  account (or once redeploying from the owner's own infrastructure with a
  real `CLOUDFLARE_API_TOKEN`/`wrangler login`), drop this flag.

The whole sequence is two commands and takes under a minute — there's no
separate "build for production" step beyond the normal web build.

## Temporary vs. permanent (read before relying on this URL long-term)

`--temporary` created a **temporary Cloudflare account** ("Grand
Dormouse") with no login, email, or payment info from anyone — Cloudflare
prints a **claim URL**, valid for 60 minutes from creation, that transfers
the deployment into a real, permanent Cloudflare account of the owner's
choosing:

**Claim URL (valid until ~60 minutes after 2026-09-01 deployment time):**
`https://dash.cloudflare.com/claim-preview?claimToken=[redacted]`

What's confirmed: the deployment itself was live and fully verified
(manifest, service worker activated, IndexedDB, the exercise library,
exercise-media static files) within minutes of deploying — that part
doesn't depend on the claim window. What's genuinely **not verified**:
whether the deployment keeps serving _after_ the 60-minute claim window
closes unclaimed, and Cloudflare's actual long-term retention policy for
an unclaimed temporary account (days vs. weeks vs. indefinite isn't
documented publicly as of this writing). This deployment was not left
unclaimed for 60+ minutes to observe what happens. Don't treat this
specific URL as guaranteed-permanent without either claiming it or
redeploying from a real, logged-in account — and if it stops responding
later, redeploying with the same two commands above takes under a minute.

**To make it permanent**: click the claim URL above (or run
`wrangler login` once and redeploy without `--temporary`, which creates a
deployment under the owner's own real Cloudflare account instead).

## Moving to the owner's own infrastructure later

No ATLAS code or build step changes. Once home server/Nginx Proxy
Manager (or any other static host) is reachable, the same
`apps/web/dist` output gets copied/synced there and served over HTTPS the
normal way that host already serves other static sites — `wrangler` and
Cloudflare Workers are incidental to _this_ deployment, not an ATLAS
architecture dependency.
