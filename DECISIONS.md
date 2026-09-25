# Decisions

Choices that are expensive or impossible to reverse, and the reasoning at the
time. Recorded so they are re-litigated on evidence rather than memory.

---

## `www` is canonical, not the apex

**Date:** 2026-08-28 · **Status:** decided, implemented

The apex 301-redirects to `www.pacestreak.com`.

**Why:** consistency with the owner's other domains (`rajpoot.dev`,
`scorefit.net` both redirect apex → www), and DNS portability — `www` is a plain
CNAME that works anywhere, while an apex CNAME depends on Cloudflare's flattening.

**The argument that did NOT apply:** cookie isolation. It is the usual reason to
prefer `www`, but with the API on `api.pacestreak.com` the auth cookie must be
scoped `Domain=pacestreak.com` regardless, so `www` isolates nothing. Identical
blast radius either way.

**Cost to reverse:** ~20 minutes — reverse the redirect rule, update canonical
tags, `og:url`, sitemaps and the status monitors.

---

## AGPL-3.0, not MIT or proprietary

**Date:** 2026-08-28 · **Status:** decided, **irreversible for published code**

`web`, `app`, `blog`, `api` and `infra` are AGPL-3.0. `status` remains MIT because it
is largely upstream Upptime code, which is MIT — relicensing someone else's work
is not ours to do. `.github` is MIT because templates are more useful reusable.

**Why AGPL over GPL:** it closes the hosting loophole. A competitor cannot take
this and run a closed SaaS from it.

**Note:** a permissive licence can be granted later; it cannot be withdrawn once
code is published under it. This direction is one-way.

---

## Deploy from Cloudflare's Git integration, not GitHub Actions

**Date:** 2026-08-28 · **Status:** decided, implemented

Both Pages projects build from their repository on push.

**Why:** no API token to store or rotate, build logs in the same place as the
deploy, and preview deployments come free.

**Superseded:** an Actions-based deploy using `wrangler pages deploy`. It worked,
but required a `CLOUDFLARE_API_TOKEN` secret in every repository for no benefit
once the Git connection existed.

---

## No third-party runtime dependencies on the public sites

**Date:** 2026-08-28 · **Status:** decided, enforced by CSP and CI

Both sites ship `default-src 'self'`. No font CDN, no analytics, no widgets.

**Why:** a status page or public site that depends on a third-party CDN can be
taken down by that CDN. It also keeps the pages at 26KB and 8KB respectively.

**Enforcement:** the CSP blocks violations in the browser — silently — so
`check-html.py` fails the build on inline scripts and `data:` URIs instead.

**Cost of reversing:** low technically, but it is the reason "no tracking" can be
claimed truthfully on the public site.

---

## Documentation over Terraform, for now

**Date:** 2026-08-28 · **Status:** decided, revisit on trigger

**Why:** two Pages projects, nine DNS records and one redirect rule. A `.tf`
file that is never applied is worse than a written record, because it looks
authoritative while drifting.

**Trigger to revisit:** a second environment, or the first time a change is made
in the dashboard that nobody can date or explain.

---

## The product gets its own host, separate from the public site

**Date:** 2026-08-29 · **Status:** decided, not yet implemented

`www.pacestreak.com` serves only the public site
([`web`](https://github.com/PaceStreak/web), formerly `landing`). The signed-in
product is built in [`app`](https://github.com/PaceStreak/app) and will be
served from `app.pacestreak.com`. The alternative — `www.pacestreak.com/app` —
was rejected.

**Why:**

- **The public site must never depend on auth.** It is what a stranger sees
  first, and what the status page reports on. An outage in the product must not
  be able to take down the page that explains the product.
- **Caching policies are opposite.** The public site wants long-lived edge
  caching; signed-in responses must never reach a shared cache. Separate
  origins make that a property of the deployment rather than a per-route rule
  someone eventually forgets.
- **Indexing policies are opposite.** One must be crawled, the other must be
  `noindex`. A single origin serving both invites exactly one mistake in
  `robots.txt` — and this organization has already shipped a `robots.txt` bug
  once, on the blog.

**What it costs:** a third Pages project, a fourth proxied CNAME, and a session
cookie scoped `Domain=pacestreak.com` — which was already required to reach
`api.pacestreak.com`, so the split adds no new exposure. The standing
consequence is that **nothing untrusted may ever be hosted under
`pacestreak.com`**.

**Cost to reverse:** moderate. Merging the two back onto one origin means
reworking cache and indexing rules per route, and unpicking whichever
assumptions the app has made about being alone on its host.

---

## Cloudflare Pages projects are named `pacestreak-<repo>`

**Date:** 2026-08-30 · **Status:** decided, implemented

`pacestreak` was renamed to `pacestreak-web`. Both live projects now match the
repository they build: `pacestreak-web`, `pacestreak-blog`. Anything created
later follows the same rule — `pacestreak-app`, `pacestreak-api`.

**This entry originally said the opposite.** It argued the names had to stay
because a Pages project cannot be renamed, and priced the change at real
downtime plus two certificate re-issues. That reasoning was wrong, and the
mistake is worth keeping rather than deleting because of where it came from:
`wrangler pages project` exposes only `list`, `create` and `delete`, and the
name appears in the `<project>.pages.dev` hostname. Absent from the CLI plus
apparently load-bearing in a hostname read as immutable. **The dashboard renames
it in place.**

**Why it is safe:** the `pages.dev` subdomain does not follow the rename —
`pacestreak-web` still serves `pacestreak.pages.dev`. Nothing is recreated, so
custom domains, certificates, the Git connection and the deployment history all
survive untouched. The rename produced no downtime and no status page incident.

**The lesson worth generalising:** absence from a CLI is evidence about the
CLI, not about the platform. Check the dashboard or the API before concluding
something is impossible — this is the second time that exact inference has been
wrong here, after the direct-upload-to-Git-connected claim in
[TOPOLOGY.md](./TOPOLOGY.md#cloudflare-pages-projects).

## The app is a static SPA shell

**Decided (September 2026).** `app.pacestreak.com` is a React + Vite single-page
app served from Cloudflare Pages, not server-rendered.

Why: it keeps the app in the same operational shape as every other site (Pages,
Git-connected, no runtime), and a shell that holds no user data can be cached
at the edge without ever leaking one person's training data to another.
Offline support comes from IndexedDB and a service worker in the app, not from
the edge.

Cost: a blank first paint until data loads, and auth redirects happen on the
client. Both are acceptable for a signed-in tool used mostly from the home
screen.

## The API's hosting is still open

**Not decided.** FastAPI + Postgres + Redis + a worker cannot run on
Cloudflare's free tier, and Python Workers (Pyodide) rule out this stack there.
The options are a small VPS, a container platform, managed Postgres, or a
rewrite onto Workers + D1. It is the owner's decision because each option
either costs money or breaks the no-third-party stance. Until it is made,
`app` and `api` stay undeployed and have no DNS records.
